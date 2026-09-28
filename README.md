# Pay & Park

Parking management and booking system for a Pay & Park business in Kalyan, Maharashtra.

One repository holding two applications and the code they share:

| Path | What it is |
|---|---|
| [`apps/api`](apps/api) | Next.js 16 (App Router) + Prisma + MySQL. The backend for the Android app today, and the customer website + admin web dashboard in Phase 2. |
| [`apps/mobile`](apps/mobile) | Expo / React Native Android app, customer **and** admin in one binary. |
| [`packages/shared`](packages/shared) | Enums, Zod schemas, the API response envelope and money helpers used by both. |

The full business specification lives in `_/context.txt`, and the decisions that
resolved its open questions in `_/decisions.md`. That folder is intentionally
untracked — it is planning material, not source.

---

## Quick start

```bash
npm install
```

**Backend**

```bash
cp apps/api/.env.example apps/api/.env   # then set DATABASE_URL and AUTH_SECRET
npm run db:migrate                        # creates the schema in MySQL
npm run db:seed                           # AppSetting defaults
npm run dev:api                           # http://localhost:3000
```

`AUTH_SECRET` is required — the API will not start without it:

```bash
openssl rand -base64 32
```

`CRON_SECRET` is what the booking-expiry sweep authenticates with
([Expiry](#expiry-contexttxt-15)). The API boots without it, but the sweep
answers `503` until it is set, so unfinished bookings never expire:

```bash
openssl rand -hex 32
```

```bash
curl -s http://localhost:3000/api/health
```

```json
{"ok":true,"data":{"status":"ok","database":"up","databaseLatencyMs":4,"version":"0.1.0","environment":"development","uptimeSeconds":6,"timestamp":"..."}}
```

Create the first admin — there is no in-app path to one, see
[Authentication](#authentication):

```bash
npm run admin:create -- --email you@example.com --name "Your Name"
```

**Mobile app**

```bash
cp apps/mobile/.env.example apps/mobile/.env   # set EXPO_PUBLIC_API_BASE_URL
npm run dev:mobile
```

`npm run dev:mobile` starts Metro expecting a **dev client** (see
[Why a dev client](#why-a-dev-client)). Build and install one once per device:

```bash
cd apps/mobile && npx eas-cli@latest build --profile development --platform android
```

`npm run start:go -w mobile` will open in Expo Go instead. Email/password sign-in
works there, but the **Google button will not appear** — the native module is not in
Expo Go, and `src/lib/google-auth.ts` hides the button rather than offering one that
can only fail. Use the dev client to test Google sign-in.

**Everything at once**

```bash
npm run typecheck && npm run lint
```

---

## Why this repo layout

A single repository with npm workspaces, and deliberately no Turborepo or Nx.

**One repo, not two.** The backend and the app are built by the same person in
the same week, and every phase from 02 onward changes both sides together — an
endpoint and the screen that calls it. Two repositories would mean two PRs and a
version-skew question for every one of those changes. One repo also means the
Zod schema an endpoint validates with and the schema its form validates with can
be *the same file* rather than two files someone has to remember to update.

**Workspaces, not a monolith.** `apps/api` and `apps/mobile` have genuinely
incompatible toolchains — Next's bundler and Metro, and as it happens two
different TypeScript majors. They need separate `package.json` files and separate
`node_modules` resolution. npm workspaces gives exactly that and nothing else.

**A root React pin.** The root `package.json` declares `react`/`react-dom` at
Expo SDK 57's version purely to keep **one** copy of React in the tree: the
`prisma` CLI pulls in `@prisma/studio-core`, whose loose React peer range
otherwise lets npm hoist a second, newer React beside it — two copies fail
`expo-doctor`'s duplicate-native-module check, and a native build must contain
exactly one. Nothing at the root imports React.

**No Turborepo/Nx.** Those earn their keep on build-graph caching across many
packages. Here there are two apps and one source-only package; the "build graph"
is `prisma generate → next build`, and Metro does not use the dependency graph a
task runner would cache. It would be configuration to maintain with nothing to
show for it. The root `package.json` scripts do the job:

```
npm run dev:api        npm run db:migrate     npm run typecheck
npm run dev:mobile     npm run db:seed        npm run lint
npm run build:api      npm run db:studio      npm run admin:create
```

**npm, not pnpm.** pnpm's symlinked store needs extra Metro configuration to
work with React Native; npm's flat hoisting is what Metro expects. For a two-app
repo the install-speed difference is not worth the extra failure mode during
launch week.

---

## Shared typing strategy

`packages/shared` is a **source-only TypeScript package**: no build step, no
`dist/`, `main` points straight at `src/index.ts`. Both apps compile it as part
of their own build — Next via `transpilePackages`, Metro via `watchFolders` in
[`apps/mobile/metro.config.js`](apps/mobile/metro.config.js). So editing a shared
schema hot-reloads in both apps with nothing to rebuild in between.

It holds four things:

- **Enum values** (`BookingStatus`, `PaymentStatus`, `VehicleType`, …) as
  `as const` arrays, with the union type and a Zod enum derived from each.
- **Zod schemas** — the API validates request bodies with them, the app uses the
  same schema as its React Hook Form resolver. Request/response *types* are
  `z.infer`'d from the schemas rather than declared separately, so a schema and
  its type cannot disagree.
- **The API envelope** (`ApiResponse<T>`, error codes, pagination) so every
  endpoint answers in one shape and the client has one place to handle failure.
- **Money helpers** — see [Money](#money).

### What it deliberately does not do

It does **not** re-export Prisma's types, and it never imports `@prisma/client`.
Prisma's generated client is Node-only; pulling it into the shared package would
drag it into the React Native bundle. So the DB enums are declared twice: once in
`prisma/schema.prisma` for MySQL, once here for the app.

Two declarations of one truth is a real cost, and the way it usually goes wrong
is someone adds `VehicleType.TEMPO` to the schema and forgets the shared file, at
which point the app silently fails to render a vehicle type. So that drift is a
**compile error**, not a runtime surprise:
[`apps/api/lib/enum-parity.ts`](apps/api/lib/enum-parity.ts) asserts exact type
equality between each Prisma enum and its shared counterpart. Adding a value to
one side and not the other fails `npm run typecheck` on the line naming the enum
that drifted.

There is no generated API client (no tRPC, no OpenAPI codegen). Route handlers
and the screens calling them are written in the same commit by the same person;
the shared Zod schemas already pin down the contract, and a codegen step is
another thing to keep running during launch week.

---

## Authentication

Auth.js (NextAuth v5) on a **JWT session strategy** — `decisions.md` D3. No
`Session` or `Account` tables: nothing needs persisting between requests beyond
the `User` row.

Two providers, both Credentials, both ending in the same token:

| Provider | Credential | Checked by |
|---|---|---|
| `credentials` | email + password | bcrypt against `User.passwordHash` |
| `google-mobile` | a Google **ID token** | `google-auth-library`, server-side |

`google-mobile` is a Credentials provider rather than Auth.js's stock Google
provider because that one is a browser OAuth redirect, and a React Native app has
nowhere to come back to. The app runs the native Google flow itself, gets an ID
token, and posts it; the backend verifies the signature against Google's keys and
the `aud` against this project's own OAuth client IDs before reading a single
claim (`apps/api/lib/auth/google.ts`).

### Two transports, one token

| Client | Carries the token as | Signs in via |
|---|---|---|
| Expo app | `Authorization: Bearer <token>` | `POST /api/auth/{register,login,google}` |
| Phase 2 website | the `authjs.session-token` cookie | Auth.js's own `/api/auth/*` |

The app does not use Auth.js's endpoints, because it cannot usefully: `signIn()`
answers a browser with a redirect and a `Set-Cookie`, so a native client would have
to post a CSRF double-submit pair to `/api/auth/callback/credentials`, follow a
redirect it does not want, scrape `Set-Cookie`, and turn
`?error=CredentialsSignin` back into a sentence a customer can read. Instead there
are four small JSON handlers that call the *same* `lib/auth/users.ts` functions the
`authorize` callbacks call, and mint the token directly.

Both paths therefore produce the **identical** token. Auth.js JWTs are encrypted
(JWE), with the key derived by HKDF from `AUTH_SECRET` and a salt that defaults to
the session *cookie name* — so `lib/auth/session.ts` pins that name, `auth.ts`
overrides Auth.js's cookie to match, and one `getToken()` call reads either
transport. That is why `requireRole` authorises a browser cookie and a mobile
Bearer header with no branch.

One consequence worth knowing before the VPS gets its certificate: the cookie name
depends on `AUTH_URL`'s scheme (`__Secure-` prefix on https), so **switching
`AUTH_URL` from http to https invalidates every existing session**, exactly as
rotating `AUTH_SECRET` would.

### Where authorisation happens

`role` lives in the JWT claims, and that copy is used for exactly one thing: the
app choosing which navigation stack to open (context.txt §19). It is **not** what
grants access.

Every protected route handler calls `requireUser` / `requireRole` from
[`apps/api/lib/auth/guard.ts`](apps/api/lib/auth/guard.ts), which verifies the
token and then **re-reads the `User` row**. One primary-key read per request, and in
exchange:

- demoting an admin or disabling a user (§22) takes effect on their next request,
  not whenever their 30-day token happens to expire;
- promoting someone to `ADMIN` in MySQL works immediately server-side, and the app
  picks the new role up from `GET /api/auth/me` on its next launch.

The role is never read from a header, a body field or a query parameter anywhere in
this codebase (context.txt §4). A tampered app build can open the admin *screens*;
every admin *endpoint* still answers it 403.

### The first admin

There is deliberately no in-app path to `ADMIN` — no endpoint, no screen, no
request field. New accounts get `USER` from the schema default. The first admin is
made out of band:

```bash
npm run admin:create -- --email you@example.com --name "Your Name"
```

Existing account → promoted (and re-enabled if disabled), keeping the password it
already has. New account → created, with a strong generated password printed once
unless you pass `--password`.

Not in `prisma/seed.ts`, because a seed runs on every deploy: a default admin there
would be a known credential on the production VPS forever, and re-seeding could
quietly reinstate an account the business had disabled. The script grants nothing
that shell access to the VPS did not already grant — it just hashes the password
properly instead of you writing `UPDATE User SET role = 'ADMIN'` by hand.

### Verifying Phase 02

With the API running:

```bash
npm run verify:auth -w api
```

19 checks: registration, duplicate email, a request that asks for `role: "ADMIN"`
and gets `USER` anyway, sign-in, identical refusal messages for a wrong password
and an unknown email, token tampering, and `403` for a `USER` calling
`/api/admin/users` directly. Point it elsewhere with `API=https://… `. It leaves one
throwaway `@example.invalid` account behind per run.

Two things it cannot check, because they need a real device and a real Google
account — do these by hand on the dev client:

1. Sign in with Google, then confirm a matching row appears:
   `SELECT email, googleId, role FROM User;`
2. `UPDATE User SET role = 'ADMIN' WHERE email = '…';` then relaunch the app — it
   should open the admin stack, and the "Check admin-only API" button there should
   answer 200.

### Not in Phase 02

Password reset is a stub (`/forgot-password` says to contact the office) —
`decisions.md` D1 puts the booking loop ahead of transactional email, and a
half-built reset link is an account-takeover path. There is also **no rate limiting
on sign-in**: doing it properly needs shared state, because PM2 runs more than one
process (Phase 11), so an in-memory counter would be security theatre. Both are
tracked for after Thursday.

---

## Money

Every rupee amount is an **integer count of paise** — ₹70 is `7000` — and every
such field is named `...InPaise` so a rupee value cannot be assigned to one by
mistake. Reasons, in order: no floating-point rounding error; survives JSON as a
plain number (a Prisma `Decimal` becomes a string and needs decimal.js in the app
bundle); and it is already the unit Razorpay's API takes, so the future gateway
(context.txt §13) needs no conversion layer.

`formatInr` in [`packages/shared/src/money.ts`](packages/shared/src/money.ts)
does the display side, with Indian digit grouping (`₹12,34,567`).

---

## Database

MySQL via Prisma 7. [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma)
is annotated throughout with the `context.txt` sections each model implements —
read it top to bottom and the mapping from §7-§14 should need no further
explanation. The four things worth knowing before reading it:

1. **Booking status and payment status are separate enums on separate models**
   (`Booking.status`, `Payment.status`) and are never collapsed — context.txt
   §14 and §32. "Can this vehicle park?" and "did the money arrive?" are
   different questions, and the whole UPI flow depends on being able to answer
   them differently at the same time.
2. **Bookings snapshot their price and package.** An admin changing a rate must
   not rewrite what last week's bookings cost, so `Booking` copies
   `amountInPaise`, `rateLabel`, `durationMinutes`, `vehicleNumber` and
   `vehicleType` at creation time. `rateId` is kept alongside for traceability,
   but nothing reads a price through it.
3. **No slot or inventory tables**, per `decisions.md` D2. A booking is
   `{location, vehicle, rate, startTime, endTime}`. `ParkingLocation.capacity`
   is a plain number for the admin dashboard. If the business later confirms
   physical numbered slots (context.txt §8, §25), that is a new `ParkingSlot`
   table plus a nullable `slotId` on `Booking` — nothing here forecloses it.
4. **Nothing is hard-deleted.** Retired locations, rates and vehicles get
   `isActive = false`, and required relations use `onDelete: Restrict` so no row a
   receipt or revenue report depends on can be deleted out from under it.

Prisma 7 notes, since they differ from most examples you will find: the
connection URL lives in [`apps/api/prisma.config.ts`](apps/api/prisma.config.ts)
rather than in `schema.prisma`; the client is generated by the newer
`prisma-client` generator into `apps/api/generated/prisma` (gitignored,
regenerated by `npm run db:generate`); and MySQL is reached through the
`@prisma/adapter-mariadb` driver adapter, configured in
[`apps/api/lib/db.ts`](apps/api/lib/db.ts).

---

## Why a dev client

The Android app is an Expo **managed** project — no `android/` directory in the
repo, native code generated by EAS Build from `app.config.ts`. But it cannot run
in Expo Go, which only contains the native modules Expo chose to bundle. This app
needs three that are not in that set:

- Google Sign-In (`decisions.md` D3),
- `expo-secure-store`, for the session JWT,
- `expo-notifications`, for booking status pushes (D4).

So development runs against a custom **dev client** — an APK containing this
project's native modules, installed once per device, after which `npm run
dev:mobile` reloads JS into it exactly as Expo Go would.
[`apps/mobile/eas.json`](apps/mobile/eas.json) defines it:

| Profile | Produces | For |
|---|---|---|
| `development` | APK, `developmentClient: true` | day-to-day development |
| `preview` | APK, production JS | **the Thursday launch build** (`decisions.md` D1 — sideloaded APK, not a Play Store release) |
| `production` | AAB | the later Play Store submission |

Each profile sets `APP_VARIANT`, which `app.config.ts` turns into a distinct
Android package name — so the dev client and the launch APK can sit on the same
phone at once.

`expo-secure-store` and `expo-notifications` are installed already, in Phase 01,
even though nothing uses them until Phases 02 and 09. Adding a native module
means rebuilding the dev client; having them present now means one fewer rebuild
mid-launch-week.

---

## Bookings

`POST /api/bookings` takes **three ids** — location, vehicle, rate — and nothing
else. The backend reads `ParkingRate.priceInPaise` and derives `amountInPaise`,
`startTime` and `endTime` (from the rate's `durationMinutes`) itself, because
context.txt §32's first line is that the customer never controls the payable
amount. `BookingCreateRequestSchema` has no amount field at all, so a tampered
one is dropped by Zod before any handler sees it, and the created booking is
priced from the rate whatever the request said.

The rate is re-read and re-validated at creation — active, belonging to that
location, and matching the vehicle's own type — because the `rateId` came from a
list the app fetched minutes ago and an admin can reprice or retire a rate at any
time (§24). Its price and label are then **snapshotted onto the booking**, so a
later price change cannot rewrite what an existing booking cost.

### Two statuses, never one

`Booking.status` and `Payment.status` are separate enums on separate tables and
neither is derived from the other (context.txt §14, §32). "Can this vehicle
park?" and "did the money arrive?" are different questions, and a UPI booking is
routinely settled on one axis while still moving on the other. Both are
independently queryable: `GET /api/bookings?status=…&paymentStatus=…`.

A booking has no `Payment` row until the customer picks a method (Phase 06),
because `Payment.method` cannot be null — so `payment: null` on a `PENDING`
booking is the honest answer, not a missing default.

### The state machine

[`packages/shared/src/bookings.ts`](packages/shared/src/bookings.ts) holds the
legal transitions as two declarative tables (`BOOKING_TRANSITIONS`,
`PAYMENT_TRANSITIONS`) with an ASCII diagram of the whole lifecycle above them.
They live in the shared package, not the API, so the app, the API and the Phase 2
website check the same rules. Two properties they exist to guarantee:

- **`CONFIRMED` is reachable only from `PAYMENT_VERIFICATION` or
  `PENDING_APPROVAL`** — that is, only through an admin decision. No customer
  action and no amount of UTR typing can confirm a booking (§32).
- **Terminal means terminal.** `REJECTED`, `CANCELLED`, `EXPIRED` and
  `COMPLETED` have no outgoing moves, and a type-level assertion in that file
  fails the build if the table and `TERMINAL_BOOKING_STATUSES` ever disagree.

[`apps/api/lib/bookings/transitions.ts`](apps/api/lib/bookings/transitions.ts) is
the only code that writes either status. It checks the table, writes with a
conditional `updateMany` guarded on the status it just read (so the expiry sweep
and a customer submitting a UTR cannot both win), stamps the matching timestamp
column, and appends a `BookingStatusEvent` — all in one transaction. Phases 06-08
call it rather than writing a status themselves.

### Expiry (context.txt §15)

An unfinished booking is held for `booking.expiryMinutes` (`AppSetting`, default
10, falling back to `BOOKING_EXPIRY_MINUTES`) and then expired by a sweep at
`POST /api/cron/expire-bookings`, authenticated with `CRON_SECRET` as a bearer
token and compared in constant time.

It is a route hit by the system cron, not a framework scheduler, because the
target is a plain VPS under PM2 (`decisions.md` D1) where serverless cron
features do not exist. On the VPS:

```bash
* * * * * curl -fsS -m 30 -X POST -H "Authorization: Bearer $CRON_SECRET" https://api.example.in/api/cron/expire-bookings >/dev/null
```

Every minute, against a 10-minute window, so a lapsed booking stops claiming to
be payable within a minute. An in-process `setInterval` was the alternative and is
worse: PM2 runs more than one instance, so it would sweep once per instance with
nothing to curl.

The sweep only touches `PENDING` and `PENDING_PAYMENT` — the states where the
system is waiting on the **customer**. A booking in `PAYMENT_VERIFICATION` or
`PENDING_APPROVAL` is waiting on an admin, and expiring it would punish a
customer for admin latency and could discard a booking that was genuinely paid
for. Per `decisions.md` D2 there is no slot inventory, so "releasing held state"
is the status change itself plus clearing `expiresAt`.

### Verifying Phase 05

With the API running, against a **development** database:

```bash
npm run verify:bookings -w api
```

46 checks covering the three acceptance criteria: a booking POSTed with a
tampered `amountInPaise`, `status`, `bookingNumber`, `startTime` and `endTime` is
created correctly priced with every one of them ignored; a booking whose
`expiresAt` is back-dated flips to `EXPIRED` on the next real sweep run, with an
audit row and no actor; and two bookings — one `PAYMENT_VERIFICATION` /
`VERIFICATION_PENDING`, one `EXPIRED` with no payment row — separate correctly
under `?status=` and `?paymentStatus=`. It also checks ownership scoping, the
vehicle-type/rate match, the sweep's authentication, and that cancelling twice is
refused with `INVALID_STATE_TRANSITION`.

Back-dating one row is the "shortened interval" the acceptance criterion asks
for: it exercises the real production code path in a second, rather than needing
a dev-only override on the endpoint that would then exist in production.

---

## Repository conventions

- **Business rules live in the backend, never in the app** (context.txt §28, §32).
  The client never computes a price, never decides a status transition, and never
  sends an amount. The Phase 2 website has to reach the same answers from the
  same endpoints.
- **The database decides `role`, and nothing else.** The app has no code path that
  grants admin access (context.txt §4). The JWT's `role` claim picks a navigation
  stack; `requireRole` re-reads the `User` row before allowing anything. See
  [Authentication](#authentication).
- **Anything a non-developer may need to change** — business name, UPI ID,
  receipt footer, parking prices — lives in the database (`AppSetting`,
  `ParkingRate`), not in `.env` and never in the APK. Changing a price must not
  need a new build (context.txt §24).
- **One place writes a status.** Booking and payment statuses only ever change
  through `lib/bookings/transitions.ts`, against the transition tables in
  `@parking/shared`. A handler that needs a new move adds it to the table, where
  the whole lifecycle can be read at once. See [Bookings](#bookings).
- **`.env.example` is the contract.** Every variable a phase adds gets documented
  there, with what it is for and where to get it.
- **`EXPO_PUBLIC_*` variables are public.** They are inlined into the JS bundle
  and readable by anyone with the APK. No secrets there, ever.

---

## Environment requirements

- **Node 20.19.4+** (or 22.13+ / 24.3+) — the engine range Expo SDK 57's Metro
  declares. `.nvmrc` pins 22.13.0. Phase 01 was verified on 20.19.2, which prints
  an `EBADENGINE` warning on install but does bundle successfully; upgrade before
  relying on it.
- **MySQL 5.7+ or MariaDB 10.2+**, for JSON column support.

---

## Where each phase lands

| Phase | Backend | Mobile |
|---|---|---|
| 01 Setup ✅ | schema, `/api/health`, `lib/` | stacks, stores, demo form |
| 02 Auth ✅ | Auth.js v5, JWT, Google ID token verification, `requireRole` | sign-in/sign-up, role redirect, SecureStore token |
| 03 Profile & vehicles ✅ | `User`/`Vehicle` CRUD | profile, vehicle forms |
| 04 Locations & rates ✅ | admin CRUD, public reads, Kalyan seed | location + package pickers, admin rate screens |
| 05 Booking flow ✅ | transition table, booking creation, expiry sweep | vehicle picker, package confirm, booking summary, bookings list |
| 06 Payments | method selection, UTR submission | UPI QR + UTR, cash |
| 07 Admin approval | approve/reject | approval queue |
| 08 Receipt | receipt endpoint | receipt screen, PDF |
| 09 Push | `PushToken` registration, sends | permissions, deep links |
| 10 Dashboard & reports | aggregation endpoints | dashboard, reports |
| 11 Deployment | Nginx, PM2, HTTPS | EAS `preview` APK |
