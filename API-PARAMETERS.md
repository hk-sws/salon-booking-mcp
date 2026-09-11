# API request parameters

Every request parameter for every endpoint, with a description of what it does.
Auto-generated from the OpenAPI spec (`/openapi.json`). Base path `/api/v1`.
`companyId` is hardcoded server-side (`salon-01`) and is never sent by clients.

## GET /business
_Static tenant facts — hours, address, walk-in policy._

_No request parameters._

## GET /services
_Service menu with prices, durations, and who performs each._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `bookableOnly` | query | no | When `true`, returns only services that can be booked over the phone (`bookableByPhone = true`), hiding consultation-only ones like bridal. Defaults to `false` (return everything). |

## GET /stylists
_Stylists and the services they perform. Never returns availability._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `serviceId` | query | no | Optional service id filter. When provided, returns only stylists who perform that service (e.g. `svc_highlights` → just Priya). Omit to list the whole team. |

## GET /availability
_Compute bookable slots — the only source of truth for open times._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `serviceId` | query | yes | Which service to book. Determines slot length (its duration) and the set of qualified stylists. If the service is consultation-only (not `bookableByPhone`), returns `403 SERVICE_NOT_BOOKABLE`. |
| `date` | query | no | Single day to search, `YYYY-MM-DD`. Provide this OR `dateFrom`+`dateTo`, not both. |
| `dateFrom` | query | no | First day of a date range (inclusive), `YYYY-MM-DD`. Requires `dateTo`. |
| `dateTo` | query | no | Last day of a date range (inclusive), `YYYY-MM-DD`. Requires `dateFrom`. The span may not exceed 14 days. |
| `stylistId` | query | no | Restrict to one stylist. If given and that stylist does not perform the service, returns `400 STYLIST_SERVICE_MISMATCH` listing who does. Omit to search all qualified stylists. |
| `partOfDay` | query | no | Optional time-of-day filter. `morning` = before 12:00, `afternoon` = 12:00–16:59, `evening` = 17:00 onward. |
| `limit` | query | no | Max slots to return (default 6). Keep it small so a voice call is not flooded with options. |

## POST /bookings
_Create a booking (server re-validates the slot; idempotent)._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `Idempotency-Key` | header | no | Unique key for this booking attempt. On replay with the same key, the original 201 response is returned and no second booking is made. Strongly recommended for voice agents (calls drop and retry mid-turn). |

**Request body** (JSON)

- `serviceId` (string) **required** — Service to book; sets the appointment duration.
- `stylistId` (string) **required** — Stylist to book. Must perform `serviceId`, else 400 STYLIST_SERVICE_MISMATCH.
- `date` (string) **required** — Local appointment date, `YYYY-MM-DD` (tenant timezone).
- `start` (string) **required** — Local start time, `HH:mm` (24h). End time is derived from the service duration.
- `customer` (object) **required** — Who the appointment is for.
  - `name` (string) **required** — Customer's name (used in the confirmation).
  - `phone` (string) **required** — Contact phone; also the key for /bookings/find.
  - `email` (string) — Optional; required only if you later email a confirmation.
- `notes` (string) — Optional free-text note (max 500 chars), e.g. "first visit".
- `source` (string) — Where the booking originated. Defaults to `voice_agent`.

## GET /bookings/find
_Find a caller's upcoming confirmed bookings._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `phone` | query | no | Customer phone number. Returns all their upcoming bookings. |
| `reference` | query | no | Short human reference (e.g. "B729") for an exact-match lookup. |

## POST /bookings/{id}/cancel
_Cancel a booking (escalates if inside the cancellation window)._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `id` | path | yes | The booking id (from create or /bookings/find). |
| `Idempotency-Key` | header | no | Optional replay-safe key; a repeat returns the original response. |

**Request body** (JSON)

- `reason` (string) **required** — Why it's being cancelled (stored for staff/audit).

## POST /bookings/{id}/reschedule
_Move a booking to a new, re-validated slot (atomic)._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `id` | path | yes | The booking id to move. |
| `Idempotency-Key` | header | no | Optional replay-safe key. |

**Request body** (JSON)

- `date` (string) **required** — New local date, `YYYY-MM-DD`.
- `start` (string) **required** — New local start time, `HH:mm`.
- `stylistId` (string) **required** — Stylist for the new slot (may differ from the original; must perform the service).

## POST /messages
_Take a message for staff (the escalation catch-all)._

**Request body** (JSON)

- `category` (string) **required** — Reason bucket. `bridal` = package enquiry, `complaint`, `health_query` = scalp/allergy/medical, `reschedule_late` = a change refused for being inside the window, `other` = anything else.
- `name` (string) **required** — Caller's name.
- `phone` (string) **required** — Callback number.
- `email` (string) — Optional callback email.
- `note` (string) **required** — What the caller wants, in their words (max 1000 chars).

## POST /notifications/confirmation
_Send a booking confirmation email._

**Request body** (JSON)

- `bookingId` (string) **required** — The booking to confirm. Its customer email is the recipient.
- `channels` (array) — Delivery channels. Currently only `email` is supported; defaults to `["email"]` if omitted.

## POST /resolve-date
_Turn a spoken date phrase into a calendar date._

**Request body** (JSON)

- `phrase` (string) **required** — The caller's spoken date phrase, verbatim.

## GET /health
_Liveness probe._

_No request parameters._

## GET /admin/bookings
_Full booking list for humans (not agents)._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `from` | query | no | Only bookings starting on/after this date, `YYYY-MM-DD`. |
| `to` | query | no | Only bookings starting on/before this date, `YYYY-MM-DD`. |
| `status` | query | no | Filter by booking status. Omit for all statuses. |

## GET /admin/messages
_Escalation messages for staff._

**Parameters**

| name | in | required | description |
|---|---|---|---|
| `status` | query | no | Filter by handling status. `open` = not yet actioned. Omit for all. |

## POST /admin/blocks
_Add a holiday, sick day, or break._

**Request body** (JSON)

- `stylistId` (string) — Stylist this block applies to. `null`/omitted = whole business closed.
- `startAt` (string) **required** — Block start as an ISO-8601 UTC timestamp.
- `endAt` (string) **required** — Block end as an ISO-8601 UTC timestamp.
- `reason` (string) **required** — Human-readable reason (for staff/audit).

## POST /admin/seed
_Reset the tenant to seed data (workshops/demos)._

_No request parameters._

