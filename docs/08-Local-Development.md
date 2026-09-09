# Local development setup

**Document:** 08-Local-Development  
**Product:** SocietyHub  
**Audience:** Developers running Phase 1 on a Mac (or Linux) machine  
**Related:** [Tech Stack](07-Tech-Stack.md), [Database](04-Database.md), [DevOps Docker](../devops/docker/README.md)

This guide is the **source of truth for local run**. Prefer a **native MySQL** (Workbench / MySQL Installer) for day-to-day work. Docker MySQL is optional.

---

## 1. What you will run

| Service | URL | Notes |
|---------|-----|--------|
| Client App | http://app.localhost:5173 | Society Admin \| Resident (Fassport Raise/Invest style) |
| Manage | http://manage.localhost:5174 | SocietyHub **platform employees only** |
| API | http://localhost:3000 | Elysia `/v1` |
| Flutter Android | emulator / USB | [`apps/mobile/`](../apps/mobile/README.md) — §12 |
| OpenAPI | http://localhost:3000/docs | Swagger UI |
| API guide | [09-API.md](09-API.md) | Narrative REST reference (Fassport-style) |
| MySQL | `127.0.0.1:3306` | Local server (Workbench) |

Add once to `/etc/hosts` (requires sudo):

```text
127.0.0.1 app.localhost
127.0.0.1 manage.localhost
```

If `app.localhost` is missing, Client App links and CORS still work via `localhost:5173`, but prefer the `*.localhost` hosts so cookies/CORS match production-style subdomains.

After `bun run dev`, Vite also prints:

- `➜  Client App: http://app.localhost:5173/`
- `➜  Manage: http://manage.localhost:5174/`

Ports are fixed (`strictPort: true`): Client App **5173**, Manage **5174**. If a port is busy, stop the old process (`lsof -i :5173`) instead of letting Vite hop to 5175.

---

## 2. Prerequisites

Install once:

| Tool | Why | Check |
|------|-----|--------|
| **[Bun](https://bun.sh)** (≥ 1.2) | Package manager + API runtime | `bun --version` |
| **MySQL 8** server | Database | Workbench connects to `127.0.0.1:3306` |
| **MySQL Workbench** (optional) | Browse tables / run SQL | App installs separately from the server |
| **Git** | Clone / branches | `git --version` |
| **Docker** (optional) | Only if you do **not** have a local MySQL server | `docker --version` |

### Install Bun (macOS)

```bash
curl -fsSL https://bun.sh/install | bash
```

Then reload your shell so `bun` is on `PATH`:

```bash
source ~/.zshrc
# or open a new Terminal window
bun --version
```

If `bun` is still not found:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### MySQL server (native — recommended)

You already need a **MySQL server** process (Workbench alone is only a GUI).

- macOS installer often puts the client at `/usr/local/mysql/bin/mysql`
- Default local port: **3306**
- Dev password used in this project: **`1900Summer@`** (root)

Add the client to PATH (optional):

```bash
export PATH="/usr/local/mysql/bin:$PATH"
mysql --version
```

---

## 3. One-time project setup

From the repo root:

```bash
cd /path/to/society-hub
export PATH="$HOME/.bun/bin:$PATH"

# Install workspace dependencies
bun install

# Create env files from examples (safe if already present)
bun run setup:env

# Create DB + tables + seed data
bun run setup:db
```

Or step by step (same result):

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/client-app/.env.example apps/client-app/.env
cp apps/manage/.env.example apps/manage/.env

# Create empty database (Workbench SQL tab OR CLI)
# See section 4

bun run db:migrate
bun run db:seed
```

---

## 4. Create the local database

### Option A — MySQL Workbench (GUI)

1. Open **MySQL Workbench**
2. Connect to `Local instance` → `127.0.0.1:3306` as `root`
3. Open a new **SQL** query tab (do **not** paste SQL into Terminal/`zsh`)
4. Run:

```sql
CREATE DATABASE IF NOT EXISTS societyhub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

5. Refresh Schemas — you should see `societyhub`

### Option B — Terminal (mysql client)

```bash
/usr/local/mysql/bin/mysql -uroot -p'1900Summer@' -h127.0.0.1 -P3306 -e \
  "CREATE DATABASE IF NOT EXISTS societyhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

> `CREATE DATABASE ...` is **SQL**. Running it directly in `zsh` fails with `command not found: CREATE`.

### Apply schema + seed

```bash
bun run db:migrate   # creates tables via Drizzle migrations
bun run db:seed      # Keshav Heights + superadmin
bun run db:cleanup-test  # soft-delete extra societies from API integration tests (keeps Keshav Heights)
```

Cypress E2E mocks the API and does **not** write societies to MySQL. Extra names like `Coverage Society …` / `Other Soc …` come from `bun run test:integration`. Cleanup keeps pilot **Keshav Heights** (`11111111-1111-1111-1111-111111111111`) by default:

```bash
DRY_RUN=1 bun run db:cleanup-test
KEEP_SOCIETY_NAMES="Keshav Heights" bun run db:cleanup-test
```

In Workbench: open `societyhub` → Tables (should list `users`, `complaints`, etc.).

---

## 5. Environment files

### API — `apps/api/.env`

```env
SUPERADMIN_PASSWORD=Test@1234
DEV_AUTH=true
DEV_OTP_CODE=123456
JWT_SECRET=dev-change-me-society-hub-jwt-secret-32chars
DATABASE_URL=mysql://root:1900Summer%40@127.0.0.1:3306/societyhub
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://app.localhost:5173,http://localhost:5174,http://127.0.0.1:5174,http://manage.localhost:5174
PUBLIC_API_URL=http://localhost:3000
PORT=3000
UPLOAD_DIR=./uploads
```

Notes:

- `@` in the DB password **must** be URL-encoded as `%40` inside `DATABASE_URL`
- `DEV_AUTH=true` returns OTP / password-reset codes in API responses (local only)
- Superadmin login password defaults to `Test@1234` (override with `SUPERADMIN_PASSWORD`)

### Client App — `apps/client-app/.env`

```env
VITE_API_URL=http://localhost:3000
VITE_MANAGE_URL=http://manage.localhost:5174
VITE_APP_ORIGIN=http://app.localhost:5173
```

### Manage (platform) — `apps/manage/.env`

```env
VITE_API_URL=http://localhost:3000
VITE_WEB_URL=http://app.localhost:5173
VITE_APP_ORIGIN=http://app.localhost:5173
VITE_MANAGE_ORIGIN=http://manage.localhost:5174
```

---

## 6. Run every day

```bash
cd /path/to/society-hub
export PATH="$HOME/.bun/bin:$PATH"

# Ensure MySQL server is running (System Settings / mysql.server / Workbench can connect)

bun run dev
```

This starts:

- API → http://localhost:3000  
- Client App → http://app.localhost:5173 (also http://localhost:5173)  
- Manage (platform) → http://manage.localhost:5174 (also http://localhost:5174)  

Run separately if needed:

```bash
bun run dev:api
bun run dev:client-app
bun run dev:manage
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

---

## 7. Seed logins (local only)

| Method | Credentials |
|--------|-------------|
| Email / password | Manage (platform): `superadmin@societyhub.local` / `Test@1234` |
| OTP (mobile) | Client App Chairperson `9999999999` · Resident `8888888888` · code `123456` |

Use **Manage** (`manage.localhost:5174`) for SocietyHub platform employees (create societies, list/add/remove staff on a society team). Use **Client App** (`app.localhost:5173`) for society **Admin \| Resident** modes.

---

## 8. Useful scripts

| Script | Purpose |
|--------|---------|
| `bun run setup` | `install` + env files + migrate + seed |
| `bun run setup:env` | Copy `.env.example` → `.env` if missing |
| `bun run setup:db` | migrate + seed (expects DB exists) |
| `bun run db:migrate` | Apply Drizzle migrations |
| `bun run db:seed` | Seed / refresh superadmin |
| `bun run db:generate` | Generate a new migration after schema edits |
| `bun run test:unit` | Unit tests with **≥90%** coverage gate |
| `bun run test:integration` | API integration smoke (API must be running) |
| `bun run test:ci` | Unit + integration |
| `bun run db:up` | **Optional** Docker MySQL on host `:3307` |
| `bun run lint` | Typecheck packages/apps |
| `bun run test` | Unit / API smoke tests (API must be up for API tests) |
| `bun run test:e2e:cypress` | Cypress E2E for both web apps (boots each dev server automatically) |

---

## 8b. Cypress E2E

Each web app (`apps/manage`, `apps/client-app`) has a Cypress suite under `cypress/e2e/*.cy.ts`. Specs use `cy.intercept` to mock the API, so they run **without** the API or a database — only the app's own Vite dev server needs to be up.

```bash
# Run both apps' Cypress suites (starts/stops each dev server for you)
bun run test:e2e:cypress

# Or one app at a time, with the dev server already running:
cd apps/manage && bun run dev            # in one terminal
cd apps/manage && bun run test:cypress   # headless run, in another
cd apps/manage && bun run test:cypress:open  # interactive runner

cd apps/client-app && bun run test:cypress
cd apps/client-app && bun run test:cypress:open
```

---

## 9. Optional: Docker MySQL instead of native

Only if you do **not** want a native MySQL server:

```bash
bun run db:up
```

Then set in `apps/api/.env`:

```env
DATABASE_URL=mysql://root:1900Summer%40@127.0.0.1:3307/societyhub
```

Docker maps container `3306` → host **`3307`** so it does not clash with Workbench on `3306`.

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `zsh: command not found: bun` | `export PATH="$HOME/.bun/bin:$PATH"` then `source ~/.zshrc` |
| `command not found: CREATE` | Run SQL in Workbench or `mysql -e "..."`, not in zsh |
| `ER_ACCESS_DENIED` | Check root password; update `DATABASE_URL` (`%40` for `@`) |
| `ECONNREFUSED 3306` | Start MySQL server (not just Workbench) |
| API CORS errors | Ensure `CORS_ORIGIN` includes web (`5173`) and manage (`5174`) for both `localhost` and `127.0.0.1` |
| Old auth routes after pull | Restart API process (`bun run dev` / kill port 3000) |
| Port 3306 already in use | That is your native MySQL — use it; do not also need Docker |

Reset DB data (destructive):

```sql
DROP DATABASE societyhub;
CREATE DATABASE societyhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then:

```bash
bun run db:migrate
bun run db:seed
```

---

## 11. Project layout (local focus)

```text
society-hub/
  apps/api/          # Bun + Elysia API
  apps/client-app/   # Resident React web
  apps/manage/       # Admin React web
  apps/mobile/       # Flutter Client App (Android first)
  packages/          # shared types, validation, sdk, auth
  docs/08-Local-Development.md   # this file
  devops/docker/     # optional Docker MySQL / images
```

---

## 12. Mobile (Flutter) — Android first

The native Client App lives in [`apps/mobile/`](../apps/mobile/). Deep dive: [`apps/mobile/README.md`](../apps/mobile/README.md). Web + API above must already be running.

### Prerequisites

- Flutter **stable** (`flutter doctor -v` — Android SDK, emulator, licenses)
- Same Bun API as §6 (`http://localhost:3000`, `DEV_AUTH=true`)

### Run

| Target | Command |
|--------|---------|
| Android emulator | `cd apps/mobile && flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev` |
| Physical Android | Same, but `API_BASE_URL=http://<LAN-IP>:3000` (`ipconfig getifaddr en0`) |
| iOS Simulator (optional) | `API_BASE_URL=http://127.0.0.1:3000` |

OTP (local): Chairperson `9999999999` · Resident `8888888888` · `123456`.

Store signing, Play AAB, and CI secrets: [10-Go-Live.md](10-Go-Live.md) §6–7 and the mobile README.

---

## 13. Checklist before first login

- [ ] `bun --version` works  
- [ ] Workbench connects to MySQL on `3306`  
- [ ] Database `societyhub` exists  
- [ ] `bun run db:migrate` and `bun run db:seed` succeeded  
- [ ] `apps/api/.env`, `apps/client-app/.env`, and `apps/manage/.env` exist  
- [ ] `CORS_ORIGIN` includes ports `5173` and `5174`  
- [ ] `bun run dev` → client-app + manage + API up  
- [ ] Sign in with `superadmin@societyhub.local` / `Test@1234`  
- [ ] (Optional) `cd apps/mobile && flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ENV=dev`  
