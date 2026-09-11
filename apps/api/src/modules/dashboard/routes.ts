import { Elysia } from "elysia";
import { and, count, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { DashboardStatsDto } from "@society-hub/types";
import { listQuerySchema } from "@society-hub/validation";
import { db } from "../../db/client";
import { bills, bookings, complaints, notices, notifications } from "../../db/schema";
import { authPlugin, isStaffRole, requireAuth } from "../../lib/auth-context";
import { occupancyStats } from "../residents/repository";
import { listActiveFlatIdsForUser } from "../complaints/flat-access";

export const dashboardRoutes = new Elysia({ prefix: "/v1/dashboard" })
  .use(authPlugin)
  .get("/stats", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const { mine } = listQuerySchema
      .pick({ mine: true })
      .parse(query ?? {});
    const staff = isStaffRole(claims.role);
    /** Society-wide KPIs only in admin staff view; Resident mode uses mine=1. */
    const societyWide = staff && !mine;

    let complaintWhere;
    if (societyWide) {
      complaintWhere = and(
        eq(complaints.tenantId, claims.tenantId),
        eq(complaints.isDeleted, false),
      );
    } else {
      const flatIds = await listActiveFlatIdsForUser(claims.tenantId, claims.sub);
      complaintWhere =
        flatIds.length === 0
          ? and(
              eq(complaints.tenantId, claims.tenantId),
              eq(complaints.id, "__none__"),
              eq(complaints.isDeleted, false),
            )
          : and(
              eq(complaints.tenantId, claims.tenantId),
              inArray(complaints.flatId, flatIds),
              eq(complaints.isDeleted, false),
            );
    }

    const [[openRow], [totalRow]] = await Promise.all([
      db
        .select({ total: count() })
        .from(complaints)
        .where(and(complaintWhere, inArray(complaints.status, ["open", "assigned", "in_progress"]))),
      db.select({ total: count() }).from(complaints).where(complaintWhere),
    ]);

    const billWhere = societyWide
      ? and(eq(bills.tenantId, claims.tenantId), eq(bills.isDeleted, false))
      : and(
          eq(bills.tenantId, claims.tenantId),
          claims.flatId ? eq(bills.flatId, claims.flatId) : eq(bills.flatId, "__none__"),
          eq(bills.isDeleted, false),
        );

    const outstandingRows = await db
      .select({ amountPaise: bills.amountPaise })
      .from(bills)
      .where(and(billWhere, inArray(bills.status, ["issued"])));
    const duesOutstandingPaise = outstandingRows.reduce((sum, b) => sum + b.amountPaise, 0);

    const bookingWhere = societyWide
      ? and(
          eq(bookings.tenantId, claims.tenantId),
          eq(bookings.isDeleted, false),
          ne(bookings.status, "cancelled"),
        )
      : and(
          eq(bookings.tenantId, claims.tenantId),
          eq(bookings.bookedByUserId, claims.sub),
          eq(bookings.isDeleted, false),
          ne(bookings.status, "cancelled"),
        );

    const [bookingRow] = await db
      .select({ total: count() })
      .from(bookings)
      .where(bookingWhere);

    const [noticeRow] = await db
      .select({ total: count() })
      .from(notices)
      .where(
        and(
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
          isNotNull(notices.publishedAt),
          isNull(notices.unpublishedAt),
        ),
      );

    const [unreadRow] = await db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, claims.tenantId),
          eq(notifications.userId, claims.sub),
          eq(notifications.isDeleted, false),
          isNull(notifications.readAt),
        ),
      );

    const stats: DashboardStatsDto = {
      openComplaints: Number(openRow?.total ?? 0),
      totalComplaints: Number(totalRow?.total ?? 0),
      duesOutstandingPaise,
      upcomingBookings: Number(bookingRow?.total ?? 0),
      publishedNotices: Number(noticeRow?.total ?? 0),
      unreadNotifications: Number(unreadRow?.total ?? 0),
      // Occupancy is a society-wide fact; Resident mode has no use for it.
      occupancy: societyWide ? await occupancyStats(claims.tenantId) : null,
    };
    return stats;
  });
