/**
 * Soft-delete societies (and related tenant rows) created by local API
 * integration tests / manual experiments.
 *
 * Cypress E2E suites mock the API and do not write to MySQL — the "Coverage
 * Society …" / "Other Soc …" rows you see in select-society come from
 * `api.integration.test.ts`, not Cypress.
 *
 * Keeps the pilot society (Keshav Heights) by default so local + Cypress
 * fixtures stay aligned with seed IDs.
 *
 * Usage:
 *   bun run db:cleanup-test
 *   KEEP_SOCIETY_IDS=11111111-1111-1111-1111-111111111111 bun run db:cleanup-test
 *   KEEP_SOCIETY_NAMES="Keshav Heights" bun run db:cleanup-test
 *   DRY_RUN=1 bun run db:cleanup-test
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
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
  noticeReads,
  notices,
  notifications,
  parkingSlots,
  payments,
  residentProfiles,
  residentVehicles,
  residents,
  societies,
  userRoles,
  users,
  vendors,
  visitors,
  wings,
} from "./schema";

/** Seeded pilot — also the society Cypress mocks as "Keshav Heights". */
const DEFAULT_KEEP_SOCIETY_ID = "11111111-1111-1111-1111-111111111111";

const SEED_USER_IDS = [
  "22222222-2222-2222-2222-222222222222", // chairperson
  "33333333-3333-3333-3333-333333333333", // resident
  "77777777-7777-7777-7777-777777777777", // superadmin
] as const;

function parseKeepIds(): string[] {
  const fromEnv = process.env.KEEP_SOCIETY_IDS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  return [DEFAULT_KEEP_SOCIETY_ID];
}

function parseKeepNames(): string[] {
  return (
    process.env.KEEP_SOCIETY_NAMES?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

type TenantSoftDeleteTable = {
  // Drizzle table column refs differ by tableName; we only need tenantId + isDeleted.
  tenantId: unknown;
  isDeleted: unknown;
};

async function softDeleteTenantRows(
  table: TenantSoftDeleteTable,
  tenantIds: string[],
  label: string,
) {
  if (!tenantIds.length) return;
  const t = table as typeof buildings;

  if (dryRun) {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(t)
      .where(and(inArray(t.tenantId, tenantIds), eq(t.isDeleted, false)));
    console.log(`[dry-run] would soft-delete ${Number(rows[0]?.n ?? 0)} ${label}`);
    return;
  }

  await db
    .update(t)
    .set({ isDeleted: true })
    .where(and(inArray(t.tenantId, tenantIds), eq(t.isDeleted, false)));
  console.log(`Soft-deleted rows in ${label}`);
}

async function main() {
  const keepIds = new Set(parseKeepIds());
  const keepNames = parseKeepNames();

  const allSocieties = await db
    .select()
    .from(societies)
    .where(eq(societies.isDeleted, false));

  for (const s of allSocieties) {
    if (keepNames.some((n) => n.toLowerCase() === s.name.toLowerCase())) {
      keepIds.add(s.id);
    }
  }

  const toRemove = allSocieties.filter((s) => !keepIds.has(s.id));
  const removeIds = toRemove.map((s) => s.id);

  console.log("Keeping societies:");
  for (const s of allSocieties.filter((x) => keepIds.has(x.id))) {
    console.log(`  - ${s.name} (${s.id})`);
  }
  if (![...keepIds].some((id) => allSocieties.some((s) => s.id === id))) {
    console.log(
      "  (none currently active — will still protect seed id from delete)",
    );
  }

  if (!removeIds.length) {
    console.log("No extra societies to remove.");
  } else {
    console.log(`Removing ${removeIds.length} societ(y/ies):`);
    for (const s of toRemove) {
      console.log(`  - ${s.name} (${s.id})`);
    }

    const tables: Array<[TenantSoftDeleteTable, string]> = [
      [buildings, "buildings"],
      [wings, "wings"],
      [flats, "flats"],
      [residents, "residents"],
      [residentProfiles, "resident_profiles"],
      [residentVehicles, "resident_vehicles"],
      [userRoles, "user_roles"],
      [complaints, "complaints"],
      [complaintComments, "complaint_comments"],
      [complaintStatusEvents, "complaint_status_events"],
      [complaintAttachments, "complaint_attachments"],
      [invitations, "invitations"],
      [bills, "bills"],
      [billLineItems, "bill_line_items"],
      [payments, "payments"],
      [notices, "notices"],
      [noticeReads, "notice_reads"],
      [notifications, "notifications"],
      [auditLogs, "audit_logs"],
      [visitors, "visitors"],
      [parkingSlots, "parking_slots"],
      [bookings, "bookings"],
      [assets, "assets"],
      [vendors, "vendors"],
      [events, "events"],
    ];

    for (const [table, label] of tables) {
      await softDeleteTenantRows(table, removeIds, label);
    }

    if (dryRun) {
      console.log(`[dry-run] would soft-delete ${removeIds.length} societies`);
    } else {
      await db
        .update(societies)
        .set({ isDeleted: true })
        .where(
          and(inArray(societies.id, removeIds), eq(societies.isDeleted, false)),
        );
      console.log(`Soft-deleted ${removeIds.length} societies`);
    }
  }

  const keepList = [...keepIds];
  const keptRoles = keepList.length
    ? await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.isDeleted, false),
            inArray(userRoles.tenantId, keepList),
          ),
        )
    : [];
  const usersWithKeptRole = new Set(keptRoles.map((r) => r.userId));

  const candidateUsers = await db
    .select()
    .from(users)
    .where(eq(users.isDeleted, false));

  const orphanUsers = candidateUsers.filter(
    (u) =>
      !(SEED_USER_IDS as readonly string[]).includes(u.id) &&
      u.username !== "superadmin" &&
      !usersWithKeptRole.has(u.id),
  );

  if (orphanUsers.length) {
    console.log(
      `${dryRun ? "[dry-run] would soft-delete" : "Soft-deleting"} ${orphanUsers.length} orphan test user(s)`,
    );
    if (!dryRun) {
      await db
        .update(users)
        .set({ isDeleted: true })
        .where(
          and(
            inArray(
              users.id,
              orphanUsers.map((u) => u.id),
            ),
            eq(users.isDeleted, false),
          ),
        );
    }
  } else {
    console.log("No orphan test users to remove.");
  }

  if (!dryRun && keepList.length) {
    await db
      .update(userRoles)
      .set({ isDeleted: true })
      .where(
        and(
          notInArray(userRoles.tenantId, keepList),
          eq(userRoles.isDeleted, false),
        ),
      );
  }

  console.log(
    dryRun
      ? "Dry run complete."
      : "Cleanup complete. Re-seed if needed: bun run db:seed",
  );
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
