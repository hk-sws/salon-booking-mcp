#!/usr/bin/env bash
# End-to-end smoke test for the Salon booking API.
# Hits every endpoint, asserts status codes + key fields, prints PASS/FAIL.
# companyId is hardcoded server-side (salon-01) — no request sends it.
# Self-adjusting: it discovers real open slots via /availability, so it does not
# rot as dates move. Requires: curl, python3.
#
#   ./scripts/smoke-test.sh
#   BASE_URL=http://host:3000/api/v1 ./scripts/smoke-test.sh

set -u
B="${BASE_URL:-http://localhost:3000/api/v1}"
pass=0; fail=0; skip=0

# --- helpers ---------------------------------------------------------------
# run METHOD URL [JSON_BODY] [EXTRA_CURL_ARGS...]  -> sets $CODE and $BODY
run() {
  local method="$1" url="$2" body="${3:-}"; shift; shift; [ $# -gt 0 ] && shift || true
  local tmp
  tmp="$(mktemp)"
  if [ -n "$body" ]; then
    CODE="$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$url" \
      -H 'Content-Type: application/json' -d "$body" "$@")"
  else
    CODE="$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$url" "$@")"
  fi
  BODY="$(cat "$tmp")"; rm -f "$tmp"
}

pyget() { echo "$BODY" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
except Exception:
  print(''); sys.exit(0)
try:
  print(eval(\"d$1\"))
except Exception:
  print('')"; }

ok()   { pass=$((pass+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
no()   { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m  %s (got HTTP %s)\n' "$1" "$CODE"; [ -n "${2:-}" ] && echo "        $BODY"; }
sk()   { skip=$((skip+1)); printf '  \033[33mSKIP\033[0m  %s\n' "$1"; }
expect() { [ "$CODE" = "$1" ] && ok "$2" || no "$2" show; }

echo "Base: $B"
echo

# --- 0. readiness ----------------------------------------------------------
run GET "$B/health"
if [ "$CODE" != "200" ]; then
  echo "API not reachable at $B — is 'docker compose up' running?"; exit 1
fi
echo "Reads & helpers"
expect 200 "GET /health"

# --- reads -----------------------------------------------------------------
run GET "$B/business"
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q "Closed on Mondays"; then
  ok "GET /business (hoursSpoken collapsed)"; else no "GET /business" show; fi

run GET "$B/services"
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q "svc_haircut"; then
  ok "GET /services"; else no "GET /services" show; fi

run GET "$B/services?bookableOnly=true"
expect 200 "GET /services?bookableOnly=true"

run GET "$B/stylists"
expect 200 "GET /stylists"

run GET "$B/stylists?serviceId=svc_highlights"
if [ "$(pyget "['stylists'][0]['id']")" = "sty_priya" ]; then
  ok "GET /stylists?serviceId=svc_highlights (only Priya)"; else no "GET /stylists filtered" show; fi

run POST "$B/resolve-date" '{"phrase":"tomorrow"}'
[ "$(pyget "['confident']")" = "True" ] && ok "POST /resolve-date confident" || no "resolve-date" show

run POST "$B/resolve-date" '{"phrase":"sometime soon"}'
[ "$(pyget "['confident']")" = "False" ] && ok "POST /resolve-date ambiguous" || no "resolve-date ambiguous" show

# --- availability ----------------------------------------------------------
echo
echo "Availability"
read -r DFROM DTO NEXTMON <<EOF
$(python3 -c "import datetime as dt
t=dt.date.today(); f=t+dt.timedelta(days=2); to=t+dt.timedelta(days=9)
dd=(0-t.weekday())%7 or 7; mon=t+dt.timedelta(days=dd)
print(f.isoformat(), to.isoformat(), mon.isoformat())")
EOF

run GET "$B/availability?serviceId=svc_haircut&dateFrom=$DFROM&dateTo=$DTO&limit=6"
SCOUNT="$(pyget "['count']")"
if [ "$CODE" = "200" ] && [ "${SCOUNT:-0}" -ge 2 ] 2>/dev/null; then
  ok "GET /availability (range) -> $SCOUNT slots"
else no "GET /availability (range)" show; fi

# discover two real, bookable slots
S0_DATE="$(pyget "['slots'][0]['date']")";  S0_START="$(pyget "['slots'][0]['start']")";  S0_STY="$(pyget "['slots'][0]['stylistId']")"
S1_DATE="$(pyget "['slots'][1]['date']")";  S1_START="$(pyget "['slots'][1]['start']")";  S1_STY="$(pyget "['slots'][1]['stylistId']")"

run GET "$B/availability?serviceId=svc_haircut&date=$NEXTMON"
if [ "$(pyget "['reason']")" = "NO_SLOTS_IN_RANGE" ] && [ -n "$(pyget "['nextAvailable']['date']")" ]; then
  ok "GET /availability closed Monday -> nextAvailable"; else no "GET /availability Monday" show; fi

run GET "$B/availability?serviceId=svc_bridal&date=$S0_DATE"
expect 403 "GET /availability non-bookable -> 403"

run GET "$B/availability?serviceId=svc_highlights&date=$S0_DATE&stylistId=sty_ramesh"
[ "$(pyget "['error']")" = "STYLIST_SERVICE_MISMATCH" ] && ok "GET /availability mismatch -> 400" || no "availability mismatch" show

run GET "$B/availability?date=$S0_DATE"
expect 400 "GET /availability missing serviceId -> 400"

# --- bookings lifecycle ----------------------------------------------------
echo
echo "Bookings"
BODYJSON="{\"serviceId\":\"svc_haircut\",\"stylistId\":\"$S0_STY\",\"date\":\"$S0_DATE\",\"start\":\"$S0_START\",\"customer\":{\"name\":\"Smoke\",\"phone\":\"9000000777\",\"email\":\"smoke@example.com\"}}"

run POST "$B/bookings" "$BODYJSON" -H 'Idempotency-Key: smoke-1'
BID="$(pyget "['bookingId']")"
[ "$CODE" = "201" ] && [ -n "$BID" ] && ok "POST /bookings -> 201 ($BID)" || no "POST /bookings" show

run POST "$B/bookings" "$BODYJSON" -H 'Idempotency-Key: smoke-1'
[ "$(pyget "['bookingId']")" = "$BID" ] && ok "POST /bookings idempotent replay (same id)" || no "idempotent replay" show

run POST "$B/bookings" "$BODYJSON" -H 'Idempotency-Key: smoke-2'
[ "$CODE" = "409" ] && [ "$(pyget "['error']")" = "SLOT_TAKEN" ] && ok "POST /bookings double-book -> 409 + alternatives" || no "double-book 409" show

run GET "$B/bookings/find?phone=9000000777"
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q "withinCancellationWindow"; then
  ok "GET /bookings/find (window computed)"; else no "bookings/find" show; fi

run POST "$B/notifications/confirmation" "{\"bookingId\":\"$BID\",\"channels\":[\"email\"]}"
expect 202 "POST /notifications/confirmation -> 202"

run POST "$B/bookings/$BID/reschedule" "{\"date\":\"$S1_DATE\",\"start\":\"$S1_START\",\"stylistId\":\"$S1_STY\"}"
expect 200 "POST /bookings/:id/reschedule -> 200"

run POST "$B/bookings/$BID/cancel" "{\"reason\":\"smoke test\"}"
expect 200 "POST /bookings/:id/cancel (far future) -> 200"

# within-window cancel (best effort): earliest slot tomorrow may be <24h
TOM="$(python3 -c "import datetime;print((datetime.date.today()+datetime.timedelta(days=1)).isoformat())")"
run GET "$B/availability?serviceId=svc_haircut&date=$TOM&limit=6"
NDATE="$(pyget "['slots'][0]['date']")"; NSTART="$(pyget "['slots'][0]['start']")"; NSTY="$(pyget "['slots'][0]['stylistId']")"
if [ -n "$NDATE" ]; then
  run POST "$B/bookings" "{\"serviceId\":\"svc_haircut\",\"stylistId\":\"$NSTY\",\"date\":\"$NDATE\",\"start\":\"$NSTART\",\"customer\":{\"name\":\"Near\",\"phone\":\"9000000888\"}}"
  NBID="$(pyget "['bookingId']")"
  if [ -n "$NBID" ]; then
    run POST "$B/bookings/$NBID/cancel" "{\"reason\":\"late\"}"
    if [ "$CODE" = "422" ] && [ "$(pyget "['details']['action']")" = "CREATE_MESSAGE" ]; then
      ok "POST /cancel within window -> 422 CREATE_MESSAGE"
    elif [ "$CODE" = "200" ]; then
      sk "within-window cancel (slot was >24h away today) — got 200"
    else no "within-window cancel" show; fi
  else sk "within-window cancel (no free near slot to book)"; fi
else sk "within-window cancel (no slots tomorrow)"; fi

# --- messages & admin ------------------------------------------------------
echo
echo "Escalation & admin"
run POST "$B/messages" "{\"category\":\"bridal\",\"name\":\"Meera\",\"phone\":\"9000000001\",\"note\":\"December wedding\"}"
expect 201 "POST /messages -> 201"

run GET "$B/admin/bookings?status=confirmed"
expect 200 "GET /admin/bookings"

run GET "$B/admin/messages?status=open"
expect 200 "GET /admin/messages"

run POST "$B/admin/blocks" "{\"stylistId\":\"sty_priya\",\"startAt\":\"${S1_DATE}T04:30:00.000Z\",\"endAt\":\"${S1_DATE}T14:30:00.000Z\",\"reason\":\"smoke block\"}"
expect 201 "POST /admin/blocks -> 201"

run POST "$B/admin/seed"
expect 200 "POST /admin/seed (reset) -> 200"

# --- summary ---------------------------------------------------------------
echo
printf '\033[1mSummary:\033[0m %d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ] && { echo "All good ✅"; exit 0; } || { echo "Some checks failed ❌"; exit 1; }
