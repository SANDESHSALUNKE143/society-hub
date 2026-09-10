import { and, asc, count, desc, eq, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import type {
  CommunicationPreferences,
  FlatOccupancyHistoryEntryDto,
  FlatOccupancyStatus,
  FlatOccupancySummaryDto,
  FlatOccupantDto,
  Paginated,
  ResidentDocumentDto,
  ResidentFamilyMemberDto,
  ResidentSummaryDto,
  ResidentVehicleDto,
  Role,
} from "@society-hub/types";
import type { residentListQuerySchema } from "@society-hub/validation";
import type { z } from "zod";
import { db } from "../../db/client";
import {
  buildings,
  flats,
  invitations,
  residentFamilyMembers,
  residentProfiles,
  residentVehicles,
  residents,
  userRoles,
  users,
  verificationDocuments,
  wings,
} from "../../db/schema";
import { AppError } from "../../lib/errors";

export type ResidentListQuery = z.infer<typeof residentListQuerySchema>;

export const DEFAULT_COMMUNICATION_PREFERENCES: CommunicationPreferences = {
  inApp: true,
  push: true,
  email: true,
  whatsapp: false,
  sms: false,
};

export function parseCommunicationPreferences(
  raw: string | null | undefined,
): CommunicationPreferences {
  if (!raw) return { ...DEFAULT_COMMUNICATION_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<CommunicationPreferences>;
    return { ...DEFAULT_COMMUNICATION_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_COMMUNICATION_PREFERENCES };
  }
}

/** Columns shared by the directory list and the detail read. */
const residentSelection = {
  id: residents.id,
  userId: residents.userId,
  residentType: residents.residentType,
  isPrimary: residents.isPrimary,
  status: residents.status,
  verificationStatus: residents.verificationStatus,
  moveInDate: residents.moveInDate,
  moveOutDate: residents.moveOutDate,
  createdAt: residents.createdAt,
  name: users.name,
  phone: users.phone,
  email: users.email,
  flatId: flats.id,
  flatNumber: flats.number,
  wingId: wings.id,
  wingName: wings.name,
  buildingId: buildings.id,
  buildingName: buildings.name,
  floor: flats.floor,
  parkingSlot: flats.parkingSlot,
};

type ResidentRow = {
  [K in keyof typeof residentSelection]: unknown;
} & {
  id: string;
  userId: string;
  residentType: ResidentSummaryDto["residentType"];
  isPrimary: boolean;
  status: ResidentSummaryDto["status"];
  verificationStatus: ResidentSummaryDto["verificationStatus"];
  moveInDate: string | null;
  moveOutDate: string | null;
  createdAt: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  flatId: string | null;
  flatNumber: string | null;
  wingId: string | null;
  wingName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  floor: number | null;
  parkingSlot: string | null;
};

export function toResidentSummary(row: ResidentRow): ResidentSummaryDto {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    residentType: row.residentType,
    isPrimary: Boolean(row.isPrimary),
    status: row.status,
    verificationStatus: row.verificationStatus,
    moveInDate: row.moveInDate,
    moveOutDate: row.moveOutDate,
    flat: row.flatId
      ? {
          id: row.flatId,
          number: row.flatNumber ?? "",
          wingId: row.wingId,
          wingName: row.wingName,
          buildingId: row.buildingId,
          buildingName: row.buildingName,
          floor: row.floor,
          parkingSlot: row.parkingSlot,
        }
      : null,
    createdAt: row.createdAt,
  };
}

const residentJoins = () =>
  db
    .select(residentSelection)
    .from(residents)
    .innerJoin(users, eq(users.id, residents.userId))
    .leftJoin(flats, eq(flats.id, residents.flatId))
    .leftJoin(wings, eq(wings.id, flats.wingId))
    .leftJoin(buildings, eq(buildings.id, wings.buildingId));

/**
 * Server-side search + filter + sort + page over one society's memberships.
 * Every branch pins `residents.tenant_id`, so a caller cannot widen the query
 * past their own society by tampering with the query string.
 */
export async function listResidents(
  tenantId: string,
  query: ResidentListQuery,
): Promise<Paginated<ResidentSummaryDto>> {
  const filters = [
    eq(residents.tenantId, tenantId),
    eq(residents.isDeleted, false),
    eq(users.isDeleted, false),
  ];

  if (query.search?.trim()) {
    const term = `%${query.search.trim().toLowerCase()}%`;
    filters.push(
      or(
        like(sql`lower(${users.name})`, term),
        like(users.phone, term),
        like(sql`lower(${users.email})`, term),
        like(sql`lower(${flats.number})`, term),
      )!,
    );
  }
  if (query.buildingId) filters.push(eq(buildings.id, query.buildingId));
  if (query.wingId) filters.push(eq(flats.wingId, query.wingId));
  if (query.flatId) filters.push(eq(residents.flatId, query.flatId));
  if (query.residentType) filters.push(eq(residents.residentType, query.residentType));
  if (query.status) filters.push(eq(residents.status, query.status));
  if (query.verificationStatus) {
    filters.push(eq(residents.verificationStatus, query.verificationStatus));
  }

  const where = and(...filters);
  const dir = query.order === "desc" ? desc : asc;
  const orderBy =
    query.sort === "flat"
      ? [dir(flats.number), asc(users.name)]
      : query.sort === "createdAt"
        ? [dir(residents.createdAt)]
        : query.sort === "status"
          ? [dir(residents.status), asc(users.name)]
          : [dir(users.name)];

  const offset = (query.page - 1) * query.limit;
  const [rows, [totalRow]] = await Promise.all([
    residentJoins().where(where).orderBy(...orderBy).limit(query.limit).offset(offset),
    db
      .select({ total: count() })
      .from(residents)
      .innerJoin(users, eq(users.id, residents.userId))
      .leftJoin(flats, eq(flats.id, residents.flatId))
      .leftJoin(wings, eq(wings.id, flats.wingId))
      .leftJoin(buildings, eq(buildings.id, wings.buildingId))
      .where(where),
  ]);

  return {
    items: (rows as ResidentRow[]).map(toResidentSummary),
    page: query.page,
    limit: query.limit,
    total: Number(totalRow?.total ?? 0),
  };
}

/** Loads one membership, 404-ing when it belongs to another society. */
export async function getResidentRow(tenantId: string, residentId: string) {
  const [row] = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.id, residentId),
        eq(residents.tenantId, tenantId),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Resident not found");
  return row;
}

export async function getResidentSummary(
  tenantId: string,
  residentId: string,
): Promise<ResidentSummaryDto> {
  const [row] = await residentJoins()
    .where(
      and(
        eq(residents.id, residentId),
        eq(residents.tenantId, tenantId),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Resident not found");
  return toResidentSummary(row as ResidentRow);
}

export async function listMembershipsForUser(
  tenantId: string,
  userId: string,
): Promise<ResidentSummaryDto[]> {
  const rows = await residentJoins()
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.userId, userId),
        eq(residents.isDeleted, false),
      ),
    )
    .orderBy(desc(residents.createdAt));
  return (rows as ResidentRow[]).map(toResidentSummary);
}

export async function listFamilyMembers(
  tenantId: string,
  residentId: string,
): Promise<ResidentFamilyMemberDto[]> {
  const rows = await db
    .select()
    .from(residentFamilyMembers)
    .where(
      and(
        eq(residentFamilyMembers.tenantId, tenantId),
        eq(residentFamilyMembers.residentId, residentId),
        eq(residentFamilyMembers.isDeleted, false),
      ),
    )
    .orderBy(asc(residentFamilyMembers.name));
  return rows.map((r) => ({
    id: r.id,
    residentId: r.residentId,
    name: r.name,
    relationship: r.relationship,
    phone: r.phone,
    email: r.email,
    linkedUserId: r.linkedUserId,
    createdAt: r.createdAt,
  }));
}

export function toDocumentDto(
  row: typeof verificationDocuments.$inferSelect,
  verifiedByName: string | null,
): ResidentDocumentDto {
  return {
    id: row.id,
    residentId: row.residentId,
    docType: row.docType,
    documentNumber: row.documentNumber,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    status: row.status,
    rejectionReason: row.rejectionReason,
    expiresAt: row.expiresAt,
    verifiedAt: row.verifiedAt,
    verifiedByName,
    uploadedAt: row.createdAt,
    downloadPath: `/v1/admin/resident-documents/${row.id}/file`,
  };
}

export async function listDocuments(
  tenantId: string,
  residentId: string,
): Promise<ResidentDocumentDto[]> {
  const rows = await db
    .select({ doc: verificationDocuments, verifierName: users.name })
    .from(verificationDocuments)
    .leftJoin(users, eq(users.id, verificationDocuments.verifiedBy))
    .where(
      and(
        eq(verificationDocuments.tenantId, tenantId),
        eq(verificationDocuments.residentId, residentId),
        eq(verificationDocuments.isDeleted, false),
      ),
    )
    .orderBy(desc(verificationDocuments.createdAt));
  return rows.map((r) => toDocumentDto(r.doc, r.verifierName));
}

/** Household vehicles recorded for everyone currently occupying this flat. */
export async function listVehiclesForFlat(
  tenantId: string,
  flatId: string,
): Promise<ResidentVehicleDto[]> {
  const rows = await db
    .select({
      kind: residentVehicles.kind,
      registrationNumber: residentVehicles.registrationNumber,
      parkingPurchased: residentVehicles.parkingPurchased,
      parkingSlot: residentVehicles.parkingSlot,
    })
    .from(residentVehicles)
    .innerJoin(
      residents,
      and(
        eq(residents.userId, residentVehicles.userId),
        eq(residents.tenantId, residentVehicles.tenantId),
      ),
    )
    .where(
      and(
        eq(residentVehicles.tenantId, tenantId),
        eq(residents.flatId, flatId),
        eq(residentVehicles.isDeleted, false),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
      ),
    )
    .orderBy(asc(residentVehicles.sortOrder), asc(residentVehicles.createdAt));
  return rows.map((r) => ({
    kind: r.kind as ResidentVehicleDto["kind"],
    registrationNumber: r.registrationNumber,
    parkingPurchased: Boolean(r.parkingPurchased),
    parkingSlot: r.parkingSlot ?? null,
  }));
}

export async function getProfileRow(tenantId: string, userId: string) {
  const [row] = await db
    .select()
    .from(residentProfiles)
    .where(
      and(
        eq(residentProfiles.tenantId, tenantId),
        eq(residentProfiles.userId, userId),
        eq(residentProfiles.isDeleted, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listRolesForUser(
  tenantId: string,
  userId: string,
): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.userId, userId),
        eq(userRoles.isDeleted, false),
      ),
    );
  return rows.map((r) => r.role);
}

const occupantSelection = {
  residentId: residents.id,
  userId: residents.userId,
  name: users.name,
  phone: users.phone,
  residentType: residents.residentType,
  isPrimary: residents.isPrimary,
  status: residents.status,
  verificationStatus: residents.verificationStatus,
  moveInDate: residents.moveInDate,
  moveOutDate: residents.moveOutDate,
};

/** Current occupants of a flat — `active_key = 'Y'` is the occupancy predicate. */
export async function listFlatOccupants(
  tenantId: string,
  flatId: string,
): Promise<FlatOccupantDto[]> {
  const rows = await db
    .select(occupantSelection)
    .from(residents)
    .innerJoin(users, eq(users.id, residents.userId))
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.flatId, flatId),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
      ),
    )
    .orderBy(desc(residents.isPrimary), asc(users.name));

  const ids = rows.map((r) => r.residentId);
  const familyCounts = await countFamilyByResident(tenantId, ids);
  return rows.map((r) => ({
    residentId: r.residentId,
    userId: r.userId,
    name: r.name,
    phone: r.phone,
    residentType: r.residentType,
    isPrimary: Boolean(r.isPrimary),
    status: r.status,
    verificationStatus: r.verificationStatus,
    moveInDate: r.moveInDate,
    moveOutDate: r.moveOutDate,
    familyCount: familyCounts.get(r.residentId) ?? 0,
  }));
}

async function countFamilyByResident(tenantId: string, residentIds: string[]) {
  const map = new Map<string, number>();
  if (residentIds.length === 0) return map;
  const rows = await db
    .select({
      residentId: residentFamilyMembers.residentId,
      total: count(),
    })
    .from(residentFamilyMembers)
    .where(
      and(
        eq(residentFamilyMembers.tenantId, tenantId),
        inArray(residentFamilyMembers.residentId, residentIds),
        eq(residentFamilyMembers.isDeleted, false),
      ),
    )
    .groupBy(residentFamilyMembers.residentId);
  for (const row of rows) map.set(row.residentId, Number(row.total));
  return map;
}

/** Full occupancy history of a flat, newest first. Never destructive. */
export async function listFlatHistory(
  tenantId: string,
  flatId: string,
): Promise<FlatOccupancyHistoryEntryDto[]> {
  const rows = await db
    .select({
      residentId: residents.id,
      userId: residents.userId,
      name: users.name,
      residentType: residents.residentType,
      status: residents.status,
      moveInDate: residents.moveInDate,
      moveOutDate: residents.moveOutDate,
      moveOutReason: residents.moveOutReason,
      activeKey: residents.activeKey,
      createdAt: residents.createdAt,
    })
    .from(residents)
    .innerJoin(users, eq(users.id, residents.userId))
    .where(and(eq(residents.tenantId, tenantId), eq(residents.flatId, flatId)))
    .orderBy(desc(residents.moveInDate), desc(residents.createdAt));

  return rows.map((r) => ({
    residentId: r.residentId,
    userId: r.userId,
    name: r.name,
    residentType: r.residentType,
    status: r.status,
    moveInDate: r.moveInDate,
    moveOutDate: r.moveOutDate,
    moveOutReason: r.moveOutReason,
    isCurrent: r.activeKey !== null,
  }));
}

export async function countDocumentsForFlat(tenantId: string, flatId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(verificationDocuments)
    .innerJoin(residents, eq(residents.id, verificationDocuments.residentId))
    .where(
      and(
        eq(verificationDocuments.tenantId, tenantId),
        eq(verificationDocuments.isDeleted, false),
        eq(residents.flatId, flatId),
        eq(residents.isDeleted, false),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Flat row with its wing/building names, scoped to the caller's society. */
export async function getFlatWithStructure(tenantId: string, flatId: string) {
  const [row] = await db
    .select({
      id: flats.id,
      number: flats.number,
      floor: flats.floor,
      parkingSlot: flats.parkingSlot,
      detailsJson: flats.detailsJson,
      wingId: wings.id,
      wingName: wings.name,
      buildingId: buildings.id,
      buildingName: buildings.name,
    })
    .from(flats)
    .leftJoin(wings, eq(wings.id, flats.wingId))
    .leftJoin(buildings, eq(buildings.id, wings.buildingId))
    .where(
      and(
        eq(flats.id, flatId),
        eq(flats.tenantId, tenantId),
        eq(flats.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Flat not found");
  return row;
}

/**
 * Occupancy roll-up for the Admin dashboard. Counts are computed in SQL rather
 * than by loading rows, so this stays cheap as societies grow.
 */
export async function occupancyStats(tenantId: string) {
  const [
    [flatRow],
    occupancyRows,
    statusRows,
    [pendingVerificationRow],
    [pendingInviteRow],
  ] = await Promise.all([
    db
      .select({ total: count() })
      .from(flats)
      .where(and(eq(flats.tenantId, tenantId), eq(flats.isDeleted, false))),
    db
      .select({
        flatId: residents.flatId,
        hasTenant: sql<number>`MAX(${residents.residentType} = 'tenant')`,
      })
      .from(residents)
      .innerJoin(flats, eq(flats.id, residents.flatId))
      .where(
        and(
          eq(residents.tenantId, tenantId),
          eq(residents.isDeleted, false),
          eq(flats.isDeleted, false),
          isNotNull(residents.activeKey),
        ),
      )
      .groupBy(residents.flatId),
    db
      .select({ status: residents.status, total: count() })
      .from(residents)
      .where(and(eq(residents.tenantId, tenantId), eq(residents.isDeleted, false)))
      .groupBy(residents.status),
    db
      .select({ total: count() })
      .from(residents)
      .where(
        and(
          eq(residents.tenantId, tenantId),
          eq(residents.isDeleted, false),
          inArray(residents.verificationStatus, ["pending", "under_review"]),
          isNotNull(residents.activeKey),
        ),
      ),
    db
      .select({ total: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.tenantId, tenantId),
          eq(invitations.isDeleted, false),
          eq(invitations.status, "pending"),
        ),
      ),
  ]);

  const byStatus = new Map(statusRows.map((r) => [r.status, Number(r.total)]));
  const totalFlats = Number(flatRow?.total ?? 0);
  const occupiedFlats = occupancyRows.length;
  const tenantOccupied = occupancyRows.filter((r) => Number(r.hasTenant) === 1).length;

  return {
    totalFlats,
    occupiedFlats,
    vacantFlats: Math.max(0, totalFlats - occupiedFlats),
    ownerOccupiedFlats: occupiedFlats - tenantOccupied,
    tenantOccupiedFlats: tenantOccupied,
    totalResidents: [...byStatus.values()].reduce((a, b) => a + b, 0),
    activeResidents: byStatus.get("active") ?? 0,
    pendingVerification: Number(pendingVerificationRow?.total ?? 0),
    pendingInvitations: Number(pendingInviteRow?.total ?? 0),
    movedOut: byStatus.get("moved_out") ?? 0,
  };
}

export type FlatListQuery = {
  page: number;
  limit: number;
  search?: string;
  buildingId?: string;
  wingId?: string;
  occupancy?: FlatOccupancyStatus;
};

/**
 * Paginated flat directory with derived occupancy. Occupancy is computed in SQL
 * from live memberships so it can be filtered and paged server-side rather than
 * post-filtered in the browser.
 */
export async function listFlatsWithOccupancy(
  tenantId: string,
  query: FlatListQuery,
): Promise<Paginated<FlatOccupancySummaryDto>> {
  const liveResidents = db
    .select({
      flatId: residents.flatId,
      occupants: count().as("occupants"),
      tenants: sql<number>`SUM(${residents.residentType} = 'tenant')`.as("tenants"),
    })
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
      ),
    )
    .groupBy(residents.flatId)
    .as("live_residents");

  const filters = [eq(flats.tenantId, tenantId), eq(flats.isDeleted, false)];
  if (query.search?.trim()) {
    filters.push(like(sql`lower(${flats.number})`, `%${query.search.trim().toLowerCase()}%`));
  }
  if (query.buildingId) filters.push(eq(buildings.id, query.buildingId));
  if (query.wingId) filters.push(eq(flats.wingId, query.wingId));
  if (query.occupancy === "vacant") {
    filters.push(sql`COALESCE(${liveResidents.occupants}, 0) = 0`);
  } else if (query.occupancy === "tenant_occupied") {
    filters.push(sql`COALESCE(${liveResidents.tenants}, 0) > 0`);
  } else if (query.occupancy === "owner_occupied") {
    filters.push(
      sql`COALESCE(${liveResidents.occupants}, 0) > 0 AND COALESCE(${liveResidents.tenants}, 0) = 0`,
    );
  }
  const where = and(...filters);

  const base = () =>
    db
      .select({
        id: flats.id,
        number: flats.number,
        floor: flats.floor,
        parkingSlot: flats.parkingSlot,
        wingId: wings.id,
        wingName: wings.name,
        buildingId: buildings.id,
        buildingName: buildings.name,
        occupants: sql<number>`COALESCE(${liveResidents.occupants}, 0)`,
        tenants: sql<number>`COALESCE(${liveResidents.tenants}, 0)`,
      })
      .from(flats)
      .leftJoin(wings, eq(wings.id, flats.wingId))
      .leftJoin(buildings, eq(buildings.id, wings.buildingId))
      .leftJoin(liveResidents, eq(liveResidents.flatId, flats.id));

  const offset = (query.page - 1) * query.limit;
  const [rows, [totalRow]] = await Promise.all([
    base().where(where).orderBy(asc(flats.number)).limit(query.limit).offset(offset),
    db
      .select({ total: count() })
      .from(flats)
      .leftJoin(wings, eq(wings.id, flats.wingId))
      .leftJoin(buildings, eq(buildings.id, wings.buildingId))
      .leftJoin(liveResidents, eq(liveResidents.flatId, flats.id))
      .where(where),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      number: r.number,
      wingId: r.wingId,
      wingName: r.wingName,
      buildingId: r.buildingId,
      buildingName: r.buildingName,
      floor: r.floor,
      parkingSlot: r.parkingSlot,
      occupantCount: Number(r.occupants),
      occupancyStatus:
        Number(r.occupants) === 0
          ? "vacant"
          : Number(r.tenants) > 0
            ? "tenant_occupied"
            : "owner_occupied",
    })),
    page: query.page,
    limit: query.limit,
    total: Number(totalRow?.total ?? 0),
  };
}
