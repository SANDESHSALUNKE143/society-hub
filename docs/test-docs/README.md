# Test docs — demo society & testers

Manual UAT / closed-testing pack: create a society from scratch, load flats & parking, import the 12 testers, then hand them login details.

**Apps**

| App | Local URL | Who |
|-----|-----------|-----|
| Manage | http://manage.localhost:5174 | Platform (Super Admin) — structure only |
| Client App | http://app.localhost:5173 | Society staff (Admin mode) + testers (Resident mode) |
| API | http://localhost:3000 | Must be running for both apps |

See [08-Local-Development](../08-Local-Development.md) if apps are not running yet.

---

## Files in this folder

| File | Use |
|------|-----|
| [`01-flats-tower-c.csv`](01-flats-tower-c.csv) | Flat inventory (wing, floor, flat number) |
| [`02-parkings.csv`](02-parkings.csv) | Parking lots (`P-*` open slots + spare OP lots) |
| [`03-residents-testers.csv`](03-residents-testers.csv) | 12 owner households (phones, flats, vehicles) |
| [`testers-emails.csv`](testers-emails.csv) | Email-only list (Play closed testing) |
| [`testers.md`](testers.md) | Name / phone / flat cheat-sheet for WhatsApp |

---

## End-to-end setup (do in this order)

### Step 0 — Start the stack

```bash
# from repo root
bun run dev
```

Confirm Manage and Client App open in the browser.

---

### Step 1 — Sign in to Manage (platform)

1. Open **http://manage.localhost:5174**
2. Sign in as Super Admin  
   - Local seed: `superadmin@societyhub.local` / password from env (often `Test@1234`)
3. You should land on Societies / Dashboard

---

### Step 2 — Create the society

1. Go to **Societies**
2. Click **New society**
3. Fill at least:
   - **Society name** — e.g. `Tester Heights`
   - City / address optional
   - Chairperson name + **phone** (recommended) so someone can open Client App Admin
4. Click **Create society**
5. You are taken to that society’s detail page (default tab: **Structure**)

A new society starts **empty** — no towers, wings, or flats yet.

---

### Step 3 — Structure: tower (and wing)

On society detail → **Structure** tab:

1. Confirm **1 · Society** name (Rename if needed)
2. Under **2 · Towers**:
   - Enter `Tower C`
   - Click **Add tower**
3. Expand **Tower C** → **3 · Wings**:
   - Enter `C`
   - Click **Add wing**  
   *(Optional here — the flats CSV also creates wing `C` under the selected tower.)*
4. Leave **4 · Flats** for the next step (or click **Go to Flats**)

You can **Rename** / **Delete** towers and wings anytime from this screen (delete is blocked if occupied flats exist).

---

### Step 4 — Flats CSV

1. Open society detail → **Flats** tab
2. Click **Add flat**
3. **Tower** — select `Tower C` (do **not** leave this blank)
4. Under **Bulk upload**:
   - Choose [`01-flats-tower-c.csv`](01-flats-tower-c.csv)
   - **Review the grid**, then click **Import**
5. Wait for success (created / updated counts)
6. Confirm the table lists flats `401`, `502`, `705`, `308`, … `2207` under Tower C / Wing C

CSV columns are only `wing,floor,flatNumber` — tower is chosen in the UI, not in the file.

---

### Step 5 — Parking CSV

1. Still on the same society → **Parkings** tab
2. Upload [`02-parkings.csv`](02-parkings.csv) (or Add parking + Bulk CSV)
3. **Review the grid**, then click **Import**
4. Confirm open lots `P-401` … `P-2207` appear (plus spare `OP-1`…`OP-4`)

These `P-*` values match the `parkingSlot` column in the residents CSV.

---

### Step 6 — Society team (Client App Admin access)

Still in Manage → society → **Team**:

1. **Add member** — chairperson / secretary with a **mobile number** you control
2. That person signs in at **Client App** with OTP and uses **Admin** mode

*(If you already set chairperson phone when creating the society, they may already be on the team.)*

---

### Step 7 — Import residents (Client App)

1. Open **http://app.localhost:5173**
2. OTP login as society staff → switch to **Admin** mode
3. Sidebar → **Residents** (one blade)
4. Stay on **People** (not Flats)
5. Click **Add resident**
6. Use **CSV** upload → [`03-residents-testers.csv`](03-residents-testers.csv)
7. **Review the grid**, then click **Import**
8. Confirm import result (12 owners / flats)

Check **Residents → People → Directory** and **Residents → Flats** if you want a quick sanity pass.

---

### Step 8 — Hand off to testers

Send each person from [`testers.md`](testers.md):

- Client App URL (local or staging)
- Their **phone** number
- Use **Resident** mode (not Admin)
- OTP: local/dev usually `123456`; staging = real SMS

Suggested checks for them: login → raise complaint → Account / Household → read a notice → bills (if you generated any).

---

## Quick checklist

- [ ] Manage: society created  
- [ ] Structure: `Tower C` (+ wing `C`)  
- [ ] Flats: `01-flats-tower-c.csv` under Tower C  
- [ ] Parkings: `02-parkings.csv`  
- [ ] Team: at least one staff phone for Client App Admin  
- [ ] Client App Admin: `03-residents-testers.csv` imported  
- [ ] Testers can OTP-login on their phones  

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Flats land under wrong tower | Re-upload with **Tower C** selected in the Add flat dialog |
| Resident import: flat not found | Finish Steps 3–4 first; wing/flat numbers must match CSV |
| Parking not linked | `parkingSlot` in residents must equal a Manage lot `slotNumber` (e.g. `P-1204`) |
| Staff can’t open Admin | Add them on Manage → Team with a staff role + phone |
| OTP fails locally | Confirm API is up; use seed OTP `123456` when MSG91 is not live |
