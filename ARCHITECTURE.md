# Architecture

System design for the Salon Voice-Agent Booking API. All diagrams are
[Mermaid](https://mermaid.js.org) — they render on GitHub and in most Markdown
viewers/IDEs.

- [1. System context](#1-system-context)
- [2. Layered architecture & request pipeline](#2-layered-architecture--request-pipeline)
- [3. Module / directory map](#3-module--directory-map)
- [4. Data model](#4-data-model)
- [5. Availability engine](#5-availability-engine)
- [6. Booking sequence (end to end)](#6-booking-sequence-end-to-end)
- [7. Environments](#7-environments)

---

## 1. System context

Who talks to the API and what it depends on. The API is stateless; all state
lives in Firestore. Notifications go out through a pluggable provider.

```mermaid
flowchart LR
    caller(["📞 Caller"])
    admin(["🧑‍💼 Staff / ops"])

    subgraph livekit["LiveKit Voice Agent"]
        agent["Agent + LLM<br/>(tools from livekit-tools.json)"]
    end

    subgraph local["Your machine / host"]
        tunnel["ngrok tunnel<br/>(public HTTPS URL)"]
        api["Express + TypeScript API<br/>:3000"]
    end

    fs[("Cloud Firestore<br/>emulator locally · GCP/Firebase in prod")]
    brevo["Brevo<br/>email"]

    caller --- agent
    agent -->|"HTTPS /api/v1/*"| tunnel
    tunnel --> api
    api -->|"@google-cloud/firestore"| fs
    api -->|"HTTP API / SMTP"| brevo
    admin -->|"/admin/*, /docs"| api

    classDef ext fill:#eef,stroke:#88a;
    class fs,brevo ext;
```

---

## 2. Layered architecture & request pipeline

MVC + service layering. Every request flows top-to-bottom; errors thrown anywhere
are caught by the error middleware and rendered as `{ error, message, spoken, details }`.

```mermaid
flowchart TD
    req["HTTP request"]

    subgraph app["Express app (app.ts)"]
        cors["CORS + JSON body parser"]
        timing["request timing log"]
    end

    subgraph view["View — routes/*.routes.ts (+ OpenAPI JSDoc)"]
        route["Router match"]
    end

    validate["validate() — Zod schema<br/>middleware/validate.ts"]
    idem["idempotency() — POST only<br/>replay by Idempotency-Key"]

    subgraph controllers["Controller — controllers/*"]
        controller["thin: read res.locals,<br/>call service, send response"]
    end

    subgraph services["Service — services/* (business logic)"]
        service["company · service · stylist ·<br/>availability · booking · message ·<br/>notification · dateResolve · admin"]
    end

    subgraph model["Model — models/ + config/"]
        collections["collections.ts<br/>(typed Firestore access)"]
        types["types.ts (domain types)"]
    end

    subgraph libs["lib/"]
        lib["spoken · time · errors · cache · ids"]
    end

    subgraph prov["providers/"]
        providers["notification.ts<br/>console · smtp · brevo"]
    end

    fs[("Firestore")]
    cache["in-memory cache<br/>(business/services/stylists)"]
    err["errorHandler<br/>→ {error,message,spoken,details}"]

    req --> cors --> timing --> route
    route --> validate --> idem --> controller --> service
    service --> collections --> fs
    service -.uses.-> lib
    service -.notify.-> providers
    cache -.serves.-> controller
    service -. throws .-> err
    validate -. throws .-> err
```

**Key rules baked into the pipeline**

- Every request is scoped by `companyId`; no endpoint crosses tenants.
- Every agent-facing value ships with a `*Spoken` twin (via `lib/spoken.ts`).
- POSTs are idempotent (replay-safe) via the `Idempotency-Key` header.
- Reads for `/business`, `/services`, `/stylists` are served from an in-memory
  cache, invalidated on admin writes.

---

## 3. Module / directory map

```mermaid
flowchart LR
    subgraph src
        idx["index.ts<br/>boot + seed-on-first-run"]
        appts["app.ts"]
        cfg["config/<br/>firestore · swagger"]
        rt["routes/"]
        ctl["controllers/"]
        svc["services/"]
        mdl["models/"]
        val["validators/ (Zod)"]
        mw["middleware/"]
        pr["providers/"]
        lb["lib/"]
        db["db/seed.ts"]
    end
    idx --> appts --> rt --> ctl --> svc --> mdl --> cfg
    rt --> mw
    svc --> lb
    svc --> pr
    ctl --> val
    idx --> db
```

---

## 4. Data model

Firestore is document-oriented; the relational spec is mapped to top-level
collections. The stylist↔service many-to-many is denormalised onto each stylist
as a `serviceIds[]` array for single-read lookups.

```mermaid
erDiagram
    COMPANY ||--o{ SERVICE : offers
    COMPANY ||--o{ STYLIST : employs
    COMPANY ||--o{ BLOCK : has
    COMPANY ||--o{ BOOKING : owns
    COMPANY ||--o{ MESSAGE : receives
    SERVICE ||--o{ BOOKING : "booked as"
    STYLIST ||--o{ BOOKING : "assigned to"
    STYLIST }o--o{ SERVICE : "performs (serviceIds[])"
    STYLIST ||--o{ BLOCK : "off during (optional)"

    COMPANY {
        string id PK
        string name
        string timezone
        string currency
        int cancellationWindowHours
        int slotStepMinutes
        array hours "per-day open/close"
    }
    SERVICE {
        string id PK
        string companyId FK
        int durationMinutes "null = consult only"
        int startingPrice
        bool bookableByPhone
        bool walkInAllowed
    }
    STYLIST {
        string id PK
        string companyId FK
        array serviceIds "M:N link"
        array hoursOverride
        bool active
    }
    BOOKING {
        string id PK
        string reference "human-sayable e.g. B729"
        string companyId FK
        string serviceId FK
        string stylistId FK
        string startAt "ISO UTC"
        string endAt "ISO UTC"
        string status "confirmed|cancelled|completed|no_show"
        string customerPhone
    }
    BLOCK {
        string id PK
        string companyId FK
        string stylistId "null = whole business"
        string startAt
        string endAt
    }
    MESSAGE {
        string id PK
        string companyId FK
        string category
        string status "open|handled"
    }
    IDEMPOTENCY_KEY {
        string key PK
        string companyId
        string endpoint
        int statusCode
        json response
        string createdAt "purge after 24h"
    }
```

---

## 5. Availability engine

The core computation (`services/availability.service.ts`). Empty is a `200` with
a `nextAvailable` counter-offer, never an error.

```mermaid
flowchart TD
    start(["GET /availability"]) --> resolve

    resolve["Resolve company + service"] --> bookable{"bookableByPhone?"}
    bookable -- no --> e403["403 SERVICE_NOT_BOOKABLE<br/>(escalation reason)"]
    bookable -- yes --> cands["Candidate stylists:<br/>active + perform service<br/>(+ stylistId filter)"]

    cands --> mismatch{"stylistId given<br/>but can't do it?"}
    mismatch -- yes --> e400["400 STYLIST_SERVICE_MISMATCH<br/>+ qualifiedStylists"]
    mismatch -- no --> load["Load confirmed bookings + blocks"]

    load --> loop["For each date × stylist"]
    loop --> hours["Business hours<br/>∩ stylist overrides"]
    hours --> closed{"open that day?"}
    closed -- no --> loop
    closed -- yes --> step["Step open→close by slotStepMinutes"]
    step --> fit{"slot + duration<br/>≤ close?"}
    fit -- no --> loop
    fit -- yes --> filters["Drop if: overlaps a booking/block,<br/>or is in the past (tenant tz)"]
    filters --> collect["Collect slot (+ spoken)"]
    collect --> loop

    loop --> post["Sort by time · dedupe across stylists<br/>· filter partOfDay · truncate to limit"]
    post --> any{"any slots?"}
    any -- yes --> ok200["200 { slots[], count }"]
    any -- no --> scan["Scan forward up to 30 days"]
    scan --> next200["200 { slots:[], reason:NO_SLOTS_IN_RANGE,<br/>spoken, nextAvailable }"]
```

---

## 6. Booking sequence (end to end)

The happy path an agent walks, including idempotency and the write-time
transaction that prevents double-booking.

```mermaid
sequenceDiagram
    autonumber
    participant A as Voice Agent
    participant API as Express API
    participant AV as Availability svc
    participant BK as Booking svc
    participant FS as Firestore
    participant BV as Brevo

    A->>API: POST /resolve-date {"next Thursday"}
    API-->>A: { date: 2026-09-24, confident }

    A->>API: GET /availability (service, date)
    API->>AV: compute slots
    AV->>FS: read bookings + blocks
    FS-->>AV: data
    AV-->>API: slots (+ spoken)
    API-->>A: offer slots

    A->>API: POST /bookings (Idempotency-Key)
    API->>FS: idempotency key seen?
    alt replay
        FS-->>API: stored response
        API-->>A: original 201 (no new booking)
    else fresh
        API->>BK: createBooking()
        BK->>AV: re-validate slot server-side
        BK->>FS: transaction: re-check overlap → write
        alt slot free
            FS-->>BK: committed
            BK-->>API: { reference, confirmedSpoken }
            API-->>A: 201 confirmed
        else taken since offer
            FS-->>BK: conflict
            BK-->>API: 409 SLOT_TAKEN + alternatives
            API-->>A: 409 (offer alternatives)
        end
    end

    A->>API: POST /notifications/confirmation
    API->>BV: send confirmation email
    BV-->>API: per-channel status
    API-->>A: 202 (failure never undoes the booking)
```

---

## 7. Environments

Same code, three wirings — only environment variables change.

```mermaid
flowchart LR
    subgraph dev["Local dev"]
        d1["Docker: emulator + API"] --> d2[("Firestore emulator<br/>no credentials")]
    end
    subgraph demo["Demo / testing"]
        n1["ngrok → local API"] --> n2[("Emulator or test<br/>Firebase project")]
    end
    subgraph prod["Production (Azure)"]
        p1["App on Azure"] --> p2[("Cloud Firestore<br/>service-account JSON")]
    end
    dev -->|"unset FIRESTORE_EMULATOR_HOST<br/>+ set GOOGLE_APPLICATION_CREDENTIALS"| prod
```

> Selection logic lives in `src/config/firestore.ts`: if `FIRESTORE_EMULATOR_HOST`
> is set it uses the emulator (no auth); otherwise it uses `GOOGLE_CLOUD_PROJECT`
> + the service-account key. See `README.md` for the exact variables.
