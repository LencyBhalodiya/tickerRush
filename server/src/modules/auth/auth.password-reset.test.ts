import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import mongoose from "mongoose";
import { app } from "../../app.js";
import { config } from "../../config/env.js";
import { AuthTokenModel } from "./auth-token.model.js";
import { AuthAccountModel } from "./auth.model.js";
import { createLinkToken, hashToken } from "./auth.tokens.js";

const email = `reset-test-${Date.now()}@example.com`;
const oldPassword = "correct horse battery";
const newPassword = "a brand new passphrase";
let server: Server;
let baseUrl: string;

function post(path: string, body: object) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Reset tokens are created after the reply, so wait for that background work to land.
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  for (let tries = 0; tries < 50; tries++) {
    const value = await read();
    if (done(value)) return value;
    await sleep(100);
  }
  assert.fail("timed out waiting for background work");
}

before(async () => {
  await mongoose.connect(config.MONGODB_URI, { dbName: "ticker-rush-test" });
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth`;
  // Left unverified on purpose: like an account someone else registered with this email first.
  assert.equal((await post("/signup", { name: "Reset Test", email, password: oldPassword })).status, 202);
});

after(async () => {
  const account = await AuthAccountModel.findOne({ email });
  await AuthTokenModel.deleteMany({ userId: account?._id });
  await AuthAccountModel.deleteOne({ _id: account?._id });
  server.closeAllConnections();
  server.close();
  await mongoose.disconnect();
});

test("forgot-password gives every email the same 202, and a registered one gets a 1-hour link", async () => {
  const known = await post("/forgot-password", { email });
  const unknown = await post("/forgot-password", { email: `nobody-${Date.now()}@example.com` });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());

  const account = await AuthAccountModel.findOne({ email });
  assert.ok(account);
  const record = await waitFor(
    () => AuthTokenModel.findOne({ userId: account._id, type: "password_reset" }),
    (found) => found !== null,
  );
  const minutesLeft = (record!.expiresAt.getTime() - Date.now()) / 60_000;
  assert.ok(minutesLeft > 59 && minutesLeft <= 60);
});

test("a reset link sets the password once, confirms the email and ends every session", async () => {
  const account = await AuthAccountModel.findOne({ email });
  assert.ok(account);
  const anHour = new Date(Date.now() + 60 * 60 * 1000);
  // A session from before the reset, such as one belonging to whoever registered this email first.
  const oldSession = hashToken(createLinkToken());
  await AuthTokenModel.create({ tokenHash: oldSession, userId: account._id, type: "refresh", expiresAt: anHour });
  // Stands in for the emailed link: tests send no email, so make a token whose value we know.
  const token = createLinkToken();
  await AuthTokenModel.create({ tokenHash: hashToken(token), userId: account._id, type: "password_reset", expiresAt: anHour });

  // Validation runs before the token is claimed, so a too-short password doesn't use up the link.
  assert.equal((await post("/reset-password", { token, password: "short" })).status, 422);
  assert.equal((await post("/reset-password", { token, password: newPassword })).status, 200);
  assert.equal(await AuthTokenModel.exists({ tokenHash: oldSession }), null);

  assert.equal((await post("/signin", { email, password: oldPassword })).status, 401);
  // 200, not 403: the reset link proved the inbox, so the email now counts as confirmed.
  assert.equal((await post("/signin", { email, password: newPassword })).status, 200);

  const again = await post("/reset-password", { token, password: newPassword });
  assert.equal(again.status, 400);
  assert.equal((await again.json()).code, "INVALID_RESET_TOKEN");
});
