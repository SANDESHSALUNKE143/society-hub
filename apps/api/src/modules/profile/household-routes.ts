import { Elysia } from "elysia";
import { addHouseholdMemberSchema } from "@society-hub/validation";
import { authPlugin, requireAuth } from "../../lib/auth-context";
import {
  addHouseholdMember,
  listHouseholdMembers,
  removeHouseholdMember,
  requireLinkedFlat,
  updateHouseholdMember,
} from "./household-service";

export const householdRoutes = new Elysia({ prefix: "/v1/household" })
  .use(authPlugin)
  .get("/members", async ({ auth }) => {
    const claims = requireAuth(auth);
    const flatId = await requireLinkedFlat(claims);
    return listHouseholdMembers(claims.tenantId, flatId);
  })
  .post("/members", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = addHouseholdMemberSchema.parse(body);
    return addHouseholdMember({
      claims,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
    });
  })
  .patch("/members/:userId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    const parsed = addHouseholdMemberSchema.parse(body);
    return updateHouseholdMember({
      claims,
      userId: params.userId,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
    });
  })
  .delete("/members/:userId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    return removeHouseholdMember({
      claims,
      userId: params.userId,
    });
  });
