import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import mongoose, { type Types } from "mongoose";
import { app } from "../../app.js";
import { config } from "../../config/env.js";
import { AuthTokenModel } from "./auth-token.model.js";
import { authEmailQueue, startEmailWorker } from "./auth.emails.js";
import { AuthAccountModel } from "./auth.model.js";
import { createLinkToken, hashToken } from "./auth.tokens.js";

const email = `verify-test-${Date.now()}@example.com`;
const password = "correct horse battery";
let server: Server;
let baseUrl: string;
let emailWorker: ReturnType<typeof startEmailWorker>;

function post(path: string, body: object) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function linkHashes(userId: Types.ObjectId): Promise<string[]> {
  const records = await AuthTokenModel.find({ userId, type: "email_verification" }).select("+tokenHash");
  return records.map((record) => record.tokenHash);
}

// Verification tokens are created after the reply, so wait for that background work to land.
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
  // Emails are sent by the worker, as in the real server. Tests use their own Redis key prefix.
  emailWorker = startEmailWorker();
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth`;
  assert.equal((await post("/signup", { name: "Verify Test", email, password })).status, 202);
});

after(async () => {
  const account = await AuthAccountModel.findOne({ email });
  await AuthTokenModel.deleteMany({ userId: account?._id });
  await AuthAccountModel.deleteOne({ _id: account?._id });
  server.closeAllConnections();
  server.close();
  await emailWorker.close();
  await authEmailQueue.close();
  await mongoose.disconnect();
});

test("resend gives every email the same 202, and swaps an unverified account's link for a new one", async () => {
  const account = await AuthAccountModel.findOne({ email });
  assert.ok(account);
  const [original] = await waitFor(() => linkHashes(account._id), (hashes) => hashes.length === 1);

  const resent = await post("/resend-verification", { email });
  const unknown = await post("/resend-verification", { email: `nobody-${Date.now()}@example.com` });
  assert.equal(resent.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await resent.json(), await unknown.json());

  // Only the newest link works: the old token is gone once the new one exists.
  await waitFor(() => linkHashes(account._id), (hashes) => hashes.length === 1 && hashes[0] !== original);
});

test("an unverified account can't sign in until its link is used, and the link works once", async () => {
  const blocked = await post("/signin", { email, password });
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, "EMAIL_NOT_VERIFIED");

  // Stands in for the emailed link: tests send no email, so make a token whose value we know.
  const account = await AuthAccountModel.findOne({ email });
  assert.ok(account);
  const token = createLinkToken();
  await AuthTokenModel.create({
    tokenHash: hashToken(token),
    userId: account._id,
    type: "email_verification",
    expiresAt: new Date(Date.now() + 60_000),
  });

  assert.equal((await post("/verify-email", { token })).status, 200);
  assert.equal((await post("/signin", { email, password })).status, 200);

  const again = await post("/verify-email", { token });
  assert.equal(again.status, 400);
  assert.equal((await again.json()).code, "INVALID_VERIFICATION_TOKEN");
});
