import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { SocietyResidentDto } from "@society-hub/types";
import { db } from "../../db/client";
import { flats, residents, users, wings } from "../../db/schema";

export async function listResidentsForTenant(
  tenantId: string,
  flatId?: string,
): Promise<SocietyResidentDto[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      flatId: flats.id,
      flatNumber: flats.number,
      wingName: wings.name,
      isOwner: residents.isOwner,
    })
    .from(residents)
    .innerJoin(users, eq(users.id, residents.userId))
    .innerJoin(flats, eq(flats.id, residents.flatId))
    .leftJoin(wings, eq(wings.id, flats.wingId))
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
        eq(users.isDeleted, false),
        eq(flats.isDeleted, false),
        ...(flatId ? [eq(residents.flatId, flatId)] : []),
      ),
    )
    .orderBy(asc(flats.number), asc(users.name));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    flatId: row.flatId,
    flatNumber: row.flatNumber,
    wingName: row.wingName,
    isOwner: row.isOwner,
  }));
}
