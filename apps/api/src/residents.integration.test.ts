import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type {
  FlatDetailDto,
  FlatOccupancyHistoryEntryDto,
  FlatOccupancySummaryDto,
  InvitationDto,
  OccupancyStatsDto,
  Paginated,
  ResidentDetailDto,
  ResidentDocumentDto,
  ResidentImportPreviewDto,
  ResidentImportResultDto,
  ResidentProfileDto,
  ResidentSummaryDto,
  TeamMemberDto,
} from "@society-hub/types";
import { createApp } from "./app";

/**
 * Society & Resident Management 2.0 — integration coverage.
 *
 * Boots the app in-process against the real MySQL (same pattern as
 * api.integration.test.ts) and drives the resident lifecycle end to end,
 * including the negative tenant-isolation and authorization cases.
 */

let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;

/** Unique-per-run so repeated runs never collide on phone/email/flat uniqueness. */
const RUN = Date.now().toString().slice(-9);
let seq = 0;
const uniquePhone = () => `7${RUN}${String(seq++).padStart(2, "0")}`;
const uniqueEmail = (label: string) => `${label}.${RUN}.${seq++}@phase1.test`;

type Session = {
  user: { id: string; role: string; tenantId: string; flatId: string | null };
  tokens: { accessToken: string; refreshToken: string };
};

async function api<T>(
  path: string,
  init: RequestInit & { session?: Session } = {},
): Promise<{ status: number; body: T }> {
  const { session, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has("Content-Type") && !(rest.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (session) {
    headers.set("Authorization", `Bearer ${session.tokens.accessToken}`);
  }
  const res = await fetch(`${base}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T };
}

async function otpLogin(phone: string): Promise<Session> {
  await fetch(`${base}/v1/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const verify = await fetch(`${base}/v1/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: "123456" }),
  });
  expect(verify.ok).toBe(true);
  return (await verify.json()) as Session;
}

async function passwordLogin(email: string, password: string): Promise<Session> {
  const res = await fetch(`${base}/v1/auth/password/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as Session;
}

/** A whole society with a chairperson session and one flat, built via the API. */
type Society = {
  tenantId: string;
  chair: Session;
  flatId: string;
  flatNumber: string;
  wingId: string;
};

async function createSociety(platform: Session, label: string): Promise<Society> {
  const chairPhone = uniquePhone();
  const chairEmail = uniqueEmail(`chair.${label}`);
  const society = await api<{ id: string }>("/v1/societies", {
    method: "POST",
    session: platform,
    body: JSON.stringify({
      name: `Phase1 ${label} ${RUN}`,
      chairpersonName: `Chair ${label}`,
      chairpersonEmail: chairEmail,
      chairpersonPhone: chairPhone,
    }),
  });
  expect(society.status).toBe(200);
  const tenantId = society.body.id;

  const chair = await otpLogin(chairPhone);
  expect(chair.user.tenantId).toBe(tenantId);

  // Societies start empty — seed Tower A / wing A / flat 101 via Manage APIs.
  const tower = await api<{ id: string }>(
    `/v1/manage/societies/${tenantId}/buildings`,
    {
      method: "POST",
      session: platform,
      body: JSON.stringify({ name: "Tower A" }),
    },
  );
  expect(tower.status).toBe(200);
  const wingRes = await api<{ id: string }>(
    `/v1/manage/societies/${tenantId}/buildings/${tower.body.id}/wings`,
    {
      method: "POST",
      session: platform,
      body: JSON.stringify({ name: "A" }),
    },
  );
  expect(wingRes.status).toBe(200);
  const flatRes = await api<{ id: string; number: string }>(
    `/v1/manage/societies/${tenantId}/flats`,
    {
      method: "POST",
      session: platform,
      body: JSON.stringify({
        buildingId: tower.body.id,
        wing: "A",
        floor: 1,
        flatNumber: "101",
      }),
    },
  );
  expect(flatRes.status).toBe(200);

  return {
    tenantId,
    chair,
    flatId: flatRes.body.id,
    flatNumber: flatRes.body.number,
    wingId: wingRes.body.id,
  };
}

async function onboard(
  society: Society,
  opts: { name: string; phone: string; email: string; residentType?: string },
) {
  const res = await api<{ resident: ResidentDetailDto }>("/v1/admin/residents", {
    method: "POST",
    session: society.chair,
    body: JSON.stringify({
      name: opts.name,
      phone: opts.phone,
      email: opts.email,
      flatId: society.flatId,
      residentType: opts.residentType ?? "owner",
    }),
  });
  expect(res.status).toBe(200);
  return res.body.resident;
}

let platform: Session;
let societyA: Society;
let societyB: Society;

describe("society & resident management", () => {
  beforeAll(async () => {
    if (process.env.API_URL) {
      base = process.env.API_URL;
    } else {
      const app = createApp().listen(0);
      server = app;
      const port = app.server?.port;
      if (!port) throw new Error("Failed to bind in-process API");
      base = `http://127.0.0.1:${port}`;
    }
    platform = await passwordLogin("superadmin@societyhub.local", "Test@1234");
    societyA = await createSociety(platform, "alpha");
    societyB = await createSociety(platform, "beta");
  });

  afterAll(() => {
    server?.stop(true);
    server = null;
  });

  // ---------------------------------------------------------------- directory

  test("directory searches, filters, sorts and pages server-side", async () => {
    const owner = await onboard(societyA, {
      name: "Rohan Vichare",
      phone: uniquePhone(),
      email: uniqueEmail("rohan"),
      residentType: "owner",
    });
    await onboard(societyA, {
      name: "Sayali Vichare",
      phone: uniquePhone(),
      email: uniqueEmail("sayali"),
      residentType: "tenant",
    });

    const all = await api<Paginated<ResidentSummaryDto>>("/v1/admin/residents", {
      session: societyA.chair,
    });
    expect(all.status).toBe(200);
    expect(all.body.page).toBe(1);
    expect(all.body.limit).toBe(20);
    expect(all.body.total).toBeGreaterThanOrEqual(2);

    const search = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?search=rohan",
      { session: societyA.chair },
    );
    expect(search.body.items.length).toBeGreaterThanOrEqual(1);
    expect(
      search.body.items.every((r) => r.name?.toLowerCase().includes("rohan")),
    ).toBe(true);

    const byFlat = await api<Paginated<ResidentSummaryDto>>(
      `/v1/admin/residents?search=${encodeURIComponent(societyA.flatNumber)}`,
      { session: societyA.chair },
    );
    expect(byFlat.body.total).toBeGreaterThanOrEqual(2);

    const tenants = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?residentType=tenant",
      { session: societyA.chair },
    );
    expect(tenants.body.items.every((r) => r.residentType === "tenant")).toBe(true);

    const paged = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?page=1&limit=1",
      { session: societyA.chair },
    );
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.limit).toBe(1);

    const desc = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?sort=name&order=desc",
      { session: societyA.chair },
    );
    const asc = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?sort=name&order=asc",
      { session: societyA.chair },
    );
    expect(desc.body.items[0]!.name).not.toBe(asc.body.items[0]!.name);

    const byStatus = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?status=active&verificationStatus=approved&sort=flat",
      { session: societyA.chair },
    );
    expect(byStatus.body.items.every((r) => r.status === "active")).toBe(true);

    const detail = await api<ResidentDetailDto>(`/v1/admin/residents/${owner.id}`, {
      session: societyA.chair,
    });
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe("Rohan Vichare");
    expect(detail.body.flat?.number).toBe(societyA.flatNumber);
    expect(detail.body.roles).toContain("resident");
    expect(detail.body.communicationPreferences.inApp).toBe(true);

    const sortByCreated = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?sort=createdAt&order=desc",
      { session: societyA.chair },
    );
    expect(sortByCreated.status).toBe(200);
  });

  // ---------------------------------------------------------------- lifecycle

  test("suspend, reactivate, reject and re-approve follow the state machine", async () => {
    const resident = await onboard(societyA, {
      name: "Lifecycle Person",
      phone: uniquePhone(),
      email: uniqueEmail("lifecycle"),
    });
    expect(resident.status).toBe("active");

    const suspended = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}/suspend`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({ reason: "Dues unpaid" }),
      },
    );
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe("suspended");

    // Double-suspend is a no-op transition and must be refused, not silently applied.
    const again = await api<{ code: string }>(
      `/v1/admin/residents/${resident.id}/suspend`,
      { method: "POST", session: societyA.chair, body: JSON.stringify({}) },
    );
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("invalid_transition");

    const reactivated = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}/reactivate`,
      { method: "POST", session: societyA.chair },
    );
    expect(reactivated.body.status).toBe("active");

    const rejected = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}/reject`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({ reason: "Please upload a valid tenant agreement." }),
      },
    );
    expect(rejected.status).toBe(200);
    expect(rejected.body.verificationStatus).toBe("rejected");
    expect(rejected.body.status).toBe("rejected");
    expect(rejected.body.rejectionReason).toBe(
      "Please upload a valid tenant agreement.",
    );

    // Rejection needs a reason the resident can act on.
    const noReason = await api<{ code: string }>(
      `/v1/admin/residents/${resident.id}/reject`,
      { method: "POST", session: societyA.chair, body: JSON.stringify({}) },
    );
    expect(noReason.status).toBe(400);

    const verified = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}/verify`,
      { method: "POST", session: societyA.chair },
    );
    expect(verified.body.verificationStatus).toBe("approved");
    expect(verified.body.status).toBe("active");
    expect(verified.body.rejectionReason).toBeNull();
    expect(verified.body.verifiedAt).not.toBeNull();

    const activity = await api<Array<{ action: string }>>(
      `/v1/admin/residents/${resident.id}/activity`,
      { session: societyA.chair },
    );
    const actions = activity.body.map((e) => e.action);
    expect(actions).toContain("resident.suspended");
    expect(actions).toContain("resident.reactivated");
    expect(actions).toContain("resident.rejected");
    expect(actions).toContain("resident.verified");
  });

  test("move-out closes the period and keeps the history", async () => {
    const phone = uniquePhone();
    const resident = await onboard(societyA, {
      name: "Departing Owner",
      phone,
      email: uniqueEmail("departing"),
    });

    const movedOut = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}/move-out`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({
          moveOutDate: "2025-05-31T00:00:00.000Z",
          reason: "Relocated to Pune",
        }),
      },
    );
    expect(movedOut.status).toBe(200);
    expect(movedOut.body.status).toBe("moved_out");
    expect(movedOut.body.moveOutDate).toContain("2025-05-31");
    expect(movedOut.body.moveOutReason).toBe("Relocated to Pune");

    // The record survives — it is still readable and still listed.
    const stillThere = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}`,
      { session: societyA.chair },
    );
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.moveOutReason).toBe("Relocated to Pune");

    const movedOutList = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?status=moved_out",
      { session: societyA.chair },
    );
    expect(movedOutList.body.items.some((r) => r.id === resident.id)).toBe(true);

    // Moved out is terminal.
    const reMoveOut = await api<{ code: string }>(
      `/v1/admin/residents/${resident.id}/move-out`,
      { method: "POST", session: societyA.chair, body: JSON.stringify({}) },
    );
    expect(reMoveOut.status).toBe(409);

    const history = await api<FlatOccupancyHistoryEntryDto[]>(
      `/v1/admin/flats/${societyA.flatId}/history`,
      { session: societyA.chair },
    );
    const closed = history.body.find((h) => h.residentId === resident.id);
    expect(closed).toBeDefined();
    expect(closed!.isCurrent).toBe(false);
    expect(closed!.moveOutReason).toBe("Relocated to Pune");

    // Re-onboarding the same person opens a *new* period rather than reviving it.
    const returning = await onboard(societyA, {
      name: "Departing Owner",
      phone,
      email: uniqueEmail("returning"),
    });
    expect(returning.id).not.toBe(resident.id);
    expect(returning.status).toBe("active");
    expect(returning.otherMemberships.some((m) => m.id === resident.id)).toBe(true);
  });

  test("moving between flats closes the old period and opens a new one", async () => {
    const phone = uniquePhone();
    const first = await onboard(societyA, {
      name: "Mover Person",
      phone,
      email: uniqueEmail("mover"),
    });

    const secondFlat = await api<{ id: string }>(
      `/v1/wings/${societyA.wingId}/flats`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({ number: `M${RUN}${seq++}`, floor: 12 }),
      },
    );
    expect(secondFlat.status).toBe(200);

    const moved = await api<{ resident: ResidentDetailDto }>("/v1/admin/residents", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        name: "Mover Person",
        phone,
        email: uniqueEmail("mover2"),
        flatId: secondFlat.body.id,
        residentType: "owner",
      }),
    });
    expect(moved.status).toBe(200);
    expect(moved.body.resident.id).not.toBe(first.id);
    expect(moved.body.resident.flat?.id).toBe(secondFlat.body.id);

    const old = await api<ResidentDetailDto>(`/v1/admin/residents/${first.id}`, {
      session: societyA.chair,
    });
    expect(old.body.status).toBe("moved_out");
  });

  test("updating a resident edits both the person and the membership", async () => {
    const resident = await onboard(societyA, {
      name: "Editable Person",
      phone: uniquePhone(),
      email: uniqueEmail("editable"),
    });

    const updated = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}`,
      {
        method: "PATCH",
        session: societyA.chair,
        body: JSON.stringify({
          name: "Edited Person",
          residentType: "tenant",
          isPrimary: false,
          remarks: "Co-tenant on the lease",
          moveInDate: "2024-04-01T00:00:00.000Z",
        }),
      },
    );
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Edited Person");
    expect(updated.body.residentType).toBe("tenant");
    expect(updated.body.isPrimary).toBe(false);
    expect(updated.body.remarks).toBe("Co-tenant on the lease");
    expect(updated.body.moveInDate).toContain("2024-04-01");
  });

  // ------------------------------------------------------------------- family

  test("family members can be added, edited and removed", async () => {
    const resident = await onboard(societyA, {
      name: "Family Head",
      phone: uniquePhone(),
      email: uniqueEmail("familyhead"),
    });

    const added = await api<Array<{ id: string; name: string; relationship: string }>>(
      `/v1/admin/residents/${resident.id}/family`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({
          name: "Sayali Vichare",
          relationship: "spouse",
          phone: "9812345678",
        }),
      },
    );
    expect(added.status).toBe(200);
    expect(added.body).toHaveLength(1);
    const familyId = added.body[0]!.id;

    await api(`/v1/admin/residents/${resident.id}/family`, {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ name: "Aarav", relationship: "child" }),
    });

    const listed = await api<Array<{ id: string }>>(
      `/v1/admin/residents/${resident.id}/family`,
      { session: societyA.chair },
    );
    expect(listed.body).toHaveLength(2);

    const edited = await api<Array<{ id: string; phone: string | null }>>(
      `/v1/admin/residents/${resident.id}/family/${familyId}`,
      {
        method: "PATCH",
        session: societyA.chair,
        body: JSON.stringify({ phone: "9800000000" }),
      },
    );
    expect(edited.body.find((f) => f.id === familyId)!.phone).toBe("9800000000");

    // Family members are visible on the resident detail and counted on the flat.
    const detail = await api<ResidentDetailDto>(`/v1/admin/residents/${resident.id}`, {
      session: societyA.chair,
    });
    expect(detail.body.family).toHaveLength(2);

    const flat = await api<FlatDetailDto>(`/v1/admin/flats/${societyA.flatId}`, {
      session: societyA.chair,
    });
    const occupant = flat.body.currentOccupants.find(
      (o) => o.residentId === resident.id,
    );
    expect(occupant?.familyCount).toBe(2);

    const removed = await api<unknown[]>(
      `/v1/admin/residents/${resident.id}/family/${familyId}`,
      { method: "DELETE", session: societyA.chair },
    );
    expect(removed.body).toHaveLength(1);

    const missing = await api<{ code: string }>(
      `/v1/admin/residents/${resident.id}/family/${familyId}`,
      { method: "DELETE", session: societyA.chair },
    );
    expect(missing.status).toBe(404);
  });

  // ---------------------------------------------------------------- documents

  test("documents upload, review and stay private to the society", async () => {
    const resident = await onboard(societyA, {
      name: "Document Person",
      phone: uniquePhone(),
      email: uniqueEmail("document"),
    });

    const form = new FormData();
    form.append("file", new File(["fake-id-scan"], "aadhaar.png", { type: "image/png" }));
    form.append("docType", "identity");
    const uploaded = await api<ResidentDocumentDto[]>(
      `/v1/admin/residents/${resident.id}/documents`,
      { method: "POST", session: societyA.chair, body: form },
    );
    expect(uploaded.status).toBe(200);
    expect(uploaded.body).toHaveLength(1);
    const doc = uploaded.body[0]!;
    expect(doc.docType).toBe("identity");
    expect(doc.status).toBe("pending");
    // The stored blob path must never leak to a client.
    expect(JSON.stringify(doc)).not.toContain("uploads");

    // An admin-created resident is already trusted; a new document does not
    // un-verify them.
    const stillApproved = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}`,
      { session: societyA.chair },
    );
    expect(stillApproved.body.verificationStatus).toBe("approved");

    // But a rejected resident re-uploading goes back into the review queue.
    await api(`/v1/admin/residents/${resident.id}/reject`, {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ reason: "Original scan was unreadable" }),
    });
    const replacement = new FormData();
    replacement.append(
      "file",
      new File(["clearer-scan"], "aadhaar-2.png", { type: "image/png" }),
    );
    replacement.append("docType", "identity");
    await api(`/v1/admin/residents/${resident.id}/documents`, {
      method: "POST",
      session: societyA.chair,
      body: replacement,
    });
    const underReview = await api<ResidentDetailDto>(
      `/v1/admin/residents/${resident.id}`,
      { session: societyA.chair },
    );
    expect(underReview.body.verificationStatus).toBe("under_review");

    const badType = new FormData();
    badType.append("file", new File(["x"], "notes.txt", { type: "text/plain" }));
    badType.append("docType", "other");
    const rejectedUpload = await api<{ code: string }>(
      `/v1/admin/residents/${resident.id}/documents`,
      { method: "POST", session: societyA.chair, body: badType },
    );
    expect(rejectedUpload.status).toBe(400);
    expect(rejectedUpload.body.code).toBe("invalid_type");

    const file = await fetch(`${base}${doc.downloadPath}`, {
      headers: { Authorization: `Bearer ${societyA.chair.tokens.accessToken}` },
    });
    expect(file.status).toBe(200);
    expect(file.headers.get("Cache-Control")).toContain("no-store");

    // Society B must not be able to read society A's document.
    const crossTenant = await fetch(`${base}${doc.downloadPath}`, {
      headers: { Authorization: `Bearer ${societyB.chair.tokens.accessToken}` },
    });
    expect(crossTenant.status).toBe(404);

    const rejectedDoc = await api<ResidentDocumentDto>(
      `/v1/admin/resident-documents/${doc.id}/reject`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({ reason: "Scan is unreadable" }),
      },
    );
    expect(rejectedDoc.body.status).toBe("rejected");
    expect(rejectedDoc.body.rejectionReason).toBe("Scan is unreadable");

    const approvedDoc = await api<ResidentDocumentDto>(
      `/v1/admin/resident-documents/${doc.id}/verify`,
      { method: "POST", session: societyA.chair },
    );
    expect(approvedDoc.body.status).toBe("approved");
    expect(approvedDoc.body.verifiedByName).not.toBeNull();

    const deleted = await api<{ ok: boolean }>(
      `/v1/admin/resident-documents/${doc.id}`,
      { method: "DELETE", session: societyA.chair },
    );
    expect(deleted.body.ok).toBe(true);
  });

  // ------------------------------------------------------------------- flats

  test("flat detail derives occupancy from live memberships", async () => {
    const flatRes = await api<{ id: string; number: string }>(
      `/v1/wings/${societyA.wingId}/flats`,
      {
        method: "POST",
        session: societyA.chair,
        body: JSON.stringify({ number: `V${RUN}${seq++}`, floor: 4 }),
      },
    );
    const flatId = flatRes.body.id;

    const vacant = await api<FlatDetailDto>(`/v1/admin/flats/${flatId}`, {
      session: societyA.chair,
    });
    expect(vacant.body.occupancyStatus).toBe("vacant");
    expect(vacant.body.currentOccupants).toHaveLength(0);
    expect(vacant.body.primaryOwner).toBeNull();

    const ownerPhone = uniquePhone();
    await api("/v1/admin/residents", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        name: "Flat Owner",
        phone: ownerPhone,
        email: uniqueEmail("flatowner"),
        flatId,
        residentType: "owner",
      }),
    });

    const ownerOccupied = await api<FlatDetailDto>(`/v1/admin/flats/${flatId}`, {
      session: societyA.chair,
    });
    expect(ownerOccupied.body.occupancyStatus).toBe("owner_occupied");
    expect(ownerOccupied.body.primaryOwner?.name).toBe("Flat Owner");

    await api("/v1/admin/residents", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        name: "Flat Tenant",
        phone: uniquePhone(),
        email: uniqueEmail("flattenant"),
        flatId,
        residentType: "tenant",
      }),
    });

    const tenantOccupied = await api<FlatDetailDto>(`/v1/admin/flats/${flatId}`, {
      session: societyA.chair,
    });
    // Owner plus tenant reads as tenant-occupied — the fact an admin needs.
    expect(tenantOccupied.body.occupancyStatus).toBe("tenant_occupied");
    expect(tenantOccupied.body.tenants).toHaveLength(1);
    expect(tenantOccupied.body.currentOccupants).toHaveLength(2);

    const occupants = await api<Array<{ residentId: string }>>(
      `/v1/admin/flats/${flatId}/residents`,
      { session: societyA.chair },
    );
    expect(occupants.body).toHaveLength(2);

    const flatList = await api<Paginated<FlatOccupancySummaryDto>>(
      "/v1/admin/occupancy/flats?occupancy=tenant_occupied",
      { session: societyA.chair },
    );
    expect(flatList.body.items.some((f) => f.id === flatId)).toBe(true);
    expect(flatList.body.items.every((f) => f.occupancyStatus === "tenant_occupied")).toBe(
      true,
    );

    const vacantList = await api<Paginated<FlatOccupancySummaryDto>>(
      "/v1/admin/occupancy/flats?occupancy=vacant",
      { session: societyA.chair },
    );
    expect(vacantList.body.items.every((f) => f.occupantCount === 0)).toBe(true);

    const stats = await api<OccupancyStatsDto>("/v1/admin/occupancy/stats", {
      session: societyA.chair,
    });
    expect(stats.body.totalFlats).toBeGreaterThan(0);
    expect(stats.body.occupiedFlats + stats.body.vacantFlats).toBe(
      stats.body.totalFlats,
    );
    expect(stats.body.tenantOccupiedFlats).toBeGreaterThanOrEqual(1);
    expect(stats.body.totalResidents).toBeGreaterThanOrEqual(
      stats.body.activeResidents,
    );

    const dashboard = await api<{ occupancy: OccupancyStatsDto | null }>(
      "/v1/dashboard/stats",
      { session: societyA.chair },
    );
    expect(dashboard.body.occupancy).not.toBeNull();
    // Resident mode has no business seeing society-wide occupancy.
    const mine = await api<{ occupancy: OccupancyStatsDto | null }>(
      "/v1/dashboard/stats?mine=1",
      { session: societyA.chair },
    );
    expect(mine.body.occupancy).toBeNull();
  });

  // ------------------------------------------------------------- invitations

  test("invitation create, duplicate block, resend, revoke and accept", async () => {
    const inviteEmail = uniqueEmail("invitee");
    const invitePhone = uniquePhone();

    const created = await api<InvitationDto>("/v1/invitations", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        name: "Invited Person",
        email: inviteEmail,
        phone: invitePhone,
        role: "resident",
        flatId: societyA.flatId,
        residentType: "tenant",
        channels: ["email"],
      }),
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("pending");
    expect(created.body.flatNumber).toBe(societyA.flatNumber);
    expect(created.body.residentType).toBe("tenant");
    expect(created.body.expiresAt).not.toBeNull();
    const token = created.body.devToken!;
    expect(token).toBeTruthy();

    // A second live invite for the same person + role must be refused.
    const duplicate = await api<{ code: string }>("/v1/invitations", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        email: inviteEmail,
        phone: invitePhone,
        role: "resident",
        channels: ["email"],
      }),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("invitation_exists");

    const noContact = await api<{ code: string }>("/v1/invitations", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ role: "resident" }),
    });
    expect(noContact.status).toBe(400);

    const badFlat = await api<{ code: string }>("/v1/invitations", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        email: uniqueEmail("badflat"),
        role: "resident",
        flatId: societyB.flatId,
      }),
    });
    expect(badFlat.status).toBe(404);
    expect(badFlat.body.code).toBe("flat_not_found");

    const resent = await api<InvitationDto>(`/v1/invitations/${created.body.id}/resend`, {
      method: "POST",
      session: societyA.chair,
    });
    expect(resent.body.resendCount).toBe(1);

    const list = await api<Paginated<InvitationDto>>(
      "/v1/invitations?status=pending&page=1&limit=10",
      { session: societyA.chair },
    );
    expect(list.body.items.some((i) => i.id === created.body.id)).toBe(true);
    expect(list.body.total).toBeGreaterThanOrEqual(1);

    const searched = await api<Paginated<InvitationDto>>(
      `/v1/invitations?search=${encodeURIComponent("Invited Person")}`,
      { session: societyA.chair },
    );
    expect(searched.body.items.some((i) => i.id === created.body.id)).toBe(true);

    // Public preview needs no auth — the token is the credential.
    const preview = await api<{ societyName: string; flatNumber: string }>(
      `/v1/invites/${token}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.flatNumber).toBe(societyA.flatNumber);

    const accepted = await api<{ residentId: string | null; tenantId: string }>(
      "/v1/invites/accept",
      {
        method: "POST",
        body: JSON.stringify({ token, name: "Invited Person" }),
      },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.tenantId).toBe(societyA.tenantId);
    expect(accepted.body.residentId).not.toBeNull();

    // Accepting creates a membership that is *not* yet trusted.
    const newResident = await api<ResidentDetailDto>(
      `/v1/admin/residents/${accepted.body.residentId}`,
      { session: societyA.chair },
    );
    expect(newResident.body.status).toBe("pending_verification");
    expect(newResident.body.verificationStatus).toBe("pending");
    expect(newResident.body.residentType).toBe("tenant");

    // The token is single-use.
    const reuse = await api<{ code: string }>("/v1/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    expect(reuse.status).toBe(404);

    const accept = await api<ResidentDetailDto>(
      `/v1/admin/residents/${accepted.body.residentId}/verify`,
      { method: "POST", session: societyA.chair },
    );
    expect(accept.body.verificationStatus).toBe("approved");
    expect(accept.body.status).toBe("active");
  });

  test("a revoked invitation cannot be reused and frees the slot", async () => {
    const email = uniqueEmail("revoked");
    const created = await api<InvitationDto>("/v1/invitations", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ email, role: "resident", channels: ["email"] }),
    });
    const token = created.body.devToken!;

    const revoked = await api<InvitationDto>(
      `/v1/invitations/${created.body.id}/revoke`,
      { method: "POST", session: societyA.chair },
    );
    expect(revoked.body.status).toBe("revoked");
    expect(revoked.body.revokedAt).not.toBeNull();

    const accept = await api<{ code: string }>("/v1/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token, phone: uniquePhone() }),
    });
    expect(accept.status).toBe(404);

    // Revoking frees the active key so a replacement invite is possible at once.
    const replacement = await api<InvitationDto>("/v1/invitations", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ email, role: "resident", channels: ["email"] }),
    });
    expect(replacement.status).toBe(200);

    const resendRevoked = await api<{ code: string }>(
      `/v1/invitations/${created.body.id}/resend`,
      { method: "POST", session: societyA.chair },
    );
    expect(resendRevoked.status).toBe(409);

    const missing = await api<{ code: string }>(
      "/v1/invitations/11111111-1111-1111-1111-111111111111/revoke",
      { method: "POST", session: societyA.chair },
    );
    expect(missing.status).toBe(404);

    const badToken = await api<{ code: string }>("/v1/invites/does-not-exist");
    expect(badToken.status).toBe(404);
  });

  // -------------------------------------------------------------------- team

  test("society admins manage their own team and cannot drop the last chairperson", async () => {
    const memberEmail = uniqueEmail("teammate");
    const added = await api<TeamMemberDto[]>("/v1/team/members", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        name: "New Secretary",
        email: memberEmail,
        role: "secretary",
      }),
    });
    expect(added.status).toBe(200);
    const member = added.body.find((m) => m.email === memberEmail);
    expect(member).toBeDefined();
    expect(member!.role).toBe("secretary");

    const duplicate = await api<{ code: string }>("/v1/team/members", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ email: memberEmail, role: "secretary" }),
    });
    expect(duplicate.status).toBe(409);

    const noIdentity = await api<{ code: string }>("/v1/team/members", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ role: "committee" }),
    });
    expect(noIdentity.status).toBe(400);

    const changed = await api<TeamMemberDto[]>(
      `/v1/team/members/${member!.userId}/role`,
      {
        method: "PATCH",
        session: societyA.chair,
        body: JSON.stringify({ fromRole: "secretary", toRole: "treasurer" }),
      },
    );
    expect(changed.body.find((m) => m.userId === member!.userId)!.role).toBe(
      "treasurer",
    );

    const sameRole = await api<{ code: string }>(
      `/v1/team/members/${member!.userId}/role`,
      {
        method: "PATCH",
        session: societyA.chair,
        body: JSON.stringify({ fromRole: "treasurer", toRole: "treasurer" }),
      },
    );
    expect(sameRole.status).toBe(400);

    const removed = await api<TeamMemberDto[]>(
      `/v1/team/members/${member!.userId}/roles/treasurer`,
      { method: "DELETE", session: societyA.chair },
    );
    expect(removed.body.some((m) => m.userId === member!.userId)).toBe(false);

    // The society must keep at least one chairperson.
    const lastChair = await api<{ code: string }>(
      `/v1/team/members/${societyA.chair.user.id}/roles/chairperson`,
      { method: "DELETE", session: societyA.chair },
    );
    expect(lastChair.status).toBe(409);
    expect(lastChair.body.code).toBe("last_chairperson");

    const badRole = await api<{ code: string }>(
      `/v1/team/members/${societyA.chair.user.id}/roles/resident`,
      { method: "DELETE", session: societyA.chair },
    );
    expect(badRole.status).toBe(400);
  });

  // ----------------------------------------------------------- self service

  test("residents see their own membership, family and documents", async () => {
    const phone = uniquePhone();
    const resident = await onboard(societyA, {
      name: "Self Service",
      phone,
      email: uniqueEmail("selfservice"),
    });
    await api(`/v1/admin/residents/${resident.id}/family`, {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ name: "Spouse Person", relationship: "spouse" }),
    });

    const session = await otpLogin(phone);
    const profile = await api<ResidentProfileDto>("/v1/profile", { session });
    expect(profile.status).toBe(200);
    expect(profile.body.membership?.id).toBe(resident.id);
    expect(profile.body.membership?.verificationStatus).toBe("approved");
    expect(profile.body.family).toHaveLength(1);
    expect(profile.body.flat?.number).toBe(societyA.flatNumber);
    expect(profile.body.communicationPreferences.inApp).toBe(true);

    const updated = await api<ResidentProfileDto>("/v1/profile", {
      method: "PATCH",
      session,
      body: JSON.stringify({
        name: "Self Service Updated",
        emergencyContactName: "Aai",
        emergencyContactRelation: "Parent",
        emergencyContactPhone: "9800011111",
        vehicleNumber: "MH12AB1234",
        communicationPreferences: { whatsapp: true, email: false },
      }),
    });
    expect(updated.body.name).toBe("Self Service Updated");
    expect(updated.body.emergencyContactName).toBe("Aai");
    expect(updated.body.communicationPreferences.whatsapp).toBe(true);
    expect(updated.body.communicationPreferences.email).toBe(false);
    // Untouched channels keep their previous value.
    expect(updated.body.communicationPreferences.inApp).toBe(true);

    const form = new FormData();
    form.append("file", new File(["lease"], "lease.pdf", { type: "application/pdf" }));
    form.append("docType", "tenant_agreement");
    const uploaded = await api<ResidentDocumentDto>("/v1/profile/documents", {
      method: "POST",
      session,
      body: form,
    });
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.downloadPath).toContain("/v1/profile/documents/");

    const own = await fetch(`${base}${uploaded.body.downloadPath}`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(own.status).toBe(200);

    // Another resident of the same society cannot read this file.
    const otherPhone = uniquePhone();
    await onboard(societyA, {
      name: "Nosy Neighbour",
      phone: otherPhone,
      email: uniqueEmail("nosy"),
    });
    const other = await otpLogin(otherPhone);
    const denied = await fetch(`${base}${uploaded.body.downloadPath}`, {
      headers: { Authorization: `Bearer ${other.tokens.accessToken}` },
    });
    expect(denied.status).toBe(403);
  });

  // -------------------------------------------------------------- CSV import

  test("CSV preview reports outcomes and a bad file is rejected whole", async () => {
    const goodPhone = uniquePhone();
    const rows = [
      {
        name: "CSV Good",
        phone: goodPhone,
        email: uniqueEmail("csvgood"),
        flatNumber: societyA.flatNumber,
        isOwner: true,
      },
      {
        name: "CSV Bad Flat",
        phone: uniquePhone(),
        email: uniqueEmail("csvbad"),
        flatNumber: "A-DOES-NOT-EXIST",
        isOwner: false,
      },
    ];

    const preview = await api<ResidentImportPreviewDto>(
      "/v1/admin/residents/import/preview",
      { method: "POST", session: societyA.chair, body: JSON.stringify({ rows }) },
    );
    expect(preview.status).toBe(200);
    expect(preview.body.total).toBe(2);
    expect(preview.body.invalid).toBe(1);
    expect(preview.body.willCreate).toBe(1);
    const badRow = preview.body.rows.find((r) => r.flatNumber === "A-DOES-NOT-EXIST");
    expect(badRow!.action).toBe("skip");
    expect(badRow!.flatExists).toBe(false);
    expect(badRow!.errors[0]).toContain("does not exist");

    // Without allowPartial nothing is written — no half-applied import.
    const refused = await api<ResidentImportResultDto>("/v1/admin/residents/import", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ rows, sendInvites: false }),
    });
    expect(refused.body.created).toBe(0);
    expect(refused.body.skipped).toBe(2);
    expect(refused.body.errors).toHaveLength(1);
    expect(refused.body.errors[0]!.flatNumber).toBe("A-DOES-NOT-EXIST");

    const notImported = await api<Paginated<ResidentSummaryDto>>(
      `/v1/admin/residents?search=${encodeURIComponent("CSV Good")}`,
      { session: societyA.chair },
    );
    expect(notImported.body.total).toBe(0);

    const partial = await api<ResidentImportResultDto>("/v1/admin/residents/import", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({ rows, sendInvites: false, allowPartial: true }),
    });
    expect(partial.body.total).toBe(2);
    expect(partial.body.created).toBe(1);
    expect(partial.body.skipped).toBe(1);

    const nowImported = await api<Paginated<ResidentSummaryDto>>(
      `/v1/admin/residents?search=${encodeURIComponent("CSV Good")}`,
      { session: societyA.chair },
    );
    expect(nowImported.body.total).toBe(1);

    // Re-running the same file is idempotent.
    const rerun = await api<ResidentImportResultDto>("/v1/admin/residents/import", {
      method: "POST",
      session: societyA.chair,
      body: JSON.stringify({
        rows: [rows[0]!],
        sendInvites: false,
      }),
    });
    expect(rerun.body.created).toBe(0);
    expect(rerun.body.unchanged).toBe(1);
  });

  // ---------------------------------------------------------- tenant isolation

  test("tenant A cannot read or modify tenant B resources", async () => {
    const residentB = await onboard(societyB, {
      name: "Beta Resident",
      phone: uniquePhone(),
      email: uniqueEmail("beta"),
    });
    const chairA = societyA.chair;

    // Read
    const read = await api<{ code: string }>(`/v1/admin/residents/${residentB.id}`, {
      session: chairA,
    });
    expect(read.status).toBe(404);

    // Directory never leaks across societies.
    const list = await api<Paginated<ResidentSummaryDto>>(
      "/v1/admin/residents?limit=100",
      { session: chairA },
    );
    expect(list.body.items.some((r) => r.id === residentB.id)).toBe(false);

    // Mutations
    for (const path of [
      `/v1/admin/residents/${residentB.id}/verify`,
      `/v1/admin/residents/${residentB.id}/reactivate`,
    ]) {
      const res = await api<{ code: string }>(path, { method: "POST", session: chairA });
      expect(res.status).toBe(404);
    }
    const rejectOther = await api<{ code: string }>(
      `/v1/admin/residents/${residentB.id}/reject`,
      {
        method: "POST",
        session: chairA,
        body: JSON.stringify({ reason: "cross tenant attempt" }),
      },
    );
    expect(rejectOther.status).toBe(404);

    const patchOther = await api<{ code: string }>(
      `/v1/admin/residents/${residentB.id}`,
      { method: "PATCH", session: chairA, body: JSON.stringify({ name: "Hacked" }) },
    );
    expect(patchOther.status).toBe(404);

    const moveOutOther = await api<{ code: string }>(
      `/v1/admin/residents/${residentB.id}/move-out`,
      { method: "POST", session: chairA, body: JSON.stringify({}) },
    );
    expect(moveOutOther.status).toBe(404);

    // Family and documents of another society's resident
    const familyOther = await api<{ code: string }>(
      `/v1/admin/residents/${residentB.id}/family`,
      { session: chairA },
    );
    expect(familyOther.status).toBe(404);

    const docsOther = await api<{ code: string }>(
      `/v1/admin/residents/${residentB.id}/documents`,
      { session: chairA },
    );
    expect(docsOther.status).toBe(404);

    const activityOther = await api<{ code: string }>(
      `/v1/admin/residents/${residentB.id}/activity`,
      { session: chairA },
    );
    expect(activityOther.status).toBe(404);

    // Flats
    const flatOther = await api<{ code: string }>(
      `/v1/admin/flats/${societyB.flatId}`,
      { session: chairA },
    );
    expect(flatOther.status).toBe(404);

    const historyOther = await api<{ code: string }>(
      `/v1/admin/flats/${societyB.flatId}/history`,
      { session: chairA },
    );
    expect(historyOther.status).toBe(404);

    // Invitations
    const inviteB = await api<InvitationDto>("/v1/invitations", {
      method: "POST",
      session: societyB.chair,
      body: JSON.stringify({
        email: uniqueEmail("betainvite"),
        role: "resident",
        channels: ["email"],
      }),
    });
    const revokeOther = await api<{ code: string }>(
      `/v1/invitations/${inviteB.body.id}/revoke`,
      { method: "POST", session: chairA },
    );
    expect(revokeOther.status).toBe(404);

    const invitesA = await api<Paginated<InvitationDto>>("/v1/invitations?limit=100", {
      session: chairA,
    });
    expect(invitesA.body.items.some((i) => i.id === inviteB.body.id)).toBe(false);

    // Occupancy stats stay per-society.
    const statsA = await api<OccupancyStatsDto>("/v1/admin/occupancy/stats", {
      session: chairA,
    });
    const statsB = await api<OccupancyStatsDto>("/v1/admin/occupancy/stats", {
      session: societyB.chair,
    });
    expect(statsA.body.totalResidents).not.toBe(0);
    expect(statsB.body.totalResidents).toBeGreaterThanOrEqual(1);

    const teamB = await api<TeamMemberDto[]>("/v1/team", { session: societyB.chair });
    const teamA = await api<TeamMemberDto[]>("/v1/team", { session: chairA });
    expect(
      teamA.body.every((m) => !teamB.body.some((n) => n.userId === m.userId)),
    ).toBe(true);
  });

  // ------------------------------------------------------------ authorization

  test("residents are refused every admin resident endpoint", async () => {
    const phone = uniquePhone();
    await onboard(societyA, {
      name: "Plain Resident",
      phone,
      email: uniqueEmail("plain"),
    });
    const resident = await otpLogin(phone);
    expect(resident.user.role).toBe("resident");

    const gets = [
      "/v1/admin/residents",
      "/v1/admin/occupancy/stats",
      "/v1/admin/occupancy/flats",
      `/v1/admin/flats/${societyA.flatId}`,
      `/v1/admin/flats/${societyA.flatId}/history`,
      "/v1/invitations",
      "/v1/team",
    ];
    for (const path of gets) {
      const res = await api<{ code: string }>(path, { session: resident });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("forbidden");
    }

    const posts: Array<[string, unknown]> = [
      ["/v1/admin/residents", { name: "X", phone: uniquePhone(), email: uniqueEmail("x"), flatId: societyA.flatId }],
      ["/v1/invitations", { email: uniqueEmail("y"), role: "resident" }],
      ["/v1/team/members", { email: uniqueEmail("z"), role: "committee" }],
    ];
    for (const [path, body] of posts) {
      const res = await api<{ code: string }>(path, {
        method: "POST",
        session: resident,
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    }
  });

  test("unauthenticated callers are refused", async () => {
    for (const path of ["/v1/admin/residents", "/v1/team", "/v1/profile"]) {
      const res = await api<{ code: string }>(path);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("unauthorized");
    }
  });

  test("unknown ids return 404 rather than leaking existence", async () => {
    const ghost = "99999999-9999-9999-9999-999999999999";
    const resident = await api<{ code: string }>(`/v1/admin/residents/${ghost}`, {
      session: societyA.chair,
    });
    expect(resident.status).toBe(404);

    const flat = await api<{ code: string }>(`/v1/admin/flats/${ghost}`, {
      session: societyA.chair,
    });
    expect(flat.status).toBe(404);

    const doc = await api<{ code: string }>(
      `/v1/admin/resident-documents/${ghost}/verify`,
      { method: "POST", session: societyA.chair },
    );
    expect(doc.status).toBe(404);
  });
});
