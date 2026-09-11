# Voice Agent Backend — Build Spec

Build a Node.js REST API that serves as the tool backend for LiveKit voice agents. The first tenant is a hair and beauty salon, but the API must be multi-tenant from day one so the same deployment can serve a dental clinic, a gym, or any appointment-based business without code changes.

---

## 1. Stack and constraints

- Node.js 20+, Express, TypeScript
- SQLite via `better-sqlite3` (single file, zero setup, easy to swap for Postgres later)
- Zod for request validation
- No authentication for now — all endpoints public
- Rate limit by IP: 100 requests per minute
- CORS open
- Deployable to Railway, Render, or Fly with a single `npm start`
- Seed script that loads the salon tenant so the API is useful immediately after clone

**Non-negotiable design rules:**

1. Every endpoint is scoped by `companyId`. No endpoint returns data across tenants.
2. Every response that a voice agent will read aloud includes a `*Spoken` string field with numbers, dates, and times written out in words.
3. Every error response includes a `spoken` field the agent can read verbatim.
4. All POST endpoints accept an `Idempotency-Key` header and return the original response on replay.
5. Never expose raw booking lists as an agent tool. Availability is computed server-side.

---

## 2. Why the spoken fields exist

The consumer is a text-to-speech voice agent. `₹800` gets read as "rupee eight zero zero". `14:30` gets read as "fourteen thirty" or "fourteen colon thirty". `bkg_7fa2` is unreadable.

So every price, duration, date, time, and reference code ships twice: once machine-readable, once as a phrase the agent reads verbatim.

```json
{ "startingPrice": 800, "priceSpoken": "starting at eight hundred rupees" }
{ "start": "14:30", "startSpoken": "half past two in the afternoon" }
{ "date": "2026-09-15", "dateSpoken": "Tuesday the fifteenth of September" }
```

Build a `lib/spoken.ts` module with helpers: `numberToWords`, `priceToWords`, `durationToWords`, `dateToWords`, `timeToWords`, `referenceToWords`. Currency and locale come from the tenant record, defaulting to INR and `en-IN`.

---

## 3. Data model

```
companies
  id                      TEXT PK        e.g. "salon-01"
  name                    TEXT
  type                    TEXT           "salon" | "clinic" | "generic"
  timezone                TEXT           "Asia/Kolkata"
  currency                TEXT           "INR"
  address                 TEXT
  addressSpoken           TEXT
  cancellationWindowHours INTEGER        24
  slotStepMinutes         INTEGER        30
  createdAt               TEXT

business_hours
  id         INTEGER PK
  companyId  TEXT FK
  day        TEXT           "mon".."sun"
  openTime   TEXT NULL      "10:00", null means closed
  closeTime  TEXT NULL      "20:00"

services
  id               TEXT PK       "svc_haircut"
  companyId        TEXT FK
  name             TEXT
  description      TEXT NULL
  durationMinutes  INTEGER NULL  null for consultation-only
  startingPrice    INTEGER NULL  minor units not needed, whole rupees fine
  bookableByPhone  INTEGER       0 or 1
  escalationReason TEXT NULL     required when bookableByPhone = 0
  walkInAllowed    INTEGER       0 or 1
  active           INTEGER

stylists                          -- rename generically: "providers" is fine too
  id          TEXT PK             "sty_priya"
  companyId   TEXT FK
  name        TEXT
  speciality  TEXT
  active      INTEGER

stylist_services                  -- many to many
  stylistId  TEXT FK
  serviceId  TEXT FK

stylist_hours                     -- optional per-stylist overrides
  id         INTEGER PK
  stylistId  TEXT FK
  day        TEXT
  openTime   TEXT NULL
  closeTime  TEXT NULL

blocks                            -- holidays, sick days, lunch breaks
  id         TEXT PK
  companyId  TEXT FK
  stylistId  TEXT NULL            null means whole business
  startAt    TEXT                 ISO UTC
  endAt      TEXT
  reason     TEXT

bookings
  id             TEXT PK          "bkg_7fa2"
  reference      TEXT             "B729" — short, human-sayable
  companyId      TEXT FK
  serviceId      TEXT FK
  stylistId      TEXT FK
  startAt        TEXT             ISO UTC
  endAt          TEXT
  status         TEXT             "confirmed" | "cancelled" | "completed" | "no_show"
  customerName   TEXT
  customerPhone  TEXT
  customerEmail  TEXT NULL
  notes          TEXT NULL
  source         TEXT             "voice_agent" | "manual" | "web"
  createdAt      TEXT
  cancelledAt    TEXT NULL
  cancelReason   TEXT NULL

messages                          -- escalations the agent cannot handle
  id         TEXT PK
  companyId  TEXT FK
  category   TEXT                 "bridal" | "complaint" | "health_query" | "reschedule_late" | "other"
  name       TEXT
  phone      TEXT
  email      TEXT NULL
  note       TEXT
  status     TEXT                 "open" | "handled"
  createdAt  TEXT

idempotency_keys
  key         TEXT PK
  companyId   TEXT
  endpoint    TEXT
  response    TEXT                JSON blob
  statusCode  INTEGER
  createdAt   TEXT                purge after 24h
```

---

## 4. Endpoints

Base path `/api/v1`. All responses `application/json`.

### 4.1 `GET /business?companyId=salon-01`

Static tenant facts. Cache aggressively — this changes weekly at most.

```json
{
  "companyId": "salon-01",
  "name": "Bloom Salon",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "address": "Second floor, above the pharmacy, near the bus stand",
  "hours": [
    { "day": "mon", "open": null, "close": null, "spoken": "closed on Mondays" },
    { "day": "tue", "open": "10:00", "close": "20:00",
      "spoken": "Tuesday, ten in the morning to eight in the evening" }
  ],
  "hoursSpoken": "Open Tuesday to Sunday, ten in the morning to eight in the evening. Closed on Mondays.",
  "walkInServiceIds": ["svc_haircut", "svc_threading"],
  "walkInSpoken": "Walk ins are welcome for haircuts and threading only, subject to availability.",
  "cancellationWindowHours": 24
}
```

Collapse consecutive identical days in `hoursSpoken` — "Tuesday to Sunday" rather than seven sentences.

### 4.2 `GET /services?companyId=salon-01`

Optional query: `bookableOnly=true`.

```json
{
  "services": [
    {
      "id": "svc_haircut",
      "name": "Haircut and blow dry",
      "durationMinutes": 60,
      "durationSpoken": "about one hour",
      "startingPrice": 800,
      "priceSpoken": "starting at eight hundred rupees",
      "bookableByPhone": true,
      "walkInAllowed": true,
      "stylistIds": ["sty_ramesh", "sty_kavya"]
    },
    {
      "id": "svc_bridal",
      "name": "Bridal package",
      "durationMinutes": null,
      "durationSpoken": null,
      "startingPrice": null,
      "priceSpoken": "by consultation only",
      "bookableByPhone": false,
      "escalationReason": "needs a consultation with a team member",
      "walkInAllowed": false,
      "stylistIds": []
    }
  ],
  "pricingNoteSpoken": "All prices are starting prices. The final price depends on hair length and stylist, and is confirmed at the salon."
}
```

Including `stylistIds` here saves the agent a second call when someone asks "who does highlights?".

### 4.3 `GET /stylists?companyId=salon-01`

Optional query: `serviceId=svc_highlights` to filter to those who perform it.

```json
{
  "stylists": [
    {
      "id": "sty_priya",
      "name": "Priya",
      "speciality": "Colour specialist",
      "serviceIds": ["svc_root", "svc_global", "svc_highlights"],
      "servicesSpoken": "Priya does root touch up, global colour, highlights and balayage."
    }
  ]
}
```

Never include availability here. Stylist skills are static; stylist schedules are not.

### 4.4 `GET /availability` — the core endpoint

Query params:

| param | required | notes |
|---|---|---|
| `companyId` | yes | |
| `serviceId` | yes | determines slot length |
| `date` | one of | `YYYY-MM-DD` |
| `dateFrom` + `dateTo` | one of | max 14 day span |
| `stylistId` | no | omit to search all qualified stylists |
| `partOfDay` | no | `morning` \| `afternoon` \| `evening` |
| `limit` | no | default 6 — do not flood a voice call with options |

Computation:

1. Resolve the service duration. If the service is not `bookableByPhone`, return `403 SERVICE_NOT_BOOKABLE` with the escalation reason.
2. Resolve candidate stylists — those linked to the service, active, and matching `stylistId` if given. If `stylistId` is given but that stylist does not perform the service, return `400 STYLIST_SERVICE_MISMATCH` listing who does.
3. For each date, take business hours; intersect with stylist hours if overrides exist. Closed day → skip.
4. Step from open time to close time by `slotStepMinutes`. Keep a slot only if `slot + duration <= closeTime`.
5. Drop slots overlapping any confirmed booking for that stylist, or any block.
6. Drop slots in the past relative to now in the tenant timezone.
7. Sort by time, dedupe across stylists keeping the earliest, truncate to `limit`.

```json
{
  "serviceId": "svc_highlights",
  "serviceName": "Highlights or balayage",
  "durationSpoken": "about three to four hours",
  "slots": [
    {
      "date": "2026-09-15",
      "start": "10:00",
      "end": "14:00",
      "stylistId": "sty_priya",
      "stylistName": "Priya",
      "spoken": "Tuesday the fifteenth at ten in the morning with Priya"
    }
  ],
  "count": 3
}
```

Empty result is a `200`, not an error:

```json
{
  "slots": [],
  "count": 0,
  "reason": "NO_SLOTS_IN_RANGE",
  "spoken": "I do not have anything open for that on those days.",
  "nextAvailable": {
    "date": "2026-09-18",
    "start": "11:00",
    "spoken": "Friday the eighteenth at eleven in the morning"
  }
}
```

`nextAvailable` matters. It turns a dead end into a counter-offer.

### 4.5 `POST /bookings`

```json
{
  "companyId": "salon-01",
  "serviceId": "svc_highlights",
  "stylistId": "sty_priya",
  "date": "2026-09-15",
  "start": "10:00",
  "customer": {
    "name": "Meera",
    "phone": "9876543210",
    "email": "meera@example.com"
  },
  "notes": "First visit",
  "source": "voice_agent"
}
```

Re-validate everything server-side. The agent will occasionally send a stylist who does not do the service, a closed day, or a slot taken thirty seconds ago.

`201`:

```json
{
  "bookingId": "bkg_7fa2",
  "reference": "B729",
  "referenceSpoken": "B seven two nine",
  "status": "confirmed",
  "confirmedSpoken": "Highlights with Priya on Tuesday the fifteenth of September at ten in the morning"
}
```

`409`:

```json
{
  "error": "SLOT_TAKEN",
  "spoken": "That time was just taken. I have two other options if you would like.",
  "alternatives": [
    { "date": "2026-09-15", "start": "14:00", "stylistId": "sty_priya",
      "spoken": "Tuesday the fifteenth at two in the afternoon with Priya" }
  ]
}
```

Do not send the confirmation notification from inside this handler. Booking and notifying are separate so a mail failure never rolls back a valid booking.

### 4.6 `GET /bookings/find?companyId=salon-01&phone=9876543210`

Upcoming confirmed bookings for that phone number, soonest first. Optional `reference` param for exact lookup.

```json
{
  "bookings": [
    {
      "bookingId": "bkg_7fa2",
      "reference": "B729",
      "serviceName": "Highlights or balayage",
      "stylistName": "Priya",
      "date": "2026-09-15",
      "start": "10:00",
      "spoken": "Highlights with Priya on Tuesday the fifteenth at ten in the morning",
      "withinCancellationWindow": false,
      "hoursUntil": 96
    }
  ],
  "count": 1
}
```

`withinCancellationWindow` is computed server-side so the agent never does date arithmetic. When it is `true`, the agent must escalate instead of cancelling.

### 4.7 `POST /bookings/:id/cancel`

```json
{ "companyId": "salon-01", "reason": "Caller cancelled by phone" }
```

If inside the cancellation window, return `422`:

```json
{
  "error": "WITHIN_CANCELLATION_WINDOW",
  "spoken": "That appointment is within twenty four hours, so I will pass this to a team member to sort out.",
  "action": "CREATE_MESSAGE"
}
```

The `action` hint tells the agent what to do next without the prompt having to encode the branch.

### 4.8 `POST /bookings/:id/reschedule`

```json
{ "companyId": "salon-01", "date": "2026-09-18", "start": "11:00", "stylistId": "sty_priya" }
```

Same window check as cancel. Atomic: validate the new slot, then move. Never leave the caller with zero bookings because the new slot failed.

### 4.9 `POST /messages`

The escalation catch-all — bridal enquiries, complaints, scalp questions, late cancellations, anything out of scope.

```json
{
  "companyId": "salon-01",
  "category": "bridal",
  "name": "Meera",
  "phone": "9876543210",
  "note": "Wants bridal package for a wedding in December"
}
```

`201` returns `{ "messageId": "...", "spoken": "I have passed this on. Someone will call you back." }`

### 4.10 `POST /notifications/confirmation`

```json
{ "companyId": "salon-01", "bookingId": "bkg_7fa2", "channels": ["email"] }
```

Pluggable provider behind an interface. Ship a `console` provider that logs the rendered message, and an SMTP provider via `nodemailer` driven by env vars. `channels` accepts `email` and `sms` — leave SMS as a stubbed provider with the interface in place.

Return `202` with per-channel status. A failed send is never a failed booking.

### 4.11 `POST /resolve-date` (helper)

Callers say "next Thursday" and "the day after tomorrow". Do not let the agent resolve these.

```json
{ "companyId": "salon-01", "phrase": "next Thursday" }
```

```json
{
  "date": "2026-09-17",
  "dateSpoken": "Thursday the seventeenth of September",
  "confident": true
}
```

When ambiguous, return `confident: false` with a `clarifySpoken` string the agent reads back.

### 4.12 Admin and ops

- `GET /health` → `{ "status": "ok", "uptime": 1234 }`
- `GET /admin/bookings?companyId=&from=&to=&status=` — full list, for humans not agents
- `GET /admin/messages?companyId=&status=open`
- `POST /admin/blocks` — add a holiday or sick day
- `POST /admin/seed?companyId=` — reset tenant to seed data, useful during workshops

---

## 5. Error format

Every non-2xx response:

```json
{
  "error": "STYLIST_SERVICE_MISMATCH",
  "message": "Stylist sty_ramesh does not perform service svc_highlights",
  "spoken": "Ramesh does not do highlights. Priya does, if you would like her instead.",
  "details": { "qualifiedStylists": ["sty_priya"] }
}
```

`message` is for your logs. `spoken` is for the caller. Never let a raw stack trace or an ID reach the `spoken` field.

Error codes to implement: `COMPANY_NOT_FOUND`, `SERVICE_NOT_FOUND`, `STYLIST_NOT_FOUND`, `BOOKING_NOT_FOUND`, `SERVICE_NOT_BOOKABLE`, `STYLIST_SERVICE_MISMATCH`, `OUTSIDE_BUSINESS_HOURS`, `CLOSED_ON_DAY`, `SLOT_TAKEN`, `SLOT_IN_PAST`, `WITHIN_CANCELLATION_WINDOW`, `NO_SLOTS_IN_RANGE`, `VALIDATION_ERROR`, `RATE_LIMITED`.

---

## 6. Timezone handling

- Store every timestamp as ISO UTC.
- Accept and return local date and time strings plus an explicit `timezone`.
- Convert at the boundary using `luxon` or `date-fns-tz`, never by hand.
- "Now" for past-slot filtering means now in the tenant's timezone.
- Do not trust any date the agent computes. That is what `/resolve-date` is for.

---

## 7. Idempotency

Every POST reads `Idempotency-Key`. Voice calls drop mid-turn and agents retry; without this one caller gets three bookings.

On a key that already exists for the same tenant and endpoint, return the stored status code and body unchanged. Purge keys older than twenty four hours.

---

## 8. Performance

Anything over roughly eight hundred milliseconds is audible dead air on a phone call.

- In-memory cache for `/business`, `/services`, `/stylists`, invalidated on admin writes
- Index `bookings` on `(companyId, stylistId, startAt)` and `(companyId, customerPhone, startAt)`
- Availability for a single date across four stylists should return in well under a hundred milliseconds with SQLite
- Log request duration per endpoint

---

## 9. Seed data — Bloom Salon

Company `salon-01`, "Bloom Salon", `Asia/Kolkata`, INR, cancellation window 24 hours, slot step 30 minutes.

Hours: Monday closed. Tuesday to Sunday, `10:00` to `20:00`.

Services:

| id | name | mins | price | bookable | walk-in |
|---|---|---|---|---|---|
| `svc_haircut` | Haircut and blow dry | 60 | 800 | yes | yes |
| `svc_wash` | Hair wash and blow dry | 45 | 500 | yes | no |
| `svc_root` | Root touch up colour | 90 | 2000 | yes | no |
| `svc_global` | Global colour | 180 | 4000 | yes | no |
| `svc_highlights` | Highlights or balayage | 210 | 6000 | yes | no |
| `svc_keratin` | Keratin treatment | 240 | 8000 | yes | no |
| `svc_threading` | Threading and facial | 60 | 700 | yes | yes |
| `svc_manipedi` | Manicure and pedicure | 60 | 900 | yes | no |
| `svc_bridal` | Bridal package | — | — | no | no |

`svc_bridal` escalation reason: "needs a consultation with a team member".

Stylists:

| id | name | speciality | services |
|---|---|---|---|
| `sty_priya` | Priya | Colour specialist | root, global, highlights |
| `sty_ramesh` | Ramesh | Cuts and styling | haircut, wash, keratin |
| `sty_anita` | Anita | Beauty services | threading, manipedi |
| `sty_kavya` | Kavya | Cuts and colour | haircut, wash, root |

Also seed roughly fifteen bookings scattered across the next ten days so availability is not trivially empty, and one block for a stylist holiday.

---

## 10. LiveKit tool definitions

Generate `livekit-tools.json` containing JSON Schema function definitions for the agent-facing subset, so the tools can be registered without hand-writing them:

`get_business_info`, `get_services`, `get_stylists`, `check_availability`, `find_booking`, `create_booking`, `cancel_booking`, `reschedule_booking`, `create_message`, `send_confirmation`, `resolve_date`.

Admin endpoints are excluded. Each definition needs a description written for a model, not a developer — say when to call it and when not to. For example, `check_availability`: "Call this before offering any day or time to the caller. Never state availability from memory."

---

## 11. Deliverables

```
src/
  index.ts
  db/           schema.sql, migrate.ts, seed.ts
  routes/       business, services, stylists, availability,
                bookings, messages, notifications, admin
  lib/          spoken.ts, availability.ts, idempotency.ts,
                errors.ts, cache.ts, time.ts
  providers/    notification/{console,smtp,sms}.ts
  middleware/   validate.ts, rateLimit.ts, errorHandler.ts
tests/
livekit-tools.json
README.md
.env.example
```

Include:

- Tests for the availability engine covering closed days, duration overflow past closing, overlapping bookings, blocks, past slots, and stylist-service mismatch
- Tests for idempotent replay on `POST /bookings`
- A `requests.http` file with a worked example of every endpoint
- README with local setup, seed, deploy notes, and a walkthrough of one full booking flow end to end

---

## 12. Build order

1. Scaffold, SQLite schema, migrate and seed
2. Spoken helpers with unit tests — everything else depends on them
3. Read endpoints: business, services, stylists
4. Availability engine plus its test suite
5. Bookings: create, find, cancel, reschedule
6. Messages and notifications
7. Idempotency, caching, rate limiting, error handler
8. Admin endpoints, `livekit-tools.json`, README

Ship each stage working before starting the next.