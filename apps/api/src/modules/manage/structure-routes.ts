import { Elysia } from "elysia";
import {
  createSocietyBuildingSchema,
  createSocietyFlatSchema,
  createSocietyParkingSchema,
  createSocietyWingSchema,
  importSocietyFlatsSchema,
  importSocietyParkingsSchema,
} from "@society-hub/validation";
import {
  authPlugin,
  requireAuth,
  requirePlatform,
} from "../../lib/auth-context";
import {
  addSocietyBuilding,
  addSocietyFlat,
  addSocietyWing,
  deleteSocietyBuilding,
  deleteSocietyFlat,
  deleteSocietyWing,
  importSocietyFlats,
  listSocietyBuildingsDetailed,
  listSocietyFlats,
  listSocietyWings,
  renameSocietyBuilding,
  renameSocietyWing,
  updateSocietyFlat,
} from "./structure-service";
import {
  addSocietyParking,
  deleteSocietyParking,
  importSocietyParkings,
  listSocietyParkings,
  updateSocietyParking,
} from "./parking-service";

export const manageStructureRoutes = new Elysia({
  prefix: "/v1/manage/societies",
})
  .use(authPlugin)
  .get("/:id/buildings", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return listSocietyBuildingsDetailed(params.id);
  })
  .post("/:id/buildings", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyBuildingSchema.parse(body);
    return addSocietyBuilding(params.id, claims.sub, parsed.name);
  })
  .patch("/:id/buildings/:buildingId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyBuildingSchema.parse(body);
    return renameSocietyBuilding(
      params.id,
      params.buildingId,
      claims.sub,
      parsed.name,
    );
  })
  .delete("/:id/buildings/:buildingId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return deleteSocietyBuilding(params.id, params.buildingId, claims.sub);
  })
  .get("/:id/buildings/:buildingId/wings", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return listSocietyWings(params.id, params.buildingId);
  })
  .post("/:id/buildings/:buildingId/wings", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyWingSchema.parse(body);
    return addSocietyWing(params.id, params.buildingId, claims.sub, parsed.name);
  })
  .patch("/:id/wings/:wingId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyWingSchema.parse(body);
    return renameSocietyWing(params.id, params.wingId, claims.sub, parsed.name);
  })
  .delete("/:id/wings/:wingId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return deleteSocietyWing(params.id, params.wingId, claims.sub);
  })
  .get("/:id/flats", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return listSocietyFlats(params.id);
  })
  .post("/:id/flats/import", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = importSocietyFlatsSchema.parse(body);
    return importSocietyFlats(params.id, claims.sub, parsed.rows, {
      buildingId: parsed.buildingId,
      buildingName: parsed.buildingName,
    });
  })
  .patch("/:id/flats/:flatId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyFlatSchema.parse(body);
    return updateSocietyFlat(params.id, params.flatId, claims.sub, parsed);
  })
  .delete("/:id/flats/:flatId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return deleteSocietyFlat(params.id, params.flatId, claims.sub);
  })
  .post("/:id/flats", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyFlatSchema.parse(body);
    const result = await addSocietyFlat(params.id, claims.sub, parsed);
    return result.flat;
  })
  .get("/:id/parkings", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return listSocietyParkings(params.id);
  })
  .post("/:id/parkings/import", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = importSocietyParkingsSchema.parse(body);
    return importSocietyParkings(params.id, claims.sub, parsed.rows);
  })
  .patch("/:id/parkings/:parkingId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyParkingSchema.parse(body);
    return updateSocietyParking(params.id, params.parkingId, claims.sub, parsed);
  })
  .delete("/:id/parkings/:parkingId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    return deleteSocietyParking(params.id, params.parkingId, claims.sub);
  })
  .post("/:id/parkings", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietyParkingSchema.parse(body);
    const result = await addSocietyParking(params.id, claims.sub, parsed);
    return result.slot;
  });
