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
  providers/     notification.ts (console / smtp / sms)
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
send_confirmation email+sms          → 202 per-channel status
# later:
find_booking by phone                → withinCancellationWindow computed
cancel_booking                       → 200, OR 422 action:CREATE_MESSAGE if <24h,
                                       then create_message to escalate
```

`requests.http` has a runnable example of every endpoint.

---

## Firestore credentials — what to share for production

**Local dev needs nothing** (the emulator ignores auth). For a real Cloud Firestore
database (e.g. when deploying to Azure), share:

1. **GCP project id** — e.g. `bloom-salon-prod`.
2. **Firestore in Native mode** enabled in that project (one-time, in the GCP console).
3. **A service-account JSON key** with Firestore access — role **`Cloud Datastore User`**
   (`roles/datastore.user`), enough for read/write. Create under
   *IAM & Admin → Service Accounts → Keys → Add key (JSON)*.
4. *(Optional)* the Firestore **region/location** you chose (e.g. `asia-south1`),
   for latency awareness.

Then set, and leave `FIRESTORE_EMULATOR_HOST` **unset**:

```bash
GOOGLE_CLOUD_PROJECT=bloom-salon-prod
GOOGLE_APPLICATION_CREDENTIALS=/secrets/firestore-sa.json   # path to the JSON key
```

On Azure, mount the JSON as a secret file (or App Service secret) and point
`GOOGLE_APPLICATION_CREDENTIALS` at it. The code path in `src/config/firestore.ts`
is identical to local — only the env vars change.

> Firestore composite-index note: the current queries filter/sort mostly in memory
> to avoid index setup. If you move heavy filtering into Firestore queries later,
> add composite indexes on `bookings (companyId, stylistId, startAt)` and
> `bookings (companyId, customerPhone, startAt)`.

---

## Optional email (real sends)

Defaults to a console provider that logs the rendered message. For real email:

```bash
NOTIFY_PROVIDER=smtp
SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... SMTP_FROM="Bloom Salon <no-reply@bloom.example>"
```

SMS is a stubbed provider with the interface in place.
