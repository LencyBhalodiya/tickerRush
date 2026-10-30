import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { decodeJwt } from "jose";
import mongoose from "mongoose";
import { app } from "../../app.js";
import { config } from "../../config/env.js";
import { AuthTokenModel } from "./auth-token.model.js";
import { AuthAccountModel } from "./auth.model.js";
import { createAuthTokens, hashToken } from "./auth.tokens.js";

// Its own file, so its own process and a fresh in-memory rate limiter: these tests make 16 of the 20 allowed requests.
const email = `session-test-${Date.now()}@example.com`;
const password = "correct horse battery";
const DAY_MS = 24 * 60 * 60 * 1000;
let server: Server;
let baseUrl: string;

function post(path: string, cookie?: string, body?: object) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify(body ?? {}),
  });
}

/** "refresh_token=<jwt>", ready to send back as a Cookie header. */
function cookieOf(res: Response): string {
  const [cookie = ""] = res.headers.getSetCookie();
  return cookie.split(";")[0];
}

const tokenOf = (cookie: string) => cookie.slice("refresh_token=".length);

async function signIn(): Promise<string> {
  const res = await post("/signin", undefined, { email, password });
  assert.equal(res.status, 200);
  return cookieOf(res);
}

before(async () => {
  await mongoose.connect(config.MONGODB_URI, { dbName: "ticker-rush-test" });
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth`;
  assert.equal((await post("/signup", undefined, { name: "Session Test", email, password })).status, 202);
});

after(async () => {
  const account = await AuthAccountModel.findOne({ email });
  await AuthTokenModel.deleteMany({ userId: account?._id });
  await AuthAccountModel.deleteOne({ _id: account?._id });
  server.closeAllConnections();
  server.close();
  await mongoose.disconnect();
});

test("refresh swaps the cookie for a new one and keeps the original sign-in time", async () => {
  const first = await signIn();
  const res = await post("/refresh", first);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.user.email, email);
  assert.ok(body.accessToken);

  const second = cookieOf(res);
  assert.notEqual(second, first);
  assert.equal(decodeJwt(tokenOf(second)).auth_time, decodeJwt(tokenOf(first)).auth_time);
  const old = await AuthTokenModel.findOne({ tokenHash: hashToken(tokenOf(first)) });
  assert.ok(old?.revokedAt, "the old token should be revoked");
});

test("logout ends the session and clears the cookie, with or without one", async () => {
  const cookie = await signIn();
  const res = await post("/logout", cookie);

  assert.equal(res.status, 204);
  assert.match(res.headers.getSetCookie()[0], /^refresh_token=;.*Expires=Thu, 01 Jan 1970/);
  assert.equal((await post("/refresh", cookie)).status, 401);
  assert.equal((await post("/logout")).status, 204);
});

test("two refreshes at once both succeed, but replaying the old token later ends every session", async () => {
  const otherDevice = await signIn();
  const first = await signIn();

  const [tabA, tabB] = await Promise.all([post("/refresh", first), post("/refresh", first)]);
  assert.equal(tabA.status, 200);
  assert.equal(tabB.status, 200);

  // Pretend the rotation happened a minute ago, past the grace window.
  await AuthTokenModel.updateOne({ tokenHash: hashToken(tokenOf(first)) }, { revokedAt: new Date(Date.now() - 60_000) });

  const replay = await post("/refresh", first);
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).code, "INVALID_REFRESH_TOKEN");
  assert.equal((await post("/refresh", cookieOf(tabA))).status, 401);
  assert.equal((await post("/refresh", otherDevice)).status, 401);
});

test("refresh without a valid cookie is rejected", async () => {
  assert.equal((await post("/refresh")).status, 401);
  assert.equal((await post("/refresh", "refresh_token=not-a-jwt")).status, 401);
});

test("refreshing never extends a session past 30 days from sign-in", async () => {
  const signedIn = new Date(Date.now() - 29 * DAY_MS);
  const { refreshExpiresAt } = await createAuthTokens({ id: "x", name: "x", email, role: "user" }, signedIn);
  assert.equal(refreshExpiresAt.getTime(), signedIn.getTime() + 30 * DAY_MS);
});
