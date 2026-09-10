import { Elysia } from "elysia";
import { addSocietyTeamMemberSchema } from "@society-hub/validation";
import {
  authPlugin,
  requireAuth,
  requirePlatform,
} from "../../lib/auth-context";
import {
  addTeamMemberToTenant,
  listSocietyTeamOrThrow,
  removeTeamMemberFromTenant,
} from "../admin/team-service";

/**
 * Platform-only: list, add, and remove society staff so they can use Client App Admin.
 */
export const manageTeamRoutes = new Elysia({
  prefix: "/v1/manage/societies",
})
  .use(authPlugin)
  .get("/:id/team", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return listSocietyTeamOrThrow(params.id);
  })
  .post("/:id/team", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = addSocietyTeamMemberSchema.parse(body);
    return addTeamMemberToTenant(params.id, claims.sub, parsed);
  })
  .delete("/:id/team/:userId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return removeTeamMemberFromTenant(params.id, claims.sub, params.userId);
  });
