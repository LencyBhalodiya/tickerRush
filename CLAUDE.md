# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

tickerRush is a project for practicing system design ideas (message queues, Redis, etc.). It has two packages: `server/`, an Express 5 + MongoDB (Mongoose) API in TypeScript, and `front-end/`, a Next.js (App Router) client with signup, sign-in and account pages.

## Commands

### server

Run these from `server/`. Node 24 is required (`engines: >=24 <25`). Scripts load env through Node's built-in `--env-file=.env`, not dotenv, so copy `.env.example` to `.env` first.

```bash
npm run dev            # tsx watch mode on src/server.ts
npm run build          # tsc -> dist/
npm start              # run dist/server.js
npx tsc --noEmit       # typecheck only
npm test               # node:test over src/**/*.test.ts, with NODE_ENV=test (logging off)
npm run docs:pdf       # docs/architecture.html → docs/architecture.pdf (needs Google Chrome, plus network access for Mermaid and Google Fonts)
```

**Keep the architecture doc current.** `server/docs/architecture.pdf` is committed, and its source is `server/docs/architecture.html` (Mermaid diagrams plus tables). Any change to server routes, middleware, rate limits, security controls, tokens, models, error codes or env variables must update the HTML in the same change. That includes the "Last updated" line and the "Known gaps" table. Then run `npm run docs:pdf` and commit both files. The doc covers the back-end only.

Tests use Node's built-in `node:test` and `fetch` against `app.listen(0)`, with no supertest. They connect to the same `MONGODB_URI` but override `dbName` to `ticker-rush-test`, and each test removes the accounts it creates. `node --test` runs each file in its own process, so each file gets a fresh in-memory rate limiter (20 auth requests). That's why refresh and logout tests live in `auth.session.test.ts`. There is no local MongoDB, so `npm test` needs network access to Atlas. There is no linter yet.

### front-end

Run from `front-end/`. `npm run dev` serves on port 5173, the origin the server's `CORS_ORIGIN` allows, and `npm run build` also typechecks. The API base URL comes from `NEXT_PUBLIC_API_URL` (copy `.env.example` to `.env.local`) and falls back to `http://localhost:3000`.

Styling is plain CSS Modules, with the color tokens in `app/globals.css`, fonts loaded through `next/font`, and no UI library.

- The `app/(auth)/` route group holds `/signup`, `/signin` and `/account`. They share `auth.module.css` and `ticket-form.tsx`, which provides the `Ticket` shell, `Field`, `useFieldErrors`, `nativeErrors` and `serverFieldErrors`.
- The forms copy the server's zod limits into native input constraints (`required`, `minLength`, …) and show those messages inline. 422 responses are mapped back onto the fields. The deliberately vague 401 from sign-in goes in the form banner.
- All API calls go through `postJson` in `app/api.ts`, which sends `credentials: "include"`. Without that, the browser won't store the cross-origin `refresh_token` cookie.
- `SessionProvider` (`app/session.tsx`, mounted in the root layout) keeps `{ user, accessToken }` in React state only, never in localStorage. On page load it restores the session from the cookie by calling `/auth/refresh` once. A module-level promise makes sure StrictMode's double effect sends only one request. The session is `undefined` while that check runs and `null` when signed out. The sign-out button is on `/account`.

## Architecture

- `server.ts` connects to MongoDB **before** it starts listening. If the connection fails, the process exits. It also handles graceful shutdown (SIGINT/SIGTERM, plus uncaught exceptions and unhandled rejections), closing the HTTP server and then Mongo.
- `app.ts` sets up middleware in this order: helmet → cors → pino-http → json body parser. It serves `GET /health`, mounts `apiRouter` at `/api/v1`, and finishes with the not-found and error handlers.
- `routes.ts` is the root router. Each feature module adds its own router here, for example `apiRouter.use("/auth", authRouter)`.
- `config/env.ts` validates `process.env` with zod when the module is imported, then exports `config`, which is the parsed env (keys stay as `config.PORT`, `config.JWT_ACCESS_SECRET`, …) plus `isProduction`. Read settings from `config`, never from `process.env` directly. A new env var goes in two places: the zod schema and `.env.example`.

### Module layout (`src/modules/<feature>/`)

Follow the `auth` module's pattern:
- `*.routes.ts`: the router, with `validateBody(schema)` from `common/middleware/validate.ts` placed in front of each handler.
- `*.validation.ts`: zod schemas. `*.types.ts` gets its input types from them with `z.infer`.
- `*.controller.ts`: thin `RequestHandler`s that call the service and shape the HTTP response.
- `*.service.ts`: the business logic, as plain exported async functions. Controllers import the module as a namespace (`import * as authService from "./auth.service.js"`).
- `*.model.ts`: the Mongoose schema and model.

### Error handling

- To fail a request, throw `new AppError(status, message, CODE)`. `error.middleware.ts` returns `{ code, message }` for `AppError`s, `422 { code: "VALIDATION_ERROR", errors }` for `ZodError`s, and a generic 500 for anything else.
- Express 5 forwards rejected promises from async handlers to the error handler, so controllers have no try/catch.
- Log with `req.log` (pino-http) inside a request and with the shared `logger` from `config/logger.ts` elsewhere. Log structured objects, e.g. `logger.info({ event, userId }, "msg")`. The logger redacts password and token fields, so give secrets those field names.

### Auth specifics

- All `/auth` routes share one rate limiter: 20 requests per IP per 15 minutes, counted in memory. `/refresh` counts too, so each full page load uses one. `cookie-parser` is mounted on `authRouter` only. `/signin` also has two limiters that count only failed attempts: 5 per (IP + email) and 10 per email. Both run after validation, so the email is already normalised.
- `signUp` returns the same `202 { message }` whether or not the email is already registered. It always hashes the password and attempts the insert. A duplicate-key error (11000) from the unique email index is logged as `signup_email_taken` and otherwise ignored. Don't add an `exists()` pre-check or bring back a 409: either one shows whether an email is registered again (a pre-check through faster replies).
- `signIn` returns the same `401 INVALID_CREDENTIALS` for an unknown email and for a wrong password. For an unknown email it still checks against a dummy argon2 hash, so both cases take the same time. It returns `{ user, accessToken }` with `Cache-Control: no-store`. The refresh token is set only as a `refresh_token` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`), and its sha256 hash is stored in `AuthTokenModel`.
- Passwords are hashed with argon2id. Fields that hold secrets (`passwordHash`, `tokenHash`) use `select: false`.
- Access and refresh tokens are HS256 JWTs signed with `jose`, using separate secrets. Each carries a `kind` claim that verification checks.
- Refresh, password-reset and email-verification tokens are supposed to be stored as sha256 hashes in `AuthTokenModel`, which has a TTL index on `expiresAt`.
- `requireAuth` puts `{ id, role }` on `req.auth`. `requireRole(...roles)` must be mounted after it.
- `refresh` reads only the `refresh_token` cookie, never the body. It rotates the token on every call: an atomic `findOneAndUpdate` sets `revokedAt`, so of two requests with the same token only one can claim it.
  - Only rotation sets `revokedAt`; logout and reuse detection delete the record instead.
  - A revoked token that comes back more than `ROTATION_GRACE_MS` (10 s) after rotation is treated as stolen: every refresh token of that user is deleted. Within those 10 s, the second request gets a new pair of its own, which covers two tabs loading at the same time.
  - Sessions end after 7 idle days, and 30 days after sign-in at most (`SESSION_MAX_DAYS`). The sign-in time is carried in the `auth_time` claim and copied forward on each rotation.
- `logout` deletes this device's record, clears the cookie with the same options it was set with, and always returns 204. It doesn't use `requireAuth`. The access token stays valid until it expires.
- The server compiles to CommonJS (`package.json` has no `"type": "module"`), so top-level `await` is not available.

## Conventions

- In `server/`, ESM-style imports under `module: NodeNext`, so relative imports **must** end in `.js` (`./auth.service.js`), even in `.ts` source. `front-end/` uses bundler resolution, so its imports have no extension.
- Use zod for validation. `nodemailer` is installed but not used yet.
