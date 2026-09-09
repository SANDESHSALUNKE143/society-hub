import { Elysia } from "elysia";
import { addSocietyTeamMemberSchema } from "@society-hub/validation";
import {
  authPlugin,
  requireAuth,
  requirePlatform,
} from "../../lib/auth-context";
import { addTeamMemberToTenant } from "../admin/team-service";

/**
 * Platform-only: add a SocietyHub person (or any user) onto a society's staff
 * team so they can use Client App Admin mode.
 */
export const manageTeamRoutes = new Elysia({
  prefix: "/v1/manage/societies",
})
  .use(authPlugin)
  .post("/:id/team", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = addSocietyTeamMemberSchema.parse(body);
    return addTeamMemberToTenant(params.id, claims.sub, parsed);
  });
