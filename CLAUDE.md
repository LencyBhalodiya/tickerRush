# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

tickerRush is a project for practicing system design ideas (message queues, Redis, etc.). It has two packages: `server/`, an Express 5 + MongoDB (Mongoose) API in TypeScript, and `front-end/`, a Next.js (App Router) client that so far only has the signup page.

## Commands

### server

Run these from `server/`. Node 24 is required (`engines: >=24 <25`). Scripts load env through Node's built-in `--env-file=.env`, not dotenv, so copy `.env.example` to `.env` first.

```bash
npm run dev            # tsx watch mode on src/server.ts
npm run build          # tsc -> dist/
npm start              # run dist/server.js
npx tsc --noEmit       # typecheck only
```

There is no test runner and no linter yet. `npm test` is the default placeholder and always fails.

### front-end

Run from `front-end/`. `npm run dev` serves on port 5173, the origin the server's `CORS_ORIGIN` allows, and `npm run build` also typechecks. The API base URL comes from `NEXT_PUBLIC_API_URL` (copy `.env.example` to `.env.local`) and falls back to `http://localhost:3000`.

Styling is plain CSS Modules, with the color tokens in `app/globals.css`, fonts loaded through `next/font`, and no UI library. The signup form copies the server's zod limits into native input constraints (`required`, `minLength`, …), shows those messages inline, and maps 409/422 responses back onto the fields.

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

- All `/auth` routes share one rate limiter, which counts per IP in memory.
- Passwords are hashed with argon2id. Fields that hold secrets (`passwordHash`, `tokenHash`) use `select: false`.
- Access and refresh tokens are HS256 JWTs signed with `jose`, using separate secrets. Each carries a `kind` claim that verification checks.
- Refresh, password-reset and email-verification tokens are supposed to be stored as sha256 hashes in `AuthTokenModel`, which has a TTL index on `expiresAt`.
- `requireAuth` puts `{ id, role }` on `req.auth`. `requireRole(...roles)` must be mounted after it.
- `signIn` and `refresh` are still stubs that return 501.

## Conventions

- In `server/`, ESM-style imports under `module: NodeNext`, so relative imports **must** end in `.js` (`./auth.service.js`), even in `.ts` source. `front-end/` uses bundler resolution, so its imports have no extension.
- Use zod for validation. `joi`, `express-rate-limit` and `nodemailer` are installed but not used yet.
