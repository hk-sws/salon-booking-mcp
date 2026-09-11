# Salon Voice-Agent Booking API

Multi-tenant REST backend for LiveKit voice agents. First tenant is **Bloom Salon**,
but every endpoint is scoped by `companyId`, so the same deployment serves any
appointment-based business without code changes.

- **Node 20 + Express + TypeScript**
- **Google Cloud Firestore** — Firestore **emulator** locally (in Docker), real
  Cloud Firestore in production (e.g. on Azure)
- **Zod** request validation, **Swagger** docs, **luxon** timezones
- MVC + service layering; pluggable notification providers; idempotent POSTs
- Every agent-facing value ships twice: machine-readable + a `*Spoken` phrase the
  TTS reads verbatim (`800` → "eight hundred rupees", `14:30` → "half past two in
  the afternoon")

---

> 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** has Mermaid diagrams: system context,
> the layered request pipeline, data model, the availability engine, and the
> end-to-end booking sequence.

## Architecture (MVC + Service)

```
src/
  config/        firestore.ts (client), swagger.ts (OpenAPI spec)
  models/        types.ts (domain types), collections.ts (Firestore access)   ← Model
  validators/    schemas.ts (Zod for every request)
  middleware/    validate, errorHandler, rateLimit, idempotency
  services/      company, service, stylist, availability, booking,
                 message, notification, dateResolve, admin                     ← business logic
  controllers/   read, availability, bookings, misc, admin                     ← Controller
  routes/        *.routes.ts (Express + OpenAPI JSDoc), index.ts               ← View (API surface)
  providers/     notification.ts (email: console / smtp / brevo)
  lib/           spoken, time, errors, cache, ids
  db/            seed.ts
  app.ts, index.ts
livekit-tools.json   requests.http
```

Request flow: **route** → `validate` (Zod) → `idempotency` (POST) → **controller**
→ **service** → **model/Firestore**. Errors throw `ApiError`; the error middleware
renders `{ error, message, spoken, details }` — a stack trace never reaches `spoken`.

---

## Run locally with Docker (recommended)

Brings up the Firestore emulator + the API. **No GCP credentials needed.**

```bash
docker compose up --build
```

- API:      http://localhost:3000
- Swagger:  http://localhost:3000/docs
- Health:   http://localhost:3000/api/v1/health

On first boot the DB is empty, so the app **auto-seeds** Bloom Salon (9 services,
4 stylists, ~15 bookings, 1 stylist-holiday block). Set `SEED_ON_START=false` to
skip. Re-seed anytime with `POST /api/v1/admin/seed?companyId=salon-01`.

### Expose it publicly (ngrok)

To let a hosted LiveKit agent or a teammate reach your local server, put an ngrok
tunnel in front of it — see **[NGROK.md](./NGROK.md)** (install, `ngrok http 3000`,
public HTTPS URL, running the smoke test through the tunnel, and security notes).

### Run without Docker

Start just the emulator in Docker and the app on the host:

```bash
docker compose up firestore -d
cp .env.example .env          # keep FIRESTORE_EMULATOR_HOST=localhost:8080
npm install
npm run seed                  # optional; boot also seeds
npm run dev
```

Other scripts: `npm start`, `npm run typecheck`, `npm test`.

---

## Endpoints (base path `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/business` | Static tenant facts, collapsed spoken hours |
| GET  | `/services` | Menu + prices/durations + who performs each (`bookableOnly`) |
| GET  | `/stylists` | Stylists & skills (`serviceId` filter). Never availability |
| GET  | `/availability` | **Core.** Computed slots; empty → `nextAvailable` counter-offer |
| POST | `/bookings` | Create (server re-validates; idempotent; 409 + alternatives) |
| GET  | `/bookings/find` | Upcoming bookings by phone/reference; `withinCancellationWindow` |
| POST | `/bookings/:id/cancel` | 422 + `action:CREATE_MESSAGE` inside the window |
| POST | `/bookings/:id/reschedule` | Atomic move to a re-validated slot |
| POST | `/messages` | Escalation catch-all |
| POST | `/notifications/confirmation` | Pluggable send; failure never fails a booking |
| POST | `/resolve-date` | "next Thursday" → ISO date (agent never does date math) |
| GET  | `/health` | Liveness |
| GET/POST | `/admin/*` | bookings, messages, blocks, seed (humans, not agents) |

`livekit-tools.json` holds JSON-Schema function definitions for the agent-facing
subset (admin excluded), each described for a model.

---

## One full booking flow

```
resolve_date  "next Thursday"        → 2026-09-24
check_availability svc_haircut, that date, limit 6
                                     → offer slots, caller picks 14:00 with Kavya
create_booking (Idempotency-Key)     → 201 { reference "B370", confirmedSpoken }
send_confirmation email               → 202 per-channel status
# later:
find_booking by phone                → withinCancellationWindow computed
cancel_booking                       → 200, OR 422 action:CREATE_MESSAGE if <24h,
                                       then create_message to escalate
```

`requests.http` has a runnable example of every endpoint.

---

## Firestore credentials (real Cloud Firestore / Firebase)

**Local dev with the emulator needs nothing** (it ignores auth). To connect to the
real project you need a **service-account key** — base64-encoded into `.env`.

### How to get the service-account key

1. **Firebase console** → open project **`salon-agent-392ac`**.
2. ⚙️ **Project settings** → **Service accounts** tab.
3. Click **Generate new private key** → **Generate key**. A JSON file downloads.
   *(This is a service-account key — despite the name, it is NOT the Android
   `google-services.json`. In this repo the file happens to be saved as
   `google-services.json`; the contents are what matter: `"type":"service_account"`.)*
4. Put that file in the project root (any name; this repo uses `google-services.json`).
   It is **git-ignored** — never commit it.
5. *(One-time)* Make sure **Firestore is created in Native mode** (Firebase console →
   Build → Firestore Database). Region here: **`asia-south1`**.

### How the key is wired (base64 in `.env`)

Instead of shipping the JSON file, we encode it into a single env var — cleaner for
Azure app settings / CI secrets, and the code reads it directly:

```bash
# 1) encode the key to one base64 line
base64 -i google-services.json | tr -d '\n'

# 2) put the output in .env
GOOGLE_CLOUD_PROJECT=salon-agent-392ac
FIREBASE_SERVICE_ACCOUNT_BASE64=<paste the base64 here>
# and leave FIRESTORE_EMULATOR_HOST commented out so host commands hit the real DB
```

`.env` is loaded automatically (via `dotenv`) by `npm run dev`, `npm start`,
`npm run seed`, and `npm run test:firestore`. Decoding lives in
`src/config/firestore.ts`.

> ✅ This is already set up in this repo: the key from `google-services.json` has
> been base64-encoded into `.env`, and `npm run test:firestore` confirms a live
> read/write against `salon-agent-392ac`.

### Verify + populate

```bash
npm run test:firestore   # writes/reads/deletes a temp doc; prints the target mode
npm run dev              # boots against the real DB; auto-seeds Bloom Salon if empty
```

> Alternative to base64: mount the JSON file and set
> `GOOGLE_APPLICATION_CREDENTIALS=/secrets/firestore-sa.json` — `firestore.ts`
> supports both. Only env vars change between local and prod.

> Firestore composite-index note: the current queries filter/sort mostly in memory
> to avoid index setup. If you move heavy filtering into Firestore queries later,
> add composite indexes on `bookings (companyId, stylistId, startAt)` and
> `bookings (companyId, customerPhone, startAt)`.

---

## Notifications — confirmation email (Brevo / SMTP)

Bookee confirmations are **email only**. They go through a pluggable provider
(`src/providers/notification.ts`); default is a **console** provider that logs the
rendered message. Switch with `NOTIFY_PROVIDER`:

### Brevo (recommended)

```bash
NOTIFY_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxxxxxxx               # Brevo dashboard -> SMTP & API -> API Keys
BREVO_SENDER_EMAIL=no-reply@yourdomain.com   # must be a VERIFIED sender/domain in Brevo
BREVO_SENDER_NAME=Bloom Salon
```

Email uses Brevo's `POST /v3/smtp/email`. No extra npm dependency — it uses Node's
built-in `fetch`. A failed send is recorded per-channel and **never** fails the booking.

### SMTP (incl. Brevo's SMTP relay)

```bash
NOTIFY_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER=<brevo login> SMTP_PASS=<brevo smtp key>
SMTP_FROM="Bloom Salon <no-reply@bloom.example>"
```

**What to share for Brevo:** the **API key** and a **verified sender email** (or verified
domain). That's all I need to switch it on.
