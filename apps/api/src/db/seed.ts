import { and, eq } from "drizzle-orm";
import { hashPassword } from "@society-hub/auth";
import { closeDb, db } from "./client";
import {
  buildings,
  flats,
  residents,
  societies,
  userRoles,
  users,
  wings,
} from "./schema";

function id() {
  return crypto.randomUUID();
}

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_USER_ID = "22222222-2222-2222-2222-222222222222";
const RESIDENT_USER_ID = "33333333-3333-3333-3333-333333333333";
const SUPERADMIN_USER_ID = "77777777-7777-7777-7777-777777777777";
const BUILDING_ID = "44444444-4444-4444-4444-444444444444";
const WING_ID = "55555555-5555-5555-5555-555555555555";
const FLAT_ID = "66666666-6666-6666-6666-666666666666";

const SUPERADMIN_USERNAME = "superadmin";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? "Test@1234";
const SUPERADMIN_EMAIL =
  process.env.SUPERADMIN_EMAIL ?? "superadmin@societyhub.local";
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME ?? "Platform Superadmin";

async function ensureSociety() {
  const existing = await db
    .select()
    .from(societies)
    .where(eq(societies.id, TENANT_ID))
    .limit(1);
  if (existing.length) return false;

  await db.insert(societies).values({
    id: TENANT_ID,
    name: "Keshav Heights",
    address: "Pilot Society",
    city: "Pune",
    pincode: "411001",
    timezone: "Asia/Kolkata",
  });

  await db.insert(buildings).values({
    id: BUILDING_ID,
    tenantId: TENANT_ID,
    name: "Tower A",
  });

  await db.insert(wings).values({
    id: WING_ID,
    tenantId: TENANT_ID,
    buildingId: BUILDING_ID,
    name: "A",
  });

  await db.insert(flats).values({
    id: FLAT_ID,
    tenantId: TENANT_ID,
    wingId: WING_ID,
    number: "101",
  });

  await db.insert(users).values([
    {
      id: ADMIN_USER_ID,
      phone: "9999999999",
      name: "Society Admin",
      email: "admin@keshav.local",
    },
    {
      id: RESIDENT_USER_ID,
      phone: "8888888888",
      name: "Demo Resident",
      email: "resident@keshav.local",
    },
  ]);

  await db.insert(userRoles).values([
    {
      id: id(),
      tenantId: TENANT_ID,
      userId: ADMIN_USER_ID,
      role: "chairperson",
    },
    {
      id: id(),
      tenantId: TENANT_ID,
      userId: RESIDENT_USER_ID,
      role: "resident",
    },
  ]);

  await db.insert(residents).values({
    id: id(),
    tenantId: TENANT_ID,
    userId: RESIDENT_USER_ID,
    flatId: FLAT_ID,
    isOwner: true,
  });

  // President/chairperson is also a resident of the society (dual Admin | Resident use).
  await db.insert(residents).values({
    id: id(),
    tenantId: TENANT_ID,
    userId: ADMIN_USER_ID,
    flatId: FLAT_ID,
    isOwner: false,
  });

  return true;
}

/** Idempotent: ensure the seeded chairperson has a flat link for Resident mode. */
async function ensureChairpersonResident() {
  const [existing] = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, TENANT_ID),
        eq(residents.userId, ADMIN_USER_ID),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);
  if (existing) return;

  const [flat] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.id, FLAT_ID), eq(flats.isDeleted, false)))
    .limit(1);
  if (!flat) return;

  await db.insert(residents).values({
    id: id(),
    tenantId: TENANT_ID,
    userId: ADMIN_USER_ID,
    flatId: FLAT_ID,
    isOwner: false,
  });
  console.log("Linked chairperson (9999999999) to flat 101 for Resident mode");
}

async function ensureSuperadmin() {
  const passwordHash = await hashPassword(SUPERADMIN_PASSWORD);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.username, SUPERADMIN_USERNAME))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        name: SUPERADMIN_NAME,
        email: SUPERADMIN_EMAIL,
        isDeleted: false,
      })
      .where(eq(users.id, existing.id));

    const [role] = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, existing.id),
          eq(userRoles.role, "superadmin"),
          eq(userRoles.tenantId, TENANT_ID),
        ),
      )
      .limit(1);
    if (!role) {
      await db.insert(userRoles).values({
        id: id(),
        tenantId: TENANT_ID,
        userId: existing.id,
        role: "superadmin",
      });
    }
    return;
  }

  await db.insert(users).values({
    id: SUPERADMIN_USER_ID,
    username: SUPERADMIN_USERNAME,
    passwordHash,
    name: SUPERADMIN_NAME,
    email: SUPERADMIN_EMAIL,
  });

  await db.insert(userRoles).values({
    id: id(),
    tenantId: TENANT_ID,
    userId: SUPERADMIN_USER_ID,
    role: "superadmin",
  });
}

async function main() {
  const created = await ensureSociety();
  await ensureSuperadmin();
  await ensureChairpersonResident();

  if (created) {
    console.log("Seeded Keshav Heights");
    console.log("Admin phone: 9999999999 (chairperson + resident of flat 101)");
    console.log("Resident phone: 8888888888");
    console.log("Dev OTP code: 123456 (when DEV_AUTH=true)");
  } else {
    console.log("Keshav Heights already present");
  }
  console.log(`Superadmin email: ${SUPERADMIN_EMAIL}`);
  console.log("Superadmin password: (from SUPERADMIN_PASSWORD or default seed)");
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
