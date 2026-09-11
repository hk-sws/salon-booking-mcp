# Testing guide

Copy-paste `curl` commands for every endpoint, with what a healthy response looks
like. Everything runs against the local stack.

- Base URL: `http://localhost:3000/api/v1`
- Tenant: `salon-01` (Bloom Salon, seeded on first boot)
- Dates below assume "today" is around **2026-09-11**. If you run this later, bump
  the dates forward (any Tue–Sun works; Monday is closed).

---

## 0. Start the stack

```bash
docker compose up --build        # emulator + API; auto-seeds on first boot
# in another terminal, wait for: [boot] API listening on http://localhost:3000
```

One-liner readiness check:

```bash
curl -s http://localhost:3000/api/v1/health
# {"status":"ok","uptime":..,"firestore":"emulator @ firestore:8080 ..."}
```

Prefer a single command that checks everything? Jump to **§14 smoke test**.

Set a shell variable so the commands below are short:

```bash
B=http://localhost:3000/api/v1
```

---

## 1. Health

```bash
curl -s $B/health
```
✅ `{"status":"ok", ...}`

## 2. Business info  (`GET /business`)

```bash
curl -s "$B/business" | jq
```
✅ `hoursSpoken` = `"Open Tuesday to Sunday, ten in the morning to eight in the evening. Closed on Mondays."`

## 3. Services  (`GET /services`)

```bash
curl -s "$B/services" | jq '.services[] | {id,name,priceSpoken,stylistIds}'
curl -s "$B/services?bookableOnly=true" | jq '.services | length'
```
✅ Each service has `durationSpoken` + `priceSpoken`; `svc_bridal` shows
`"priceSpoken":"by consultation only"` and `bookableByPhone:false`.

## 4. Stylists  (`GET /stylists`)

```bash
curl -s "$B/stylists" | jq '.stylists[].servicesSpoken'
curl -s "$B/stylists?serviceId=svc_highlights" | jq
```
✅ Filtered call returns only **Priya**.

## 5. Resolve date  (`POST /resolve-date`)

```bash
curl -s -X POST $B/resolve-date -H 'Content-Type: application/json' \
  -d '{"phrase":"next Thursday"}' | jq
curl -s -X POST $B/resolve-date -H 'Content-Type: application/json' \
  -d '{"phrase":"tomorrow"}' | jq
curl -s -X POST $B/resolve-date -H 'Content-Type: application/json' \
  -d '{"phrase":"sometime soon"}' | jq
```
✅ Clear phrases → `{"date":"...","confident":true}`. Vague → `confident:false` + `clarifySpoken`.

## 6. Availability  (`GET /availability`) — the core

```bash
# Single date, all qualified stylists
curl -s "$B/availability?serviceId=svc_haircut&date=2026-09-15&limit=4" | jq

# Range + part of day + specific stylist
curl -s "$B/availability?serviceId=svc_highlights&dateFrom=2026-09-15&dateTo=2026-09-20&stylistId=sty_priya&partOfDay=morning" | jq

# Empty result on a closed Monday -> nextAvailable counter-offer
curl -s "$B/availability?serviceId=svc_haircut&date=2026-09-14" | jq

# Not phone-bookable -> 403
curl -s -o /dev/null -w "%{http_code}\n" "$B/availability?serviceId=svc_bridal&date=2026-09-15"

# Stylist who does not do the service -> 400 with qualifiedStylists
curl -s "$B/availability?serviceId=svc_highlights&date=2026-09-15&stylistId=sty_ramesh" | jq

# Missing required serviceId -> 400 VALIDATION_ERROR
curl -s -o /dev/null -w "%{http_code}\n" "$B/availability?date=2026-09-15"
```
✅ Slots carry `spoken`; empty is `200` with `reason:"NO_SLOTS_IN_RANGE"` + `nextAvailable`.

## 7. Create booking  (`POST /bookings`) + idempotency

```bash
# Create (note the Idempotency-Key)
curl -s -X POST $B/bookings -H 'Content-Type: application/json' -H 'Idempotency-Key: k1' \
  -d '{"serviceId":"svc_haircut","stylistId":"sty_kavya","date":"2026-09-15","start":"14:00","customer":{"name":"Meera","phone":"9000000001","email":"meera@example.com"},"source":"voice_agent"}' | jq

# Replay SAME key -> identical bookingId, no second booking
curl -s -X POST $B/bookings -H 'Content-Type: application/json' -H 'Idempotency-Key: k1' \
  -d '{"serviceId":"svc_haircut","stylistId":"sty_kavya","date":"2026-09-15","start":"14:00","customer":{"name":"Meera","phone":"9000000001"}}' | jq

# Same slot, NEW key -> 409 SLOT_TAKEN with alternatives
curl -s -X POST $B/bookings -H 'Content-Type: application/json' -H 'Idempotency-Key: k2' \
  -d '{"serviceId":"svc_haircut","stylistId":"sty_kavya","date":"2026-09-15","start":"14:00","customer":{"name":"X","phone":"9000000002"}}' | jq
```
✅ Response has `reference`, `referenceSpoken`, `confirmedSpoken`.

Capture an id for the next steps:
```bash
BID=$(curl -s -X POST $B/bookings -H 'Content-Type: application/json' \
  -d '{"serviceId":"svc_haircut","stylistId":"sty_kavya","date":"2026-09-16","start":"14:00","customer":{"name":"Test","phone":"9000000003"}}' | jq -r .bookingId)
echo "BID=$BID"
```

## 8. Find bookings  (`GET /bookings/find`)

```bash
curl -s "$B/bookings/find?phone=9000000003" | jq
```
✅ `withinCancellationWindow` and `hoursUntil` are computed server-side.

## 9. Send confirmation  (`POST /notifications/confirmation`)

```bash
curl -s -X POST $B/notifications/confirmation -H 'Content-Type: application/json' \
  -d "{\"bookingId\":\"$BID\",\"channels\":[\"email\"]}" | jq
```
✅ `202` with per-channel status (email logged to console). Check the
`docker compose logs app` output to see the rendered message.

## 10. Reschedule  (`POST /bookings/:id/reschedule`)

```bash
curl -s -X POST $B/bookings/$BID/reschedule -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-17","start":"12:00","stylistId":"sty_kavya"}' | jq
```
✅ `rescheduledSpoken` describes the new time.

## 11. Cancel  (`POST /bookings/:id/cancel`)

```bash
# Far-future booking -> 200 cancelled
curl -s -X POST $B/bookings/$BID/cancel -H 'Content-Type: application/json' \
  -d '{"reason":"Caller cancelled by phone"}' | jq

# A booking within 24h -> 422 escalation (create one at the nearest free slot first)
NEAR=$(curl -s -X POST $B/bookings -H 'Content-Type: application/json' \
  -d '{"serviceId":"svc_haircut","stylistId":"sty_ramesh","date":"2026-09-12","start":"11:00","customer":{"name":"Soon","phone":"9000000009"}}' | jq -r .bookingId)
curl -s -X POST $B/bookings/$NEAR/cancel -H 'Content-Type: application/json' \
  -d '{"reason":"late"}' | jq
```
✅ Second one → `422` `WITHIN_CANCELLATION_WINDOW` with `details.action = "CREATE_MESSAGE"`.

## 12. Messages  (`POST /messages`)

```bash
curl -s -X POST $B/messages -H 'Content-Type: application/json' \
  -d '{"category":"bridal","name":"Meera","phone":"9000000001","note":"December wedding"}' | jq
```
✅ `201` with `messageId`.

## 13. Admin

```bash
curl -s "$B/admin/bookings?status=confirmed" | jq '.count'
curl -s "$B/admin/messages?status=open" | jq
curl -s -X POST $B/admin/blocks -H 'Content-Type: application/json' \
  -d '{"stylistId":"sty_priya","startAt":"2026-09-20T04:30:00.000Z","endAt":"2026-09-20T14:30:00.000Z","reason":"Priya on leave"}' | jq
curl -s -X POST "$B/admin/seed" | jq   # reset to seed data
```

---

## 14. Smoke test — run everything at once

```bash
./scripts/smoke-test.sh
```

Runs one request per endpoint, checks status codes and key fields, and prints a
`PASS`/`FAIL` line for each. Exit code `0` = all green. (Requires `curl`; uses
`jq`/`python3` if present but falls back gracefully.)

---

## Testing through a public URL (ngrok)

Every command here takes a base URL. To test against a public tunnel instead of
localhost, set `B` (or `BASE_URL` for the script) to your ngrok base — see
**[NGROK.md](./NGROK.md)**:

```bash
B=https://<your-ngrok>.ngrok-free.app/api/v1
BASE_URL=$B ./scripts/smoke-test.sh
```

## Swagger (manual/interactive testing)

Open **http://localhost:3000/docs** — try any endpoint from the browser. Raw spec
at **http://localhost:3000/openapi.json**.

## Unit tests (no server needed)

```bash
npm test        # vitest: spoken helpers + availability slot engine (8 tests)
```

## Reset between runs

```bash
curl -s -X POST "http://localhost:3000/api/v1/admin/seed"   # reseed
# or wipe the emulator entirely:
docker compose down && docker compose up --build
```
