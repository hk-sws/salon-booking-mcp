# Exposing the API with ngrok

The API listens on `localhost:3000`. To let something off your machine reach it —
a hosted LiveKit voice agent, a teammate, a webhook, your phone — put an
[ngrok](https://ngrok.com) tunnel in front of it. ngrok gives you a public HTTPS
URL that forwards to your local port.

> ⚠️ This makes your local server **publicly reachable**. There is no auth on the
> API yet (by design, per the spec). See [Securing the tunnel](#securing-the-tunnel)
> before leaving it up.

---

## 1. Install ngrok

```bash
# macOS
brew install ngrok/ngrok/ngrok
# or download from https://ngrok.com/download
```

## 2. Add your authtoken (one-time)

Create a free account, copy the token from the ngrok dashboard, then:

```bash
ngrok config add-authtoken <YOUR_AUTHTOKEN>
```

## 3. Start the API

```bash
docker compose up --build          # or: npm run dev
# wait for: [boot] API listening on http://localhost:3000
```

## 4. Open the tunnel

In a second terminal:

```bash
ngrok http 3000
```

ngrok prints a forwarding line like:

```
Forwarding   https://a1b2-203-0-113-7.ngrok-free.app -> http://localhost:3000
```

That HTTPS URL is your public base. The web inspector at
`http://localhost:4040` shows every request/response live — very handy for
debugging what the agent actually sends.

## 5. Test the public URL

```bash
PUBLIC=https://a1b2-203-0-113-7.ngrok-free.app   # your URL from step 4

curl -s $PUBLIC/api/v1/health
curl -s "$PUBLIC/api/v1/business?companyId=salon-01" | jq

# Point the smoke test at the tunnel:
BASE_URL=$PUBLIC/api/v1 ./scripts/smoke-test.sh
```

- **Swagger UI:** `https://<your-ngrok>.ngrok-free.app/docs`
- **API base path:** `https://<your-ngrok>.ngrok-free.app/api/v1`

> Free ngrok injects a browser warning interstitial for HTML pages. It does **not**
> affect API/JSON calls, but if you ever see it, add the header
> `-H "ngrok-skip-browser-warning: 1"`.

---

## Using it with the LiveKit voice agent

Give the agent the tunnel as its API base URL, e.g. an env var on the agent side:

```
SALON_API_BASE=https://a1b2-203-0-113-7.ngrok-free.app/api/v1
```

The tool definitions in `livekit-tools.json` are relative to that base — the agent
calls `${SALON_API_BASE}/availability`, `${SALON_API_BASE}/bookings`, etc. CORS is
already open, so browser-based agents work too.

---

## Stable URL (optional)

Free tunnels get a **new random URL every restart**. To avoid re-pasting it:

- **Static domain (free tier includes one):** claim it in the ngrok dashboard, then
  ```bash
  ngrok http 3000 --url=your-name.ngrok-free.app
  ```
- Paid plans allow custom domains and reserved subdomains.

---

## Run ngrok inside docker-compose (optional)

Instead of a second terminal, add ngrok as a service so `docker compose up` brings
up emulator + API + tunnel together. Create `.env` with `NGROK_AUTHTOKEN=...`, then
add to `docker-compose.yml`:

```yaml
  ngrok:
    image: ngrok/ngrok:latest
    depends_on: [app]
    environment:
      - NGROK_AUTHTOKEN=${NGROK_AUTHTOKEN}
    command: http app:3000        # tunnels the app container's port
    ports:
      - "4040:4040"               # web inspector at http://localhost:4040
```

Get the current public URL from the inspector API:

```bash
curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'
```

---

## Securing the tunnel

The API has open CORS, no auth, and a 100 req/min/IP rate limit. That rate limit is
abuse-mitigation, **not** access control. While the tunnel is public, anyone with the
URL can read and write salon data. Options, cheapest first:

1. **Keep it short-lived.** Only run `ngrok` while actively testing; `Ctrl-C` when done.
2. **ngrok Basic Auth** — require a username/password at the edge:
   ```bash
   ngrok http 3000 --basic-auth "salon:supersecret"
   ```
   (Callers then send `Authorization: Basic ...`.)
3. **IP allowlist** (ngrok Traffic Policy / paid) — restrict to your agent host's IP.
4. **Prefer real deployment for anything beyond a demo.** For production, deploy to
   Azure with real Cloud Firestore (see `README.md`) rather than tunnelling a laptop.

Never point a public tunnel at a **production** Firestore project. The local default
is the emulator, whose data is disposable — keep it that way for tunnelled testing.
