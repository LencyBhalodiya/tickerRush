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

const email = `signin-test-${Date.now()}@example.com`;
const freshEmail = `signup-test-${Date.now()}@example.com`;
const password = "correct horse battery";
let server: Server;
let baseUrl: string;

function post(path: string, body: object) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

before(async () => {
  // Same cluster, separate database: tests never touch real accounts.
  await mongoose.connect(config.MONGODB_URI, { dbName: "ticker-rush-test" });
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/auth`;

  const res = await post("/signup", { name: "Sign-in Test", email, password });
  assert.equal(res.status, 202);
});

after(async () => {
  const ids = (await AuthAccountModel.find({ email: { $in: [email, freshEmail] } })).map((account) => account._id);
  await AuthTokenModel.deleteMany({ userId: { $in: ids } });
  await AuthAccountModel.deleteMany({ _id: { $in: ids } });
  server.closeAllConnections();
  server.close();
  await mongoose.disconnect();
});

test("valid credentials return an access token and set the refresh cookie", async () => {
  const res = await post("/signin", { email: email.toUpperCase(), password });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");

  const body = await res.json();
  assert.equal(body.user.email, email);
  assert.ok(body.accessToken);
  assert.equal(body.refreshToken, undefined);

  const [cookie] = res.headers.getSetCookie();
  assert.ok(cookie?.startsWith("refresh_token="));
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth"]) {
    assert.ok(cookie.includes(attribute), `cookie is missing ${attribute}`);
  }

  // Only the hash is stored, never the token itself.
  const token = cookie.slice("refresh_token=".length, cookie.indexOf(";"));
  assert.ok(await AuthTokenModel.exists({ tokenHash: hashToken(token), type: "refresh" }));
});

test("wrong password and unknown email get the identical 401", async () => {
  const wrongPassword = await post("/signin", { email, password: "not the password" });
  const unknownEmail = await post("/signin", { email: `nobody-${Date.now()}@example.com`, password });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
});

test("signing up with a registered email looks exactly like a new sign-up", async () => {
  const fresh = await post("/signup", { name: "New Person", email: freshEmail, password });
  const taken = await post("/signup", { name: "Impostor", email: email.toUpperCase(), password: "a different password" });

  assert.equal(taken.status, fresh.status);
  assert.deepEqual(await taken.json(), await fresh.json());

  // The original account kept its name and password.
  const signIn = await post("/signin", { email, password });
  assert.equal(signIn.status, 200);
  assert.equal((await signIn.json()).user.name, "Sign-in Test");
});

test("sign-up stores a 24-hour verification token as a hash, and a taken email adds none", async () => {
  const account = await AuthAccountModel.findOne({ email });
  assert.equal(account?.emailVerifiedAt, null);

  // The token is created after the 202 has gone out, so give it a moment.
  const query = { userId: account?._id, type: "email_verification" as const };
  let record = await AuthTokenModel.findOne(query).select("+tokenHash");
  for (let tries = 0; !record && tries < 50; tries++) {
    await sleep(100);
    record = await AuthTokenModel.findOne(query).select("+tokenHash");
  }
  assert.ok(record, "no verification token was created");

  assert.match(record.tokenHash, /^[0-9a-f]{64}$/, "stored value is not a sha256 hash");
  const hoursLeft = (record.expiresAt.getTime() - Date.now()) / 3_600_000;
  assert.ok(hoursLeft > 23 && hoursLeft <= 24);
  // The "Impostor" sign-up in the previous test must not have created a second one.
  assert.equal(await AuthTokenModel.countDocuments(query), 1);
});

test("a verification link works once, then the same link is rejected", async () => {
  const account = await AuthAccountModel.findOne({ email });
  assert.ok(account);
  const token = createLinkToken();
  await AuthTokenModel.create({
    tokenHash: hashToken(token),
    userId: account._id,
    type: "email_verification",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const first = await post("/verify-email", { token });
  assert.equal(first.status, 200);
  assert.ok((await AuthAccountModel.findById(account._id))?.emailVerifiedAt);

  const again = await post("/verify-email", { token });
  assert.equal(again.status, 400);
  assert.equal((await again.json()).code, "INVALID_VERIFICATION_TOKEN");
});

test("the 6th failed attempt for one email from one IP is rate limited", async () => {
  const target = { email: `brute-${Date.now()}@example.com`, password: "guess" };
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await post("/signin", target)).status, 401);
  }
  assert.equal((await post("/signin", target)).status, 429);
});
