import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { app } from "../../app.js";
import { config } from "../../config/env.js";
import { AuthTokenModel } from "./auth-token.model.js";
import { AuthAccountModel } from "./auth.model.js";
import { hashToken } from "./auth.tokens.js";

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

test("the 6th failed attempt for one email from one IP is rate limited", async () => {
  const target = { email: `brute-${Date.now()}@example.com`, password: "guess" };
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await post("/signin", target)).status, 401);
  }
  assert.equal((await post("/signin", target)).status, 429);
});
