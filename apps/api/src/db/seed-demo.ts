/**
 * Demo seed — a realistic society for reviewing and demoing the UI.
 *
 * `seed.ts` creates the minimum needed to log in: one flat, two users. That is
 * correct for tests but leaves the occupancy screens almost empty, so this
 * builds a society with enough shape to actually exercise them — vacant vs
 * owner- vs tenant-occupied flats, residents at every lifecycle and
 * verification state, closed occupancy periods behind the live ones, and
 * invitations in each status.
 *
 * It writes to its own tenant and **never touches the pilot society**, so the
 * Keshav Heights fixtures the integration tests rely on stay exactly as they
 * are. Re-running wipes and rebuilds only this tenant, so it is safe to run as
 * often as you like.
 *
 *   bun run db:seed-demo
 */
import { eq, inArray } from "drizzle-orm";
import { closeDb, db } from "./client";
import {
  auditLogs,
  billLineItems,
  bills,
  buildings,
  complaints,
  flats,
  invitations,
  notices,
  notifications,
  payments,
  residentFamilyMembers,
  residentProfiles,
  residents,
  societies,
  userRoles,
  users,
  verificationDocuments,
  wings,
} from "./schema";

const TENANT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

/** Pilot users, so the same login lands in both societies and can switch. */
const PILOT_ADMIN_USER_ID = "22222222-2222-2222-2222-222222222222";
const PILOT_RESIDENT_USER_ID = "33333333-3333-3333-3333-333333333333";

/**
 * Deterministic ids: a rebuild reuses them, so the wipe below can find every
 * row this script has ever written without needing a marker column.
 */
function demoId(kind: number, n: number) {
  const a = String(kind).padStart(4, "0");
  const b = String(n).padStart(12, "0");
  return `deadbeef-${a}-4000-8000-${b}`;
}

const userId = (n: number) => demoId(1, n);

function iso(daysAgo: number) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
}

/** Deterministic pseudo-random so a rebuild produces the same society. */
let seed = 20260910;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Ananya", "Diya", "Ishaan", "Kavya", "Meera",
  "Rohan", "Sanya", "Arjun", "Neha", "Kabir", "Priya", "Rahul", "Sneha",
  "Karan", "Pooja", "Nikhil", "Anjali", "Siddharth", "Riya", "Manish", "Tara",
  "Vikram", "Deepa", "Amit", "Shruti", "Rajesh", "Sunita", "Harsh", "Nisha",
  "Yash", "Gauri", "Sameer", "Lata", "Varun", "Ritu", "Akash", "Divya",
] as const;

const LAST = [
  "Sharma", "Patel", "Vichare", "Deshmukh", "Iyer", "Nair", "Joshi", "Kulkarni",
  "Reddy", "Gupta", "Mehta", "Chavan", "Bose", "Rao", "Shetty", "Pillai",
] as const;

type Wing = { id: string; buildingId: string; name: string; prefix: string };
type Flat = { id: string; wingId: string; number: string; floor: number };

async function wipe() {
  // Child rows first — no FKs are declared, but ordering keeps the intent clear.
  const flatRows = await db
    .select({ id: flats.id })
    .from(flats)
    .where(eq(flats.tenantId, TENANT_ID));
  const flatIds = flatRows.map((f) => f.id);

  const residentRows = await db
    .select({ id: residents.id })
    .from(residents)
    .where(eq(residents.tenantId, TENANT_ID));
  const residentIds = residentRows.map((r) => r.id);

  if (residentIds.length) {
    await db
      .delete(residentFamilyMembers)
      .where(inArray(residentFamilyMembers.residentId, residentIds));
    await db
      .delete(verificationDocuments)
      .where(inArray(verificationDocuments.residentId, residentIds));
  }
  if (flatIds.length) {
    await db.delete(billLineItems).where(eq(billLineItems.tenantId, TENANT_ID));
    await db.delete(payments).where(eq(payments.tenantId, TENANT_ID));
    await db.delete(bills).where(eq(bills.tenantId, TENANT_ID));
    await db.delete(complaints).where(eq(complaints.tenantId, TENANT_ID));
  }

  for (const table of [
    residents, residentProfiles, invitations, notices, notifications,
    auditLogs, userRoles, flats, wings, buildings,
  ] as const) {
    await db.delete(table).where(eq(table.tenantId, TENANT_ID));
  }

  // Demo users are global rows, so remove them by their deterministic ids.
  const ids = Array.from({ length: 120 }, (_, i) => userId(i));
  await db.delete(users).where(inArray(users.id, ids));
  await db.delete(societies).where(eq(societies.id, TENANT_ID));
}

async function build() {
  await db.insert(societies).values({
    id: TENANT_ID,
    name: "Green Meadows Society",
    address: "Baner Road",
    city: "Pune",
    pincode: "411045",
    timezone: "Asia/Kolkata",
  });

  const towerA = demoId(2, 1);
  const towerB = demoId(2, 2);
  await db.insert(buildings).values([
    { id: towerA, tenantId: TENANT_ID, name: "Tower A" },
    { id: towerB, tenantId: TENANT_ID, name: "Tower B" },
  ]);

  const wingDefs: Wing[] = [
    { id: demoId(3, 1), buildingId: towerA, name: "North", prefix: "AN" },
    { id: demoId(3, 2), buildingId: towerA, name: "South", prefix: "AS" },
    { id: demoId(3, 3), buildingId: towerB, name: "East", prefix: "BE" },
    { id: demoId(3, 4), buildingId: towerB, name: "West", prefix: "BW" },
  ];
  await db.insert(wings).values(
    wingDefs.map((w) => ({
      id: w.id, tenantId: TENANT_ID, buildingId: w.buildingId, name: w.name,
    })),
  );

  // `flats_tenant_number_uidx` is UNIQUE(tenant_id, number) — society-wide, not
  // per-wing (see phase-1-deferred.md), so numbers carry the wing prefix.
  const flatDefs: Flat[] = [];
  let flatSeq = 0;
  for (const w of wingDefs) {
    for (let floor = 1; floor <= 3; floor += 1) {
      for (let unit = 1; unit <= 3; unit += 1) {
        flatSeq += 1;
        flatDefs.push({
          id: demoId(4, flatSeq),
          wingId: w.id,
          number: `${w.prefix}-${floor}0${unit}`,
          floor,
        });
      }
    }
  }
  await db.insert(flats).values(
    flatDefs.map((f, i) => ({
      id: f.id,
      tenantId: TENANT_ID,
      wingId: f.wingId,
      number: f.number,
      floor: f.floor,
      parkingSlot: i % 4 === 3 ? null : `P-${String(i + 1).padStart(3, "0")}`,
    })),
  );

  // ── Occupancy plan ────────────────────────────────────────────────────────
  // 36 flats: 8 vacant, 16 owner-occupied, 12 tenant-occupied. Fixed rather
  // than random so the dashboard tiles are predictable when demoing.
  const vacant = new Set([2, 9, 14, 20, 25, 29, 33, 35]);
  const tenantOccupied = new Set([1, 4, 7, 11, 15, 18, 21, 24, 27, 30, 32, 34]);

  type NewUser = { id: string; name: string; phone: string; email: string };
  const newUsers: NewUser[] = [];
  const residentRows: (typeof residents.$inferInsert)[] = [];
  const profileRows: (typeof residentProfiles.$inferInsert)[] = [];
  const familyRows: (typeof residentFamilyMembers.$inferInsert)[] = [];

  let uSeq = 0;
  function makeUser(): NewUser {
    const n = uSeq++;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    return {
      id: userId(n),
      name,
      // 90-prefixed so demo numbers never collide with the pilot fixtures.
      phone: `90${String(10_000_000 + n).slice(0, 8)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${n}@greenmeadows.local`,
    };
  }

  // A spread of lifecycle states across the live memberships. Most residents in
  // a real society are settled, so `active`/`approved` dominates.
  const LIFECYCLE = [
    { status: "active", verificationStatus: "approved", weight: 24 },
    { status: "pending_verification", verificationStatus: "under_review", weight: 5 },
    { status: "pending_verification", verificationStatus: "pending", weight: 4 },
    { status: "active", verificationStatus: "rejected", weight: 2 },
    { status: "suspended", verificationStatus: "approved", weight: 2 },
    { status: "invited", verificationStatus: "pending", weight: 2 },
  ] as const;
  const lifecyclePool = LIFECYCLE.flatMap((l) =>
    Array.from({ length: l.weight }, () => l),
  );
  let lifeIdx = 0;

  let rSeq = 0;
  flatDefs.forEach((flat, i) => {
    if (vacant.has(i)) return;

    const isTenant = tenantOccupied.has(i);
    const life = lifecyclePool[lifeIdx++ % lifecyclePool.length]!;

    // A previous occupancy period on roughly every third occupied flat, so the
    // flat History tab and the moved-out filter both have something to show.
    if (i % 3 === 0) {
      const prev = makeUser();
      newUsers.push(prev);
      residentRows.push({
        id: demoId(5, ++rSeq),
        tenantId: TENANT_ID,
        userId: prev.id,
        flatId: flat.id,
        isOwner: false,
        residentType: "tenant",
        isPrimary: true,
        status: "moved_out",
        verificationStatus: "approved",
        moveInDate: iso(900 + i),
        moveOutDate: iso(200 + i),
        moveOutReason: pick(["Lease ended", "Relocated for work", "Bought own flat"]),
        activeKey: null,
      });
    }

    const person = makeUser();
    newUsers.push(person);
    const residentId = demoId(5, ++rSeq);
    residentRows.push({
      id: residentId,
      tenantId: TENANT_ID,
      userId: person.id,
      flatId: flat.id,
      isOwner: !isTenant,
      residentType: isTenant ? "tenant" : "owner",
      isPrimary: true,
      status: life.status,
      verificationStatus: life.verificationStatus,
      rejectionReason:
        life.verificationStatus === "rejected"
          ? "ID proof was unreadable — please re-upload"
          : null,
      moveInDate: iso(30 + i * 4),
      activeKey: "Y",
    });

    if (i % 2 === 0) {
      profileRows.push({
        id: demoId(6, rSeq),
        tenantId: TENANT_ID,
        userId: person.id,
        emergencyContactName: `${pick(FIRST)} ${pick(LAST)}`,
        emergencyContactRelation: pick(["Spouse", "Parent", "Sibling"]),
        emergencyContactPhone: `98${String(20_000_000 + rSeq).slice(0, 8)}`,
        vehicleNumber: `MH12${String.fromCharCode(65 + (rSeq % 26))}${String.fromCharCode(65 + ((rSeq * 7) % 26))}${String(1000 + rSeq).slice(0, 4)}`,
        communicationPrefsJson: JSON.stringify({
          inApp: true,
          email: rSeq % 3 !== 0,
          push: rSeq % 2 === 0,
        }),
      });
    }

    if (i % 3 !== 1) {
      const count = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < count; k += 1) {
        familyRows.push({
          id: demoId(7, familyRows.length + 1),
          tenantId: TENANT_ID,
          residentId,
          name: `${pick(FIRST)} ${person.name.split(" ")[1]}`,
          relationship: pick(["spouse", "child", "parent"] as const),
          phone: k === 0 ? `97${String(30_000_000 + familyRows.length).slice(0, 8)}` : null,
        });
      }
    }
  });

  await db.insert(users).values(
    newUsers.map((u) => ({ id: u.id, phone: u.phone, name: u.name, email: u.email })),
  );
  await db.insert(userRoles).values(
    newUsers.map((u, i) => ({
      id: demoId(8, i + 1),
      tenantId: TENANT_ID,
      userId: u.id,
      role: "resident" as const,
    })),
  );
  await db.insert(residents).values(residentRows);
  if (profileRows.length) await db.insert(residentProfiles).values(profileRows);
  if (familyRows.length) await db.insert(residentFamilyMembers).values(familyRows);

  // ── Society team ──────────────────────────────────────────────────────────
  // The pilot chairperson and resident join this society too, so the same login
  // works and the society switcher has something to switch between.
  await db.insert(userRoles).values([
    { id: demoId(9, 1), tenantId: TENANT_ID, userId: PILOT_ADMIN_USER_ID, role: "chairperson" },
    { id: demoId(9, 2), tenantId: TENANT_ID, userId: PILOT_ADMIN_USER_ID, role: "resident" },
    { id: demoId(9, 3), tenantId: TENANT_ID, userId: PILOT_RESIDENT_USER_ID, role: "resident" },
  ]);

  // Give both a live membership so Resident mode works in this society.
  const chairFlat = flatDefs[0]!;
  const residentFlat = flatDefs[5]!;
  await db.insert(residents).values([
    {
      id: demoId(5, 900), tenantId: TENANT_ID, userId: PILOT_ADMIN_USER_ID,
      flatId: chairFlat.id, isOwner: true, residentType: "owner", isPrimary: false,
      status: "active", verificationStatus: "approved", moveInDate: iso(400), activeKey: "Y",
    },
    {
      id: demoId(5, 901), tenantId: TENANT_ID, userId: PILOT_RESIDENT_USER_ID,
      flatId: residentFlat.id, isOwner: true, residentType: "owner", isPrimary: false,
      status: "active", verificationStatus: "approved", moveInDate: iso(380), activeKey: "Y",
    },
  ]);

  // Two more committee members, so the Team screen is not a single row.
  const secretary = makeUser();
  const treasurer = makeUser();
  await db.insert(users).values([
    { id: secretary.id, phone: secretary.phone, name: secretary.name, email: secretary.email },
    { id: treasurer.id, phone: treasurer.phone, name: treasurer.name, email: treasurer.email },
  ]);
  await db.insert(userRoles).values([
    { id: demoId(9, 4), tenantId: TENANT_ID, userId: secretary.id, role: "secretary" },
    { id: demoId(9, 5), tenantId: TENANT_ID, userId: treasurer.id, role: "treasurer" },
  ]);

  // ── Invitations: one in each status ───────────────────────────────────────
  // `active_key` is `lower(email|phone|role)` while pending and NULL otherwise,
  // so only the pending rows carry one.
  const invites: (typeof invitations.$inferInsert)[] = [
    ...[0, 1, 2, 3].map((n) => {
      const email = `newcomer${n}@greenmeadows.local`;
      return {
        id: demoId(10, n + 1),
        tenantId: TENANT_ID,
        email,
        phone: `96${String(40_000_000 + n).slice(0, 8)}`,
        role: "resident" as const,
        token: `demo-invite-token-${n}`,
        status: "pending" as const,
        invitedBy: PILOT_ADMIN_USER_ID,
        name: `${pick(FIRST)} ${pick(LAST)}`,
        flatId: flatDefs[Array.from(vacant)[n]!]!.id,
        residentType: "owner" as const,
        expiresAt: iso(-7),
        lastSentAt: iso(n),
        resendCount: n === 2 ? 2 : 0,
        activeKey: `${email}|resident`.toLowerCase(),
      };
    }),
    {
      id: demoId(10, 5), tenantId: TENANT_ID, email: "expired@greenmeadows.local",
      phone: "9640000009", role: "resident", token: "demo-invite-token-expired",
      status: "expired", invitedBy: PILOT_ADMIN_USER_ID, name: "Expired Invitee",
      expiresAt: iso(10), activeKey: null,
    },
    {
      id: demoId(10, 6), tenantId: TENANT_ID, email: "revoked@greenmeadows.local",
      phone: "9640000010", role: "resident", token: "demo-invite-token-revoked",
      status: "revoked", invitedBy: PILOT_ADMIN_USER_ID, name: "Revoked Invitee",
      revokedAt: iso(3), activeKey: null,
    },
  ];
  await db.insert(invitations).values(invites);

  // ── Notices, complaints and bills ─────────────────────────────────────────
  await db.insert(notices).values([
    {
      id: demoId(11, 1), tenantId: TENANT_ID, title: "Water tank cleaning — Sunday",
      body: "Supply will be interrupted from 9am to 2pm across both towers.",
      audience: "all", publishedAt: iso(2), createdBy: PILOT_ADMIN_USER_ID,
    },
    {
      id: demoId(11, 2), tenantId: TENANT_ID, title: "Lift maintenance — Tower A North",
      body: "The North wing lift will be under AMC servicing on Tuesday.",
      audience: "wing", wingId: wingDefs[0]!.id, publishedAt: iso(5),
      createdBy: PILOT_ADMIN_USER_ID,
    },
    {
      id: demoId(11, 3), tenantId: TENANT_ID, title: "Diwali celebration — draft",
      body: "Proposed budget and volunteer list. Not published yet.",
      audience: "all", createdBy: PILOT_ADMIN_USER_ID,
    },
  ]);

  const complaintSeeds = [
    { t: "Water leakage in bathroom ceiling", type: "plumbing", status: "open" },
    { t: "Corridor light not working", type: "electric", status: "assigned" },
    { t: "Lift making grinding noise", type: "lift", status: "in_progress" },
    { t: "Garbage not collected since Monday", type: "housekeeping", status: "resolved" },
    { t: "Main gate barrier stuck", type: "security", status: "closed" },
    { t: "Seepage on the north wall", type: "other", status: "open" },
  ] as const;
  await db.insert(complaints).values(
    complaintSeeds.map((c, i) => ({
      id: demoId(12, i + 1),
      tenantId: TENANT_ID,
      ticketNumber: `GM-${String(1001 + i)}`,
      title: c.t,
      type: c.type,
      description: `${c.t}. Reported by the resident via the app.`,
      status: c.status,
      flatId: flatDefs[i * 3]!.id,
      raisedByUserId: newUsers[i]!.id,
      createdBy: newUsers[i]!.id,
      createdAt: iso(i * 3 + 1),
    })),
  );

  // Two periods of bills over the occupied flats, most recent partly unpaid.
  const occupied = flatDefs.filter((_, i) => !vacant.has(i));
  const billRows: (typeof bills.$inferInsert)[] = [];
  const lineRows: (typeof billLineItems.$inferInsert)[] = [];
  let bSeq = 0;
  for (const period of ["2026-07", "2026-08"] as const) {
    occupied.forEach((flat, i) => {
      bSeq += 1;
      const amount = 250_000 + (i % 5) * 25_000;
      const billId = demoId(13, bSeq);
      billRows.push({
        id: billId,
        tenantId: TENANT_ID,
        flatId: flat.id,
        periodYm: period,
        amountPaise: amount,
        status: period === "2026-07" ? "paid" : i % 3 === 0 ? "paid" : "issued",
        createdBy: PILOT_ADMIN_USER_ID,
      });
      lineRows.push(
        { id: demoId(14, bSeq * 2 - 1), tenantId: TENANT_ID, billId, label: "Maintenance", amountPaise: amount - 50_000 },
        { id: demoId(14, bSeq * 2), tenantId: TENANT_ID, billId, label: "Sinking fund", amountPaise: 50_000 },
      );
    });
  }
  await db.insert(bills).values(billRows);
  await db.insert(billLineItems).values(lineRows);

  return {
    flats: flatDefs.length,
    vacant: vacant.size,
    tenantOccupied: tenantOccupied.size,
    residents: residentRows.length,
    users: newUsers.length + 2,
    families: familyRows.length,
    invites: invites.length,
    bills: billRows.length,
  };
}

async function main() {
  console.log("Wiping any previous demo society…");
  await wipe();
  console.log("Building Green Meadows Society…");
  const stats = await build();

  console.log("");
  console.log("Demo society ready — Green Meadows Society");
  console.log(`  flats:      ${stats.flats} (${stats.vacant} vacant, ${stats.tenantOccupied} tenant-occupied)`);
  console.log(`  residents:  ${stats.residents} membership rows (live + closed periods)`);
  console.log(`  users:      ${stats.users}`);
  console.log(`  family:     ${stats.families}`);
  console.log(`  invites:    ${stats.invites} (pending, expired, revoked)`);
  console.log(`  bills:      ${stats.bills} across 2 periods`);
  console.log("");
  console.log("Sign in with the usual pilot logins — both now belong to two");
  console.log("societies, so the society switcher appears after login:");
  console.log("  chairperson 9999999999 / OTP 123456");
  console.log("  resident    8888888888 / OTP 123456");
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
