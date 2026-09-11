/**
 * Reset the pilot society (Keshav Heights) to a clean seed shape.
 *
 * Soft-deletes corrupted CSV / integration-test residue inside the pilot tenant
 * while keeping the fixed seed IDs (society, Tower A / Wing A / flat 101, admin +
 * resident phones). Then re-links the two seed memberships.
 *
 * Usage:
 *   bun run db:reset-pilot
 *   DRY_RUN=1 bun run db:reset-pilot
 *
 * Typical local refresh:
 *   bun run db:cleanup-test && bun run db:reset-pilot && bun run db:seed && bun run db:seed-demo
 */
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { closeDb, db } from "./client";
import {
  assets,
  auditLogs,
  billLineItems,
  bills,
  bookings,
  buildings,
  complaintAttachments,
  complaintComments,
  complaintStatusEvents,
  complaints,
  events,
  flats,
  invitations,
  noticeAttachments,
  noticeReads,
  notices,
  notifications,
  parkingSlots,
  payments,
  residentFamilyMembers,
  residentProfiles,
  residentVehicles,
  residents,
  societies,
  userRoles,
  users,
  vendors,
  verificationDocuments,
  visitors,
  wings,
} from "./schema";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_USER_ID = "22222222-2222-2222-2222-222222222222";
const RESIDENT_USER_ID = "33333333-3333-3333-3333-333333333333";
const SUPERADMIN_USER_ID = "77777777-7777-7777-7777-777777777777";
const BUILDING_ID = "44444444-4444-4444-4444-444444444444";
const WING_ID = "55555555-5555-5555-5555-555555555555";
const FLAT_ID = "66666666-6666-6666-6666-666666666666";

const SEED_USER_IDS = [ADMIN_USER_ID, RESIDENT_USER_ID, SUPERADMIN_USER_ID] as const;

const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function id() {
  return crypto.randomUUID();
}

async function countWhere(
  table: { isDeleted: unknown },
  where: ReturnType<typeof and>,
) {
  const t = table as typeof flats;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(t)
    .where(and(eq(t.isDeleted, false), where));
  return Number(row?.n ?? 0);
}

async function softDeleteWhere(
  table: { isDeleted: unknown },
  where: ReturnType<typeof and> | undefined,
  label: string,
) {
  const t = table as typeof flats;
  const condition = where
    ? and(eq(t.isDeleted, false), where)
    : eq(t.isDeleted, false);

  if (dryRun) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(t)
      .where(condition);
    console.log(`[dry-run] would soft-delete ${Number(row?.n ?? 0)} ${label}`);
    return;
  }

  await db.update(t).set({ isDeleted: true }).where(condition);
  console.log(`Soft-deleted ${label}`);
}

async function main() {
  const [society] = await db
    .select()
    .from(societies)
    .where(and(eq(societies.id, TENANT_ID), eq(societies.isDeleted, false)))
    .limit(1);

  if (!society) {
    console.log("Keshav Heights not found — run bun run db:seed first.");
    return;
  }

  console.log(`Resetting pilot: ${society.name} (${TENANT_ID})`);
  console.log(
    dryRun
      ? "DRY_RUN=1 — no writes"
      : "Keeping seed Tower A / Wing A / flat 101 + admin/resident/superadmin users",
  );

  const beforeFlats = await countWhere(flats, eq(flats.tenantId, TENANT_ID));
  const beforeResidents = await countWhere(
    residents,
    eq(residents.tenantId, TENANT_ID),
  );
  const beforeParkings = await countWhere(
    parkingSlots,
    eq(parkingSlots.tenantId, TENANT_ID),
  );
  console.log(
    `Before: flats=${beforeFlats} residents=${beforeResidents} parkings=${beforeParkings}`,
  );

  const tenantEq = eq(flats.tenantId, TENANT_ID);

  // Child / ops tables for the whole pilot tenant
  await softDeleteWhere(
    residentFamilyMembers,
    eq(residentFamilyMembers.tenantId, TENANT_ID),
    "resident_family_members",
  );
  await softDeleteWhere(
    verificationDocuments,
    eq(verificationDocuments.tenantId, TENANT_ID),
    "verification_documents",
  );
  await softDeleteWhere(
    residentVehicles,
    eq(residentVehicles.tenantId, TENANT_ID),
    "resident_vehicles",
  );
  await softDeleteWhere(
    residentProfiles,
    eq(residentProfiles.tenantId, TENANT_ID),
    "resident_profiles",
  );
  await softDeleteWhere(
    complaintAttachments,
    eq(complaintAttachments.tenantId, TENANT_ID),
    "complaint_attachments",
  );
  await softDeleteWhere(
    complaintComments,
    eq(complaintComments.tenantId, TENANT_ID),
    "complaint_comments",
  );
  await softDeleteWhere(
    complaintStatusEvents,
    eq(complaintStatusEvents.tenantId, TENANT_ID),
    "complaint_status_events",
  );
  await softDeleteWhere(
    complaints,
    eq(complaints.tenantId, TENANT_ID),
    "complaints",
  );
  await softDeleteWhere(
    billLineItems,
    eq(billLineItems.tenantId, TENANT_ID),
    "bill_line_items",
  );
  await softDeleteWhere(payments, eq(payments.tenantId, TENANT_ID), "payments");
  await softDeleteWhere(bills, eq(bills.tenantId, TENANT_ID), "bills");
  await softDeleteWhere(
    noticeAttachments,
    eq(noticeAttachments.tenantId, TENANT_ID),
    "notice_attachments",
  );
  await softDeleteWhere(
    noticeReads,
    eq(noticeReads.tenantId, TENANT_ID),
    "notice_reads",
  );
  await softDeleteWhere(notices, eq(notices.tenantId, TENANT_ID), "notices");
  await softDeleteWhere(
    notifications,
    eq(notifications.tenantId, TENANT_ID),
    "notifications",
  );
  await softDeleteWhere(
    invitations,
    eq(invitations.tenantId, TENANT_ID),
    "invitations",
  );
  await softDeleteWhere(visitors, eq(visitors.tenantId, TENANT_ID), "visitors");
  await softDeleteWhere(
    parkingSlots,
    eq(parkingSlots.tenantId, TENANT_ID),
    "parking_slots",
  );
  await softDeleteWhere(bookings, eq(bookings.tenantId, TENANT_ID), "bookings");
  await softDeleteWhere(assets, eq(assets.tenantId, TENANT_ID), "assets");
  await softDeleteWhere(vendors, eq(vendors.tenantId, TENANT_ID), "vendors");
  await softDeleteWhere(events, eq(events.tenantId, TENANT_ID), "events");
  await softDeleteWhere(
    auditLogs,
    eq(auditLogs.tenantId, TENANT_ID),
    "audit_logs",
  );

  // Close every membership (including already soft-deleted) so active_key unique index frees up
  if (dryRun) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(residents)
      .where(eq(residents.tenantId, TENANT_ID));
    console.log(`[dry-run] would close ${Number(row?.n ?? 0)} resident rows`);
  } else {
    await db
      .update(residents)
      .set({
        isDeleted: true,
        activeKey: null,
        status: "moved_out",
        moveOutDate: new Date().toISOString().slice(0, 10),
        moveOutReason: "Pilot data reset",
      })
      .where(eq(residents.tenantId, TENANT_ID));
    console.log("Closed all pilot resident rows (cleared active_key)");
  }

  // Extra flats / wings / buildings beyond the seed hierarchy
  await softDeleteWhere(
    flats,
    and(eq(flats.tenantId, TENANT_ID), ne(flats.id, FLAT_ID)),
    "extra flats",
  );
  await softDeleteWhere(
    wings,
    and(eq(wings.tenantId, TENANT_ID), ne(wings.id, WING_ID)),
    "extra wings",
  );
  await softDeleteWhere(
    buildings,
    and(eq(buildings.tenantId, TENANT_ID), ne(buildings.id, BUILDING_ID)),
    "extra buildings",
  );

  // Extra staff roles beyond chairperson / resident / superadmin seed users
  await softDeleteWhere(
    userRoles,
    and(
      eq(userRoles.tenantId, TENANT_ID),
      notInArray(userRoles.userId, [...SEED_USER_IDS]),
    ),
    "extra user_roles",
  );

  // Orphan users created by CSV / tests (not seed trio, no remaining live role)
  const liveRoleUsers = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.isDeleted, false), eq(userRoles.tenantId, TENANT_ID)));
  const keepUsers = new Set<string>([
    ...SEED_USER_IDS,
    ...liveRoleUsers.map((r) => r.userId),
  ]);

  const allUsers = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.isDeleted, false));
  const orphans = allUsers.filter((u) => !keepUsers.has(u.id));

  if (orphans.length) {
    console.log(
      `${dryRun ? "[dry-run] would soft-delete" : "Soft-deleting"} ${orphans.length} orphan user(s)`,
    );
    if (!dryRun) {
      await db
        .update(users)
        .set({ isDeleted: true })
        .where(
          and(
            inArray(
              users.id,
              orphans.map((u) => u.id),
            ),
            eq(users.isDeleted, false),
          ),
        );
    }
  }

  if (!dryRun) {
    // Ensure seed structure rows are alive
    await db
      .update(societies)
      .set({ isDeleted: false, name: "Keshav Heights" })
      .where(eq(societies.id, TENANT_ID));
    await db
      .update(buildings)
      .set({ isDeleted: false, name: "Tower A" })
      .where(eq(buildings.id, BUILDING_ID));
    await db
      .update(wings)
      .set({ isDeleted: false, name: "A" })
      .where(eq(wings.id, WING_ID));
    await db
      .update(flats)
      .set({
        isDeleted: false,
        number: "101",
        floor: 7,
        parkingSlot: null,
        adultCount: 2,
        childCount: 0,
        seniorCitizenCount: 0,
        pngGasConnection: false,
      })
      .where(eq(flats.id, FLAT_ID));

    // Fresh clean memberships
    await db.insert(residents).values([
      {
        id: id(),
        tenantId: TENANT_ID,
        userId: RESIDENT_USER_ID,
        flatId: FLAT_ID,
        isOwner: true,
        residentType: "owner",
        isPrimary: true,
        status: "active",
        verificationStatus: "approved",
        activeKey: "Y",
      },
      {
        id: id(),
        tenantId: TENANT_ID,
        userId: ADMIN_USER_ID,
        flatId: FLAT_ID,
        isOwner: false,
        residentType: "family",
        isPrimary: false,
        status: "active",
        verificationStatus: "approved",
        activeKey: "Y",
      },
    ]);

    // A few genuine parking lots for onboard demos
    await db.insert(parkingSlots).values([
      {
        id: id(),
        tenantId: TENANT_ID,
        kind: "puzzle",
        wing: "A",
        slotNumber: "101",
        type: "car",
      },
      {
        id: id(),
        tenantId: TENANT_ID,
        kind: "puzzle",
        wing: "A",
        slotNumber: "102",
        type: "car",
      },
      {
        id: id(),
        tenantId: TENANT_ID,
        kind: "open",
        wing: null,
        slotNumber: "12",
        type: "car",
      },
      {
        id: id(),
        tenantId: TENANT_ID,
        kind: "open",
        wing: null,
        slotNumber: "13",
        type: "bike",
      },
    ]);
  }

  const afterFlats = await countWhere(flats, eq(flats.tenantId, TENANT_ID));
  const afterResidents = await countWhere(
    residents,
    eq(residents.tenantId, TENANT_ID),
  );
  const afterParkings = await countWhere(
    parkingSlots,
    eq(parkingSlots.tenantId, TENANT_ID),
  );
  console.log(
    `After: flats=${afterFlats} residents=${afterResidents} parkings=${afterParkings}`,
  );
  console.log(
    dryRun
      ? "Dry run complete."
      : "Pilot reset complete. Log in: admin 9999999999 / resident 8888888888 (OTP 123456). Optional: bun run db:seed-demo",
  );

  // silence unused in dry-run path
  void tenantEq;
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
