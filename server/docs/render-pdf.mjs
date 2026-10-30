// Renders architecture.html to architecture.pdf with headless Chrome, but only after Mermaid has
// finished drawing (the page sets <body data-rendered>). Uses the DevTools protocol over Node's
// built-in fetch/WebSocket, so it needs Chrome but no npm packages. Override the binary with CHROME=...
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const html = new URL("./architecture.html", import.meta.url);
const pdf = new URL("./architecture.pdf", import.meta.url);
const profile = await mkdtemp(join(tmpdir(), "docs-chrome-"));
const chrome = spawn(
  process.env.CHROME ?? "google-chrome",
  ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" },
);

async function retry(what, attempt, tries = 300) {
  for (let i = 0; i < tries; i++) {
    const value = await attempt().catch(() => undefined);
    if (value !== undefined) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

try {
  // Chrome writes its chosen debugging port to DevToolsActivePort in the profile directory.
  const port = await retry("Chrome to start", async () => (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
  const page = await retry("a page target", async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find((target) => target.type === "page");
  });

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => Object.assign(ws, { onopen: resolve, onerror: reject }));
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    pending.get(message.id)?.(message);
  };
  let nextId = 0;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, ({ result, error }) => (error ? reject(new Error(error.message)) : resolve(result)));
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.navigate", { url: html.href });
  const status = await retry("Mermaid to finish", async () => {
    const { result } = await send("Runtime.evaluate", { expression: "document.body?.dataset.rendered" });
    return result.value;
  });
  if (status !== "true") throw new Error(`Diagram rendering failed: ${status}`);

  const { data } = await send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
  await writeFile(pdf, Buffer.from(data, "base64"));
  console.log(`Wrote ${pdf.pathname}`);
  ws.close();
} finally {
  // Chrome keeps writing to its profile until it exits, so wait before deleting it.
  const exited = once(chrome, "exit");
  chrome.kill();
  await exited;
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
