import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { ZodError } from "zod";
import { env } from "./config";
import { AppError, toErrorBody } from "./lib/errors";
import { authRoutes } from "./modules/auth/routes";
import { adminRoutes } from "./modules/admin/routes";
import { teamRoutes } from "./modules/team/routes";
import {
  adminDocumentRoutes,
  adminFlatRoutes,
  adminOccupancyRoutes,
  adminResidentRoutes,
} from "./modules/residents/routes";
import { complaintRoutes, mediaRoutes } from "./modules/complaints/routes";
import {
  buildingRoutes,
  flatRoutes,
  societyRoutes,
  wingRoutes,
} from "./modules/societies/routes";
import {
  invitationPublicRoutes,
  invitationRoutes,
} from "./modules/invitations/routes";
import { billRoutes } from "./modules/bills/routes";
import { paymentRoutes } from "./modules/payments/routes";
import { noticeRoutes } from "./modules/notices/routes";
import { notificationRoutes } from "./modules/notifications/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { auditAliasRoutes, auditRoutes } from "./modules/audit/routes";
import { profileRoutes } from "./modules/profile/routes";
import { householdRoutes } from "./modules/profile/household-routes";
import { manageTeamRoutes } from "./modules/manage/team-routes";
import { manageStructureRoutes } from "./modules/manage/structure-routes";
import {
  manageActivityRoutes,
  manageUserRoutes,
} from "./modules/manage/user-routes";
import {
  assetRoutes,
  bookingRoutes,
  eventRoutes,
  parkingRoutes,
  vendorRoutes,
  visitorRoutes,
} from "./modules/misc/routes";

/** Build the HTTP app without binding a port (used by server entry + in-process tests). */
export function createApp() {
  return new Elysia()
    .use(
      cors({
        origin: env.corsOrigin,
        credentials: true,
      }),
    )
    .use(
      swagger({
        path: "/docs",
        documentation: {
          info: {
            title: "SocietyHub API",
            version: "1.0.0",
            description:
              "Mobile-ready JSON API (/v1). Auth: Authorization Bearer <accessToken>. " +
              "Narrative guide: docs/09-API.md in the repo. Errors: { code, message, details? }.",
          },
          tags: [
            { name: "Auth", description: "OTP, password, PIN, Google, refresh" },
            { name: "Societies", description: "Platform society CRUD and structure" },
            { name: "Complaints", description: "Tickets, comments, media" },
            { name: "Billing", description: "Bills and payments" },
            { name: "Notices", description: "Society notices and reads" },
            { name: "Admin", description: "Society staff admin helpers" },
            { name: "Misc", description: "Visitors, parking, bookings, assets, vendors, events" },
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
            },
          },
        },
      }),
    )
    .onError(({ error, set }) => {
      if (error instanceof ZodError) {
        set.status = 400;
        return {
          code: "validation_error",
          message: "Invalid request",
          details: error.flatten(),
        };
      }
      if (error instanceof AppError) {
        set.status = error.status;
        return {
          code: error.code,
          message: error.message,
          details: error.details,
        };
      }
      const mapped = toErrorBody(error);
      set.status = mapped.status;
      return mapped.body;
    })
    .get("/health", () => ({ ok: true, service: "society-hub-api" }))
    .use(authRoutes)
    .use(adminRoutes)
    .use(adminResidentRoutes)
    .use(adminDocumentRoutes)
    .use(adminFlatRoutes)
    .use(adminOccupancyRoutes)
    .use(teamRoutes)
    .use(complaintRoutes)
    .use(mediaRoutes)
    .use(societyRoutes)
    .use(manageTeamRoutes)
    .use(manageStructureRoutes)
    .use(manageUserRoutes)
    .use(manageActivityRoutes)
    .use(buildingRoutes)
    .use(wingRoutes)
    .use(flatRoutes)
    .use(invitationRoutes)
    .use(invitationPublicRoutes)
    .use(billRoutes)
    .use(paymentRoutes)
    .use(noticeRoutes)
    .use(notificationRoutes)
    .use(dashboardRoutes)
    .use(auditRoutes)
    .use(auditAliasRoutes)
    .use(profileRoutes)
    .use(householdRoutes)
    .use(visitorRoutes)
    .use(parkingRoutes)
    .use(bookingRoutes)
    .use(assetRoutes)
    .use(vendorRoutes)
    .use(eventRoutes);
}

export type App = ReturnType<typeof createApp>;
