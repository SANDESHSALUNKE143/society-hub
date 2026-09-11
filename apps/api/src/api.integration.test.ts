import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "./app";
import { db } from "./db/client";
import { residents } from "./db/schema";

/** In-process base URL — set in beforeAll so Bun coverage instruments route modules. */
let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;

async function otpLogin(phone: string) {
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
  return (await verify.json()) as {
    user: { id: string; role: string; flatId: string | null };
    tokens: { accessToken: string; refreshToken: string };
  };
}

async function passwordLogin(email: string, password: string) {
  const res = await fetch(`${base}/v1/auth/password/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as {
    user: { id: string; role: string; email: string | null };
    tokens: { accessToken: string; refreshToken: string };
  };
}

/** Unique YYYY-MM so bill generate always creates unpaid rows across re-runs. */
function uniquePeriodYm() {
  const n = Date.now() + Math.floor(Math.random() * 10_000);
  const year = 3000 + (n % 6000);
  const month = String((Math.floor(n / 37) % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

describe("api integration", () => {
  beforeAll(() => {
    // Local `.env` may set GOOGLE_CLIENT_ID for GIS. Integration cases that
    // assert the `dev:<phone>` contract need the client ID unset unless a
    // test explicitly stubs tokeninfo.
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_TOKENINFO_URL;
    // Prefer an explicit API_URL (external server) for debugging; otherwise boot
    // in-process so `bun test --coverage` measures module coverage.
    if (process.env.API_URL) {
      base = process.env.API_URL;
      return;
    }
    const app = createApp().listen(0);
    server = app;
    const port = app.server?.port;
    if (!port) throw new Error("Failed to bind in-process API for integration tests");
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server?.stop(true);
    server = null;
  });

  test("health endpoint", async () => {
    const res = await fetch(`${base}/health`);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("resident can create and list complaint", async () => {
    const { tokens } = await otpLogin("8888888888");
    const create = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "Leaking tap",
        type: "plumbing",
        description: "Kitchen sink drip overnight",
      }),
    });
    expect(create.status).toBe(200);
    const complaint = (await create.json()) as { id: string; status: string };
    expect(complaint.status).toBe("open");

    const list = await fetch(`${base}/v1/complaints?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(list.ok).toBe(true);
    const body = (await list.json()) as { items: { id: string }[] };
    expect(body.items.some((i) => i.id === complaint.id)).toBe(true);

    const detail = await fetch(`${base}/v1/complaints/${complaint.id}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(detail.ok).toBe(true);
  });

  test("admin can list all and update status", async () => {
    const resident = await otpLogin("8888888888");
    const created = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resident.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "Lift stuck",
        type: "lift",
        description: "Tower A lift not moving",
      }),
    });
    const complaint = (await created.json()) as {
      id: string;
      ticketNumber: string;
      queuePosition: number | null;
      queueHint: string | null;
    };
    expect(complaint.ticketNumber).toMatch(/^C-/);
    expect(complaint.queuePosition).toBeGreaterThanOrEqual(1);
    expect(complaint.queueHint).toBeTruthy();

    const admin = await otpLogin("9999999999");
    const patch = await fetch(`${base}/v1/complaints/${complaint.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(patch.ok).toBe(true);
    const updated = (await patch.json()) as { status: string };
    expect(updated.status).toBe("in_progress");

    const closed = await fetch(`${base}/v1/complaints/${complaint.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({
        status: "closed",
        note: "Lift motor reset and tested",
      }),
    });
    expect(closed.ok).toBe(true);
    const closedBody = (await closed.json()) as {
      status: string;
      closingNote: string | null;
    };
    expect(closedBody.status).toBe("closed");
    expect(closedBody.closingNote).toBe("Lift motor reset and tested");
  });

  test("superadmin can login with email and password", async () => {
    const body = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    expect(body.user.role).toBe("superadmin");
    expect(body.user.email).toBe("superadmin@societyhub.local");
    expect(body.tokens.accessToken.length).toBeGreaterThan(20);
  });

  test("forgot and reset password flow", async () => {
    const forgot = await fetch(`${base}/v1/auth/password/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "superadmin@societyhub.local" }),
    });
    expect(forgot.ok).toBe(true);
    const forgotBody = (await forgot.json()) as { ok: true; devCode?: string };
    expect(forgotBody.devCode).toBe("123456");

    const reset = await fetch(`${base}/v1/auth/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "superadmin@societyhub.local",
        code: "123456",
        newPassword: "Test@1234",
      }),
    });
    expect(reset.ok).toBe(true);
  });

  test("set pin and login with pin", async () => {
    const session = await otpLogin("8888888888");
    const setPin = await fetch(`${base}/v1/auth/pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({ pin: "4321" }),
    });
    expect(setPin.ok).toBe(true);

    const pinLogin = await fetch(`${base}/v1/auth/pin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "8888888888", pin: "4321" }),
    });
    expect(pinLogin.ok).toBe(true);
  });

  test("refresh and logout", async () => {
    const session = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const refresh = await fetch(`${base}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
    });
    expect(refresh.ok).toBe(true);
    const tokens = (await refresh.json()) as {
      accessToken: string;
      refreshToken: string;
    };

    const logout = await fetch(`${base}/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    expect(logout.ok).toBe(true);
  });

  test("auth me and google dev login", async () => {
    const session = await otpLogin("9999999999");
    const me = await fetch(`${base}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(me.ok).toBe(true);

    const google = await fetch(`${base}/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "dev:8888888888" }),
    });
    expect(google.ok).toBe(true);
  });

  test("google SSO verifies id token for an onboarded email", async () => {
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevUrl = process.env.GOOGLE_TOKENINFO_URL;
    const audience = "test-client.apps.googleusercontent.com";
    const mock = Bun.serve({
      port: 0,
      fetch(req) {
        const token = new URL(req.url).searchParams.get("id_token");
        if (token === "good-google-jwt") {
          return Response.json({
            aud: audience,
            sub: "google-sub-admin",
            email: "admin@keshav.local",
            email_verified: "true",
          });
        }
        if (token === "unknown-google-jwt") {
          return Response.json({
            aud: audience,
            sub: "google-sub-unknown",
            email: "nobody@example.com",
            email_verified: true,
          });
        }
        return new Response("invalid", { status: 400 });
      },
    });
    process.env.GOOGLE_CLIENT_ID = audience;
    process.env.GOOGLE_TOKENINFO_URL = `http://127.0.0.1:${mock.port}`;
    try {
      const ok = await fetch(`${base}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "good-google-jwt" }),
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { user: { email: string | null; phone: string | null } };
      // Seeded Google sub stays onboarded even if a later test moved that user's email.
      expect(body.user.phone || body.user.email).toBeTruthy();

      const unknown = await fetch(`${base}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "unknown-google-jwt" }),
      });
      expect(unknown.status).toBe(403);
      const unknownBody = (await unknown.json()) as { code: string };
      expect(unknownBody.code).toBe("not_onboarded");

      const bad = await fetch(`${base}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "bad-google-jwt" }),
      });
      expect(bad.status).toBe(401);
    } finally {
      mock.stop(true);
      if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = prevId;
      if (prevUrl === undefined) delete process.env.GOOGLE_TOKENINFO_URL;
      else process.env.GOOGLE_TOKENINFO_URL = prevUrl;
    }
  });

  test("admin lists flats and onboards resident with email", async () => {
    const admin = await otpLogin("9999999999");
    const flatsRes = await fetch(`${base}/v1/admin/flats`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(flatsRes.ok).toBe(true);
    const flats = (await flatsRes.json()) as { id: string }[];
    expect(flats.length).toBeGreaterThan(0);

    const phone = `9${String(Date.now()).slice(-9)}`;
    const onboard = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "Coverage Resident",
        phone,
        flatId: flats[0]!.id,
        email: `cov-${Date.now()}@example.com`,
      }),
    });
    expect(onboard.ok).toBe(true);

    const me = await fetch(`${base}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    const meBody = (await me.json()) as { tenantId: string };
    const buildings = await fetch(
      `${base}/v1/societies/${meBody.tenantId}/buildings`,
      { headers: { Authorization: `Bearer ${admin.tokens.accessToken}` } },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: { Authorization: `Bearer ${admin.tokens.accessToken}` } },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createVehicleFlat = await fetch(
      `${base}/v1/wings/${wingList[0]!.id}/flats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${admin.tokens.accessToken}`,
        },
        body: JSON.stringify({ number: `V-${Date.now().toString().slice(-6)}` }),
      },
    );
    expect(createVehicleFlat.ok).toBe(true);
    const vehicleFlat = (await createVehicleFlat.json()) as { id: string };

    const vehPhone = `8${String(Date.now()).slice(-9)}`;
    const extraTw = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "Vehicle Resident",
        phone: vehPhone,
        flatId: vehicleFlat.id,
        email: `veh-${Date.now()}@example.com`,
        isOwner: true,
        emergencyContact: "9111111111",
        pngGasConnection: true,
        vehicles: [
          { kind: "two_wheeler", registrationNumber: "MH12TW0001" },
          { kind: "two_wheeler", registrationNumber: "MH12TW0002" },
          {
            kind: "two_wheeler",
            registrationNumber: "MH12TW0003",
            parkingPurchased: true,
            parkingSlot: "P-TW-X",
          },
          { kind: "four_wheeler", registrationNumber: "MH12FW0001" },
        ],
      }),
    });
    expect(extraTw.ok).toBe(true);

    const vehicleUser = await otpLogin(vehPhone);
    const profile = (await (
      await fetch(`${base}/v1/profile`, {
        headers: { Authorization: `Bearer ${vehicleUser.tokens.accessToken}` },
      })
    ).json()) as {
      vehicles: { kind: string; parkingPurchased: boolean }[];
      flat: { pngGasConnection: boolean } | null;
    };
    expect(profile.vehicles).toHaveLength(4);
    expect(profile.vehicles.filter((v) => v.kind === "two_wheeler")).toHaveLength(3);
    expect(profile.vehicles.some((v) => v.parkingPurchased)).toBe(true);
    expect(profile.flat?.pngGasConnection).toBe(true);

    const flatsAfterVehicles = await fetch(`${base}/v1/admin/flats`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    const counted = (await flatsAfterVehicles.json()) as {
      id: string;
      twoWheelerCount?: number;
      fourWheelerCount?: number;
    }[];
    const countedFlat = counted.find((f) => f.id === vehicleFlat.id);
    expect(countedFlat?.twoWheelerCount).toBe(3);
    expect(countedFlat?.fourWheelerCount).toBe(1);

    const blocked = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "Too Many Bikes",
        phone: `7${String(Date.now()).slice(-9)}`,
        flatId: vehicleFlat.id,
        email: `bikes-${Date.now()}@example.com`,
        vehicles: [
          { kind: "two_wheeler", registrationNumber: "MH12TW1001" },
          { kind: "two_wheeler", registrationNumber: "MH12TW1002" },
          { kind: "two_wheeler", registrationNumber: "MH12TW1003" },
        ],
      }),
    });
    expect(blocked.status).toBe(400);

    const listed = await fetch(`${base}/v1/admin/society-residents`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(listed.ok).toBe(true);
    const residents = (await listed.json()) as {
      phone: string | null;
      name: string | null;
      flatNumber: string;
    }[];
    expect(residents.some((r) => r.phone === phone && r.name === "Coverage Resident")).toBe(
      true,
    );

    const resident = await otpLogin("8888888888");
    const forbidden = await fetch(`${base}/v1/admin/society-residents`, {
      headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
    });
    expect(forbidden.status).toBe(403);

    const householdPatch = await fetch(`${base}/v1/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${vehicleUser.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pngGasConnection: false,
        adultCount: 3,
        childCount: 2,
        seniorCitizenCount: 1,
        vehicles: [{ kind: "two_wheeler" }, { kind: "two_wheeler" }],
      }),
    });
    expect(householdPatch.ok).toBe(true);
    const household = (await householdPatch.json()) as {
      vehicles: { kind: string }[];
      flat: {
        pngGasConnection: boolean;
        adultCount: number;
        childCount: number;
        seniorCitizenCount: number;
        twoWheelerCount: number;
        fourWheelerCount: number;
      } | null;
    };
    expect(household.flat?.pngGasConnection).toBe(false);
    expect(household.flat?.adultCount).toBe(3);
    expect(household.flat?.childCount).toBe(2);
    expect(household.flat?.seniorCitizenCount).toBe(1);
    expect(household.vehicles).toHaveLength(2);
    expect(household.flat?.twoWheelerCount).toBe(2);
    expect(household.flat?.fourWheelerCount).toBe(0);

    const authAlias = await fetch(`${base}/v1/auth/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${vehicleUser.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ adultCount: 4 }),
    });
    expect(authAlias.ok).toBe(true);
    const aliased = (await authAlias.json()) as {
      flat: { adultCount: number } | null;
    };
    expect(aliased.flat?.adultCount).toBe(4);

    const overQuota = await fetch(`${base}/v1/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${vehicleUser.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vehicles: [
          { kind: "two_wheeler" },
          { kind: "two_wheeler" },
          { kind: "two_wheeler" },
        ],
      }),
    });
    expect(overQuota.status).toBe(400);
  });

  test("admin onboards multiple family members on one flat", async () => {
    const staff = await otpLogin("9999999999");
    const auth = { Authorization: `Bearer ${staff.tokens.accessToken}` };
    const me = await fetch(`${base}/v1/auth/me`, { headers: auth });
    const user = (await me.json()) as { tenantId: string };

    const buildings = await fetch(
      `${base}/v1/societies/${user.tenantId}/buildings`,
      { headers: auth },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: auth },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ number: `F-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const familyFlat = (await createFlat.json()) as { id: string };

    const phoneA = `81${String(Date.now()).slice(-8)}`;
    const emailA = `fam-a-${Date.now()}@example.com`;
    const first = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Family Member A",
        phone: phoneA,
        flatId: familyFlat.id,
        email: emailA,
        isOwner: true,
        vehicles: [
          { kind: "two_wheeler", registrationNumber: "MH12FM0001" },
          { kind: "two_wheeler", registrationNumber: "MH12FM0002" },
        ],
      }),
    });
    expect(first.ok).toBe(true);

    const phoneB = `82${String(Date.now()).slice(-8)}`;
    const second = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Family Member B",
        phone: phoneB,
        flatId: familyFlat.id,
        isOwner: false,
      }),
    });
    expect(second.ok).toBe(true);

    const listed = await fetch(`${base}/v1/admin/society-residents`, { headers: auth });
    const residents = (await listed.json()) as {
      phone: string | null;
      name: string | null;
      flatId: string;
    }[];
    const onFlat = residents.filter((r) => r.flatId === familyFlat.id);
    expect(onFlat.some((r) => r.phone === phoneA && r.name === "Family Member A")).toBe(
      true,
    );
    expect(onFlat.some((r) => r.phone === phoneB && r.name === "Family Member B")).toBe(
      true,
    );

    const extraOwner = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Would Be Second Owner",
        phone: `89${String(Date.now()).slice(-8)}`,
        flatId: familyFlat.id,
        isOwner: true,
      }),
    });
    expect(extraOwner.ok).toBe(true);
    const afterExtra = await fetch(`${base}/v1/admin/society-residents`, { headers: auth });
    const afterRows = (await afterExtra.json()) as {
      phone: string | null;
      flatId: string;
      isOwner: boolean;
    }[];
    const owners = afterRows.filter((r) => r.flatId === familyFlat.id && r.isOwner);
    expect(owners).toHaveLength(1);
    expect(owners[0]!.phone).toBe(phoneA);

    const emailClash = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Email Clash",
        phone: `83${String(Date.now()).slice(-8)}`,
        flatId: familyFlat.id,
        email: emailA,
      }),
    });
    expect(emailClash.status).toBe(409);
    const clashBody = (await emailClash.json()) as { code: string };
    expect(clashBody.code).toBe("email_taken");

    const quota = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Extra Bike",
        phone: `84${String(Date.now()).slice(-8)}`,
        flatId: familyFlat.id,
        vehicles: [{ kind: "two_wheeler", registrationNumber: "MH12FM0003" }],
      }),
    });
    expect(quota.status).toBe(400);
    const quotaBody = (await quota.json()) as { code: string };
    expect(quotaBody.code).toBe("parking_quota");

    const newOwnerPhone = `87${String(Date.now()).slice(-8)}`;
    const edited = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Owner Renamed",
        phone: newOwnerPhone,
        flatId: familyFlat.id,
        email: `owner-edit-${Date.now()}@example.com`,
        isOwner: true,
        editOwner: true,
      }),
    });
    expect(edited.ok).toBe(true);
    const afterEdit = await fetch(`${base}/v1/admin/society-residents`, { headers: auth });
    const afterEditRows = (await afterEdit.json()) as {
      phone: string | null;
      name: string | null;
      flatId: string;
      isOwner: boolean;
    }[];
    const ownersAfterEdit = afterEditRows.filter(
      (r) => r.flatId === familyFlat.id && r.isOwner,
    );
    expect(ownersAfterEdit).toHaveLength(1);
    expect(ownersAfterEdit[0]!.phone).toBe(newOwnerPhone);
    expect(ownersAfterEdit[0]!.name).toBe("Owner Renamed");
    expect(
      afterEditRows.some((r) => r.flatId === familyFlat.id && r.phone === phoneB),
    ).toBe(true);

    const phoneClash = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Owner Renamed",
        phone: phoneB,
        flatId: familyFlat.id,
        isOwner: true,
        editOwner: true,
      }),
    });
    expect(phoneClash.status).toBe(409);
    const clashPhone = (await phoneClash.json()) as { code: string };
    expect(clashPhone.code).toBe("phone_taken");

    const listedForIds = await fetch(`${base}/v1/admin/society-residents`, { headers: auth });
    const idRows = (await listedForIds.json()) as {
      userId: string;
      phone: string | null;
      flatId: string;
      isOwner: boolean;
      name: string | null;
    }[];
    const familyOnFlat = idRows.find(
      (r) => r.flatId === familyFlat.id && r.phone === phoneB,
    );
    expect(familyOnFlat).toBeTruthy();
    const ownerRow = idRows.find((r) => r.flatId === familyFlat.id && r.isOwner);
    expect(ownerRow).toBeTruthy();

    const renamedFamily = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Family Member B Updated",
        phone: phoneB,
        flatId: familyFlat.id,
        isOwner: false,
        editUserId: familyOnFlat!.userId,
      }),
    });
    expect(renamedFamily.ok).toBe(true);

    const removeOwner = await fetch(
      `${base}/v1/admin/residents/by-user/${ownerRow!.userId}`,
      { method: "DELETE", headers: auth },
    );
    expect(removeOwner.status).toBe(409);
    const removeOwnerBody = (await removeOwner.json()) as { code: string };
    expect(removeOwnerBody.code).toBe("cannot_remove_owner");

    const removed = await fetch(
      `${base}/v1/admin/residents/by-user/${familyOnFlat!.userId}`,
      { method: "DELETE", headers: auth },
    );
    expect(removed.ok).toBe(true);
    const afterDelete = await fetch(`${base}/v1/admin/society-residents`, { headers: auth });
    const afterDeleteRows = (await afterDelete.json()) as {
      userId: string;
      flatId: string;
    }[];
    expect(
      afterDeleteRows.some(
        (r) => r.flatId === familyFlat.id && r.userId === familyOnFlat!.userId,
      ),
    ).toBe(false);
  });

  test("flat owner adds a family member who can raise a complaint", async () => {
    const staff = await otpLogin("9999999999");
    const staffAuth = { Authorization: `Bearer ${staff.tokens.accessToken}` };
    const me = await fetch(`${base}/v1/auth/me`, { headers: staffAuth });
    const staffUser = (await me.json()) as { tenantId: string };
    const buildings = await fetch(
      `${base}/v1/societies/${staffUser.tenantId}/buildings`,
      { headers: staffAuth },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: staffAuth },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: { ...staffAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ number: `H-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const flat = (await createFlat.json()) as { id: string };

    const ownerPhone = `85${String(Date.now()).slice(-8)}`;
    const ownerRes = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...staffAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Flat Owner",
        phone: ownerPhone,
        flatId: flat.id,
        isOwner: true,
      }),
    });
    expect(ownerRes.ok).toBe(true);

    const owner = await otpLogin(ownerPhone);
    const ownerAuth = { Authorization: `Bearer ${owner.tokens.accessToken}` };
    const household = await fetch(`${base}/v1/household/members`, {
      headers: ownerAuth,
    });
    expect(household.ok).toBe(true);
    const householdRows = (await household.json()) as { phone: string | null }[];
    expect(householdRows.some((r) => r.phone === ownerPhone)).toBe(true);

    const familyPhone = `86${String(Date.now()).slice(-8)}`;
    const added = await fetch(`${base}/v1/household/members`, {
      method: "POST",
      headers: { ...ownerAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Son", phone: familyPhone }),
    });
    expect(added.ok).toBe(true);
    const addedBody = (await added.json()) as { user: { id: string } };

    const patched = await fetch(
      `${base}/v1/household/members/${addedBody.user.id}`,
      {
        method: "PATCH",
        headers: { ...ownerAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Daughter", phone: familyPhone }),
      },
    );
    expect(patched.ok).toBe(true);

    const missingMember = await fetch(
      `${base}/v1/household/members/${crypto.randomUUID()}`,
      {
        method: "PATCH",
        headers: { ...ownerAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost", phone: familyPhone }),
      },
    );
    expect(missingMember.status).toBe(404);

    const otherPhone = `88${String(Date.now()).slice(-8)}`;
    const other = await fetch(`${base}/v1/household/members`, {
      method: "POST",
      headers: { ...ownerAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sibling", phone: otherPhone }),
    });
    expect(other.ok).toBe(true);
    const phoneClash = await fetch(
      `${base}/v1/household/members/${addedBody.user.id}`,
      {
        method: "PATCH",
        headers: { ...ownerAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Daughter", phone: otherPhone }),
      },
    );
    expect(phoneClash.status).toBe(409);

    const editOwner = await fetch(
      `${base}/v1/household/members/${owner.user.id}`,
      {
        method: "PATCH",
        headers: { ...ownerAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Flat Owner", phone: ownerPhone }),
      },
    );
    expect(editOwner.status).toBe(409);

    const family = await otpLogin(familyPhone);
    expect(family.user.flatId).toBe(flat.id);
    const complaint = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${family.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Lift not working",
        type: "lift",
        description: "Stuck on ground floor this morning.",
      }),
    });
    expect(complaint.ok).toBe(true);
    const familyTicket = (await complaint.json()) as { id: string; title: string };

    const ownerList = await fetch(`${base}/v1/complaints`, {
      headers: ownerAuth,
    });
    expect(ownerList.ok).toBe(true);
    const ownerItems = (await ownerList.json()) as { items: { id: string }[] };
    expect(ownerItems.items.some((c) => c.id === familyTicket.id)).toBe(true);

    const ownerDetail = await fetch(`${base}/v1/complaints/${familyTicket.id}`, {
      headers: ownerAuth,
    });
    expect(ownerDetail.ok).toBe(true);

    const ownerComplaint = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: { ...ownerAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Water leakage",
        type: "plumbing",
        description: "Kitchen sink drip since yesterday.",
      }),
    });
    expect(ownerComplaint.ok).toBe(true);
    const ownerTicket = (await ownerComplaint.json()) as { id: string };

    const familyList = await fetch(`${base}/v1/complaints`, {
      headers: { Authorization: `Bearer ${family.tokens.accessToken}` },
    });
    expect(familyList.ok).toBe(true);
    const familyItems = (await familyList.json()) as { items: { id: string }[] };
    expect(familyItems.items.some((c) => c.id === ownerTicket.id)).toBe(true);
    expect(familyItems.items.some((c) => c.id === familyTicket.id)).toBe(true);

    const familyEditOwner = await fetch(`${base}/v1/complaints/${ownerTicket.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${family.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Hijacked title" }),
    });
    expect(familyEditOwner.status).toBe(403);

    const forbidden = await fetch(`${base}/v1/household/members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${family.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Cousin", phone: `87${String(Date.now()).slice(-8)}` }),
    });
    expect(forbidden.status).toBe(403);

    const removeOwner = await fetch(
      `${base}/v1/household/members/${owner.user.id}`,
      { method: "DELETE", headers: ownerAuth },
    );
    expect(removeOwner.status).toBe(409);

    const removed = await fetch(
      `${base}/v1/household/members/${addedBody.user.id}`,
      { method: "DELETE", headers: ownerAuth },
    );
    expect(removed.ok).toBe(true);
  });

  test("staff with a linked flat can list household members", async () => {
    const staff = await otpLogin("9999999999");
    const list = await fetch(`${base}/v1/household/members`, {
      headers: { Authorization: `Bearer ${staff.tokens.accessToken}` },
    });
    expect(list.ok).toBe(true);
    const rows = (await list.json()) as { flatNumber: string | null; isOwner: boolean }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.flatNumber === "101")).toBe(true);
  });

  test("CSV resident import upserts on re-upload", async () => {
    const admin = await otpLogin("9999999999");
    const auth = {
      Authorization: `Bearer ${admin.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const me = await fetch(`${base}/v1/auth/me`, { headers: auth });
    const meBody = (await me.json()) as { tenantId: string };
    const buildings = await fetch(
      `${base}/v1/societies/${meBody.tenantId}/buildings`,
      { headers: auth },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: auth },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ number: `C-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const flat = (await createFlat.json()) as {
      id: string;
      number: string;
      wingName: string | null;
      floor: number | null;
      parkingSlot: string | null;
    };
    const phone = `6${String(Date.now()).slice(-9)}`;
    const email = `csv-upsert-${Date.now()}@example.com`;

    const first = await fetch(`${base}/v1/admin/residents/import`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        rows: [
          {
            name: "Csv Import One",
            phone,
            email,
            flatNumber: flat.number,
            wingName: flat.wingName,
            floor: flat.floor ?? 2,
            parkingSlot: flat.parkingSlot ?? "P-CSV-1",
            emergencyContact: "9111111111",
            vehicleNumber: "MH12CSV0001",
          },
        ],
        sendInvites: false,
        updateFlats: true,
      }),
    });
    expect(first.ok).toBe(true);
    const firstBody = (await first.json()) as {
      created: number;
      updated: number;
      unchanged: number;
      skipped: number;
      errors: unknown[];
    };
    expect(firstBody.created).toBe(1);
    expect(firstBody.updated).toBe(0);
    expect(firstBody.errors).toEqual([]);

    const second = await fetch(`${base}/v1/admin/residents/import`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        rows: [
          {
            name: "Csv Import Updated",
            phone,
            email,
            flatNumber: flat.number,
            wingName: flat.wingName,
            floor: (flat.floor ?? 2) + 1,
            parkingSlot: "P-CSV-UPD",
            emergencyContact: "9222222222",
            vehicleNumber: "MH12CSV0002",
          },
        ],
        sendInvites: false,
        updateFlats: true,
      }),
    });
    expect(second.ok).toBe(true);
    const secondBody = (await second.json()) as {
      created: number;
      updated: number;
      unchanged: number;
      skipped: number;
      errors: unknown[];
    };
    expect(secondBody.created).toBe(0);
    expect(secondBody.updated).toBe(1);
    expect(secondBody.errors).toEqual([]);

    const third = await fetch(`${base}/v1/admin/residents/import`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        rows: [
          {
            name: "Csv Import Updated",
            phone,
            email,
            flatNumber: flat.number,
            wingName: flat.wingName,
            emergencyContact: "9222222222",
            vehicleNumber: "MH12CSV0002",
          },
        ],
        sendInvites: false,
        updateFlats: true,
      }),
    });
    expect(third.ok).toBe(true);
    const thirdBody = (await third.json()) as {
      created: number;
      updated: number;
      unchanged: number;
    };
    expect(thirdBody.created).toBe(0);
    expect(thirdBody.updated).toBe(0);
    expect(thirdBody.unchanged).toBe(1);
  });

  test("import stores two-wheeler and four-wheeler counts without plates", async () => {
    const admin = await otpLogin("9999999999");
    const auth = {
      Authorization: `Bearer ${admin.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const me = await fetch(`${base}/v1/auth/me`, { headers: auth });
    const user = (await me.json()) as { tenantId: string };
    const buildings = await fetch(
      `${base}/v1/societies/${user.tenantId}/buildings`,
      { headers: auth },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: auth },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ number: `N-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const flat = (await createFlat.json()) as { id: string; number: string };

    const phone = `61${String(Date.now()).slice(-8)}`;
    const imported = await fetch(`${base}/v1/admin/residents/import`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        rows: [
          {
            name: "Count Only",
            phone,
            flatNumber: flat.number,
            isOwner: true,
            adultCount: 2,
            childCount: 1,
            seniorCitizenCount: 1,
            vehicles: [
              { kind: "two_wheeler" },
              { kind: "two_wheeler" },
              { kind: "four_wheeler" },
            ],
          },
        ],
        sendInvites: false,
      }),
    });
    expect(imported.ok).toBe(true);
    const body = (await imported.json()) as { created: number; errors: unknown[] };
    expect(body.created).toBe(1);
    expect(body.errors).toEqual([]);

    const resident = await otpLogin(phone);
    const profile = (await (
      await fetch(`${base}/v1/profile`, {
        headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
      })
    ).json()) as {
      vehicles: { kind: string; registrationNumber: string | null }[];
      flat: {
        adultCount: number;
        childCount: number;
        seniorCitizenCount: number;
      } | null;
    };
    expect(profile.vehicles).toHaveLength(3);
    expect(profile.vehicles.every((v) => v.registrationNumber == null)).toBe(true);
    expect(profile.vehicles.filter((v) => v.kind === "two_wheeler")).toHaveLength(2);
    expect(profile.vehicles.filter((v) => v.kind === "four_wheeler")).toHaveLength(1);
    expect(profile.flat).toMatchObject({
      adultCount: 2,
      childCount: 1,
      seniorCitizenCount: 1,
    });

    const flatsAfter = await fetch(`${base}/v1/admin/flats`, { headers: auth });
    const counted = (await flatsAfter.json()) as {
      id: string;
      twoWheelerCount?: number;
      fourWheelerCount?: number;
    }[];
    const countedFlat = counted.find((f) => f.id === flat.id);
    expect(countedFlat?.twoWheelerCount).toBe(2);
    expect(countedFlat?.fourWheelerCount).toBe(1);
  });

  test("validation error shape", async () => {
    const res = await fetch(`${base}/v1/auth/password/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad", password: "x" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("validation_error");
  });

  test("superadmin memberships list and select-tenant", async () => {
    const session = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const memberships = await fetch(`${base}/v1/auth/memberships`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(memberships.ok).toBe(true);
    const list = (await memberships.json()) as {
      tenantId: string;
      role: string;
      canUseAdminMode: boolean;
    }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.canUseAdminMode === true)).toBe(true);
    expect(list.every((m) => m.role === "superadmin")).toBe(true);

    const select = await fetch(`${base}/v1/auth/select-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: list[0]!.tenantId }),
    });
    expect(select.ok).toBe(true);
    const selected = (await select.json()) as {
      user: { tenantId: string };
      tokens: { accessToken: string };
    };
    expect(selected.user.tenantId).toBe(list[0]!.tenantId);
  });

  test("memberships collapse two roles in the same society", async () => {
    const platform = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const societies = await fetch(`${base}/v1/societies`, {
      headers: { Authorization: `Bearer ${platform.tokens.accessToken}` },
    });
    expect(societies.ok).toBe(true);
    const list = (await societies.json()) as { id: string }[];
    expect(list.length).toBeGreaterThan(0);
    const tenantId = list[0]!.id;
    const stamp = String(Date.now()).slice(-9);
    const phone = `7${stamp}`;
    const email = `dual.role.${stamp}@societyhub.local`;
    const auth = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${platform.tokens.accessToken}`,
    };

    const committee = await fetch(`${base}/v1/manage/societies/${tenantId}/team`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        email,
        phone,
        name: "Dual Role",
        role: "committee",
      }),
    });
    expect(committee.ok).toBe(true);

    const chair = await fetch(`${base}/v1/manage/societies/${tenantId}/team`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        email,
        phone,
        name: "Dual Role",
        role: "chairperson",
      }),
    });
    expect(chair.ok).toBe(true);

    const session = await otpLogin(phone);
    const memberships = await fetch(`${base}/v1/auth/memberships`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(memberships.ok).toBe(true);
    const rows = (await memberships.json()) as {
      tenantId: string;
      role: string;
    }[];
    const forSociety = rows.filter((m) => m.tenantId === tenantId);
    expect(forSociety).toHaveLength(1);
    expect(forSociety[0]!.role).toBe("chairperson");

    const select = await fetch(`${base}/v1/auth/select-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId }),
    });
    expect(select.ok).toBe(true);
    const selected = (await select.json()) as { user: { role: string } };
    expect(selected.user.role).toBe("chairperson");
  });

  test("platform user directory and activity trail", async () => {
    const session = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const auth = {
      Authorization: `Bearer ${session.tokens.accessToken}`,
    };

    const usersRes = await fetch(
      `${base}/v1/manage/users?q=${encodeURIComponent("superadmin")}`,
      { headers: auth },
    );
    expect(usersRes.status).toBe(200);
    const usersList = (await usersRes.json()) as {
      id: string;
      email: string | null;
      memberships: { role: string }[];
    }[];
    expect(Array.isArray(usersList)).toBe(true);
    expect(usersList.length).toBeGreaterThan(0);
    const me =
      usersList.find((u) => u.id === session.user.id) ??
      usersList.find((u) => u.email === session.user.email);
    expect(me).toMatchObject({ id: session.user.id });
    expect(me!.memberships.some((m) => m.role === "superadmin")).toBe(true);

    const activityRes = await fetch(
      `${base}/v1/manage/users/${me!.id}/activity`,
      { headers: auth },
    );
    expect(activityRes.status).toBe(200);
    const activity = (await activityRes.json()) as {
      action: string;
      message: string | null;
    }[];
    expect(activity.some((a) => a.action === "user.password_login")).toBe(true);

    const platform = await fetch(`${base}/v1/manage/activity`, { headers: auth });
    expect(platform.status).toBe(200);
    const feed = (await platform.json()) as { action: string }[];
    expect(feed.length).toBeGreaterThan(0);
  });

  test("superadmin can create a society via manage flow", async () => {
    const session = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const suffix = Date.now();
    const res = await fetch(`${base}/v1/societies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: `Coverage Society ${suffix}`,
        address: "1 Test Lane",
        city: "Pune",
        pincode: "411057",
        chairpersonName: "Test Chair",
        chairpersonEmail: `chair-${suffix}@example.com`,
        chairpersonPhone: `7${String(suffix).slice(-9)}`,
      }),
    });
    expect(res.ok).toBe(true);
    const society = (await res.json()) as { id: string; name: string };
    expect(society.name).toContain("Coverage Society");

    const getRes = await fetch(`${base}/v1/societies/${society.id}`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(getRes.ok).toBe(true);

    const existingFlats = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats`,
      { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } },
    );
    expect(existingFlats.ok).toBe(true);
    const seedFlats = (await existingFlats.json()) as { number: string }[];
    expect(seedFlats).toHaveLength(0);

    const addTower = await fetch(
      `${base}/v1/manage/societies/${society.id}/buildings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ name: "Tower A" }),
      },
    );
    expect(addTower.ok).toBe(true);
    const tower = (await addTower.json()) as { id: string; name: string };
    expect(tower.name).toBe("Tower A");

    const renameTower = await fetch(
      `${base}/v1/manage/societies/${society.id}/buildings/${tower.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ name: "Tower Alpha" }),
      },
    );
    expect(renameTower.ok).toBe(true);

    const addWing = await fetch(
      `${base}/v1/manage/societies/${society.id}/buildings/${tower.id}/wings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ name: "A" }),
      },
    );
    expect(addWing.ok).toBe(true);

    const addFlat = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({
          buildingId: tower.id,
          wing: "A",
          floor: 3,
          flatNumber: "M-101",
        }),
      },
    );
    expect(addFlat.ok).toBe(true);
    const createdFlat = (await addFlat.json()) as {
      number: string;
      wingName: string | null;
      floor: number | null;
    };
    expect(createdFlat.number).toBe("M-101");
    expect(createdFlat.wingName).toBe("A");
    expect(createdFlat.floor).toBe(3);

    const sameAgain = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "A", floor: 3, flatNumber: "M-101" }),
      },
    );
    expect(sameAgain.ok).toBe(true);

    const floorUpdate = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "A", floor: 4, flatNumber: "M-101" }),
      },
    );
    expect(floorUpdate.ok).toBe(true);
    expect(((await floorUpdate.json()) as { floor: number }).floor).toBe(4);

    const clash = await fetch(`${base}/v1/manage/societies/${society.id}/flats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({ wing: "B", floor: 1, flatNumber: "M-101" }),
    });
    expect(clash.status).toBe(409);

    const imported = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({
          buildingName: "Main",
          rows: [
            { wing: "B", floor: 1, flatNumber: "M-201" },
            { wing: "A", floor: 4, flatNumber: "M-101" },
            { wing: "C", floor: 2, flatNumber: "M-101" },
          ],
        }),
      },
    );
    expect(imported.ok).toBe(true);
    const importBody = (await imported.json()) as {
      created: number;
      updated: number;
      skipped: number;
      errors: { row: number }[];
    };
    expect(importBody.created).toBe(1);
    expect(importBody.skipped).toBe(1);
    expect(importBody.errors).toHaveLength(1);

    const listed = (await (
      await fetch(`${base}/v1/manage/societies/${society.id}/flats`, {
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      })
    ).json()) as { id: string; number: string }[];
    expect(listed.some((f) => f.number === "M-201")).toBe(true);

    const m201 = listed.find((f) => f.number === "M-201")!;
    const patched = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${m201.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "C", floor: 5, flatNumber: "M-205" }),
      },
    );
    expect(patched.ok).toBe(true);
    expect(((await patched.json()) as { number: string }).number).toBe("M-205");

    const clashPatch = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${m201.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "A", floor: 1, flatNumber: "101" }),
      },
    );
    expect(clashPatch.status).toBe(409);

    const samePatch = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${m201.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "C", floor: 5, flatNumber: "M-205" }),
      },
    );
    expect(samePatch.ok).toBe(true);

    const removed = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${m201.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(removed.ok).toBe(true);

    const afterDelete = (await (
      await fetch(`${base}/v1/manage/societies/${society.id}/flats`, {
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      })
    ).json()) as { number: string }[];
    expect(afterDelete.some((f) => f.number === "M-205")).toBe(false);

    const revived = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "C", floor: 5, flatNumber: "M-205" }),
      },
    );
    expect(revived.ok).toBe(true);

    const missingFlat = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${crypto.randomUUID()}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "A", floor: 1, flatNumber: "Z-9" }),
      },
    );
    expect(missingFlat.status).toBe(404);

    const missing = await fetch(
      `${base}/v1/manage/societies/${crypto.randomUUID()}/flats`,
      { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } },
    );
    expect(missing.status).toBe(404);

    const puzzle = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({
          kind: "puzzle",
          wing: "A",
          slotNumber: "101",
        }),
      },
    );
    expect(puzzle.ok).toBe(true);
    const puzzleSlot = (await puzzle.json()) as {
      id: string;
      kind: string;
      wing: string | null;
      slotNumber: string;
    };
    expect(puzzleSlot).toMatchObject({
      kind: "puzzle",
      wing: "A",
      slotNumber: "101",
    });

    const openSlot = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ kind: "open", slotNumber: "OP-9" }),
      },
    );
    expect(openSlot.ok).toBe(true);
    const openBody = (await openSlot.json()) as { id: string };

    const otherWing = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({
          kind: "puzzle",
          wing: "B",
          slotNumber: "101",
        }),
      },
    );
    expect(otherWing.ok).toBe(true);

    const parkingListRes = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } },
    );
    expect(parkingListRes.ok).toBe(true);
    const parkingRows = (await parkingListRes.json()) as { slotNumber: string }[];
    expect(parkingRows.some((p) => p.slotNumber === "101")).toBe(true);
    expect(parkingRows.some((p) => p.slotNumber === "OP-9")).toBe(true);

    const badPuzzle = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({ kind: "puzzle", slotNumber: "X-1" }),
      },
    );
    expect(badPuzzle.status).toBe(400);

    const parkingImported = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.tokens.accessToken}`,
        },
        body: JSON.stringify({
          rows: [
            { kind: "puzzle", wing: "C", slotNumber: "601" },
            { kind: "open", slotNumber: "OP-9" },
          ],
        }),
      },
    );
    expect(parkingImported.ok).toBe(true);

    const removedOpen = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings/${openBody.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(removedOpen.ok).toBe(true);

    const platformParking = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.tokens.accessToken}`,
    };
    const revivedOpen = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: platformParking,
        body: JSON.stringify({ kind: "open", slotNumber: "OP-9" }),
      },
    );
    expect(revivedOpen.ok).toBe(true);
    const revivedOpenBody = (await revivedOpen.json()) as { id: string };

    const openWingA = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: platformParking,
        body: JSON.stringify({ kind: "open", wing: "A", slotNumber: "OP-22" }),
      },
    );
    expect(openWingA.ok).toBe(true);
    const openWingB = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings`,
      {
        method: "POST",
        headers: platformParking,
        body: JSON.stringify({ kind: "open", wing: "B", slotNumber: "OP-22" }),
      },
    );
    expect(openWingB.ok).toBe(true);

    const patchedPuzzle = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings/${puzzleSlot.id}`,
      {
        method: "PATCH",
        headers: platformParking,
        body: JSON.stringify({ kind: "puzzle", wing: "A", slotNumber: "102" }),
      },
    );
    expect(patchedPuzzle.ok).toBe(true);

    const parkingClash = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings/${puzzleSlot.id}`,
      {
        method: "PATCH",
        headers: platformParking,
        body: JSON.stringify({ kind: "puzzle", wing: "B", slotNumber: "101" }),
      },
    );
    expect(parkingClash.status).toBe(409);
    const parkingClashBody = (await parkingClash.json()) as { message?: string };
    expect(parkingClashBody.message ?? "").toContain("already exists");

    const chair = await otpLogin(`7${String(suffix).slice(-9)}`);
    const revivedFlat = (await revived.json()) as { id: string };
    const parked = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chair.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "Parker",
        phone: `71${String(Date.now()).slice(-8)}`,
        flatId: revivedFlat.id,
        parkingSlot: "OP-9",
      }),
    });
    expect(parked.ok).toBe(true);

    const parkingInUse = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings/${revivedOpenBody.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(parkingInUse.status).toBe(409);

    const patchedAssigned = await fetch(
      `${base}/v1/manage/societies/${society.id}/parkings/${revivedOpenBody.id}`,
      {
        method: "PATCH",
        headers: platformParking,
        body: JSON.stringify({ kind: "open", slotNumber: "OP-9" }),
      },
    );
    expect(patchedAssigned.ok).toBe(true);

    const staff = await otpLogin("9999999999");
    const forbidden = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staff.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "C", floor: 2, flatNumber: "M-301" }),
      },
    );
    expect(forbidden.status).toBe(403);

    const forbiddenPatch = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${m201.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staff.tokens.accessToken}`,
        },
        body: JSON.stringify({ wing: "C", floor: 2, flatNumber: "M-301" }),
      },
    );
    expect(forbiddenPatch.status).toBe(403);

    const forbiddenDelete = await fetch(
      `${base}/v1/manage/societies/${society.id}/flats/${m201.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${staff.tokens.accessToken}` },
      },
    );
    expect(forbiddenDelete.status).toBe(403);

    const inUse = await fetch(
      `${base}/v1/manage/societies/11111111-1111-1111-1111-111111111111/flats/66666666-6666-6666-6666-666666666666`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(inUse.status).toBe(409);

    // Platform Manage team may use Client Admin APIs in any society.
    const buildingsAsPlatform = await fetch(
      `${base}/v1/societies/${society.id}/buildings`,
      { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } },
    );
    expect(buildingsAsPlatform.status).toBe(200);
  });

  test("admin can generate bills and resident can pay a bill (mock)", async () => {
    const admin = await otpLogin("9999999999");
    // Unique YYYY-MM so re-runs never hit an already-paid period for flat 101.
    const periodYm = uniquePeriodYm();
    const generate = await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({ periodYm, amountPaise: 500000, reason: "Monthly maintenance" }),
    });
    expect(generate.ok).toBe(true);
    const generated = (await generate.json()) as { created: number };
    expect(generated.created).toBeGreaterThan(0);

    const resident = await otpLogin("8888888888");
    const mine = await fetch(`${base}/v1/bills/mine`, {
      headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
    });
    expect(mine.ok).toBe(true);
    const bills = (await mine.json()) as {
      id: string;
      periodYm: string;
      status: string;
    }[];
    const bill = bills.find(
      (b) => b.periodYm === periodYm && b.status !== "paid",
    );
    expect(bill).toBeTruthy();

    const detail = await fetch(`${base}/v1/bills/${bill!.id}`, {
      headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
    });
    expect(detail.ok).toBe(true);
    const detailBody = (await detail.json()) as {
      id: string;
      lineItems?: { label: string; amountPaise: number }[];
      payments?: unknown[];
      owner?: { name: string | null; phone: string | null } | null;
      occupants?: unknown[];
    };
    expect(detailBody.lineItems?.length).toBeGreaterThan(0);
    expect(detailBody.lineItems![0]!.label).toContain(periodYm);
    expect(detailBody.lineItems![0]!.label).toContain("Monthly maintenance");
    expect(detailBody.lineItems![0]!.amountPaise).toBe(500000);
    expect(Array.isArray(detailBody.payments)).toBe(true);
    expect(detailBody.owner === null || typeof detailBody.owner?.name === "string" || detailBody.owner?.name === null).toBe(
      true,
    );
    if (detailBody.owner) {
      expect("phone" in detailBody.owner).toBe(true);
      expect("email" in detailBody.owner).toBe(true);
    }
    expect(Array.isArray(detailBody.occupants)).toBe(true);

    const notify = await fetch(`${base}/v1/bills/${bill!.id}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(notify.ok).toBe(true);
    const notifyBody = (await notify.json()) as { ok: boolean; notified: number };
    expect(notifyBody.ok).toBe(true);
    expect(notifyBody.notified).toBeGreaterThan(0);

    const residentNotify = await fetch(`${base}/v1/bills/${bill!.id}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resident.tokens.accessToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(residentNotify.status).toBe(403);

    const pay = await fetch(`${base}/v1/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resident.tokens.accessToken}`,
      },
      body: JSON.stringify({ billId: bill!.id }),
    });
    expect(pay.ok).toBe(true);
    const payment = (await pay.json()) as { status: string };
    expect(payment.status).toBe("success");
  });

  test("notices: admin publishes, resident sees it, marks read", async () => {
    const admin = await otpLogin("9999999999");
    const create = await fetch(`${base}/v1/notices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "Water supply maintenance",
        body: "No water tomorrow 10am-2pm",
        audience: "all",
      }),
    });
    expect(create.ok).toBe(true);
    const notice = (await create.json()) as { id: string };

    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const form = new FormData();
    form.append("file", new File([png], "notice.png", { type: "image/png" }));
    const attach = await fetch(`${base}/v1/notices/${notice.id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
      body: form,
    });
    expect(attach.ok).toBe(true);
    const withMedia = (await attach.json()) as {
      attachments: { id: string; url: string }[];
    };
    expect(withMedia.attachments.length).toBe(1);

    const publish = await fetch(`${base}/v1/notices/${notice.id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(publish.ok).toBe(true);

    const resident = await otpLogin("8888888888");
    const list = await fetch(`${base}/v1/notices`, {
      headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
    });
    expect(list.ok).toBe(true);
    const noticesPage = (await list.json()) as {
      items: { id: string; attachments?: { id: string }[] }[];
      page: number;
      limit: number;
      total: number;
    };
    expect(Array.isArray(noticesPage.items)).toBe(true);
    const listed = noticesPage.items.find((n) => n.id === notice.id);
    expect(listed).toBeTruthy();
    expect(listed!.attachments?.length).toBe(1);

    const searched = await fetch(
      `${base}/v1/notices?search=${encodeURIComponent("Water supply")}&sort=title&order=asc&limit=5`,
      { headers: { Authorization: `Bearer ${resident.tokens.accessToken}` } },
    );
    expect(searched.ok).toBe(true);
    const searchedPage = (await searched.json()) as {
      items: { id: string; title: string }[];
      total: number;
      limit: number;
    };
    expect(searchedPage.limit).toBe(5);
    expect(searchedPage.items.some((n) => n.id === notice.id)).toBe(true);

    const staffList = await fetch(`${base}/v1/notices?status=published&page=1&limit=10`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(staffList.ok).toBe(true);
    const staffPage = (await staffList.json()) as {
      items: { id: string }[];
      page: number;
      total: number;
    };
    expect(staffPage.page).toBe(1);
    expect(staffPage.items.some((n) => n.id === notice.id)).toBe(true);

    const media = await fetch(
      `${base}/v1/notice-media/${withMedia.attachments[0]!.id}`,
      { headers: { Authorization: `Bearer ${resident.tokens.accessToken}` } },
    );
    expect(media.ok).toBe(true);

    const read = await fetch(`${base}/v1/notices/${notice.id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
    });
    expect(read.ok).toBe(true);
  });

  test("dashboard stats and audit log visibility for staff", async () => {
    const admin = await otpLogin("9999999999");
    const stats = await fetch(`${base}/v1/dashboard/stats`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(stats.ok).toBe(true);
    const statsBody = (await stats.json()) as {
      totalComplaints: number;
      openComplaints: number;
    };
    expect(statsBody.totalComplaints).toBeGreaterThanOrEqual(0);

    const mineStats = await fetch(`${base}/v1/dashboard/stats?mine=1`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(mineStats.ok).toBe(true);
    const mineBody = (await mineStats.json()) as {
      totalComplaints: number;
      openComplaints: number;
    };
    expect(mineBody.totalComplaints).toBeLessThanOrEqual(statsBody.totalComplaints);
    expect(mineBody.openComplaints).toBeLessThanOrEqual(statsBody.openComplaints);

    const resident = await otpLogin("8888888888");
    const residentStats = await fetch(`${base}/v1/dashboard/stats`, {
      headers: { Authorization: `Bearer ${resident.tokens.accessToken}` },
    });
    expect(residentStats.ok).toBe(true);

    const audit = await fetch(`${base}/v1/audit`, {
      headers: { Authorization: `Bearer ${admin.tokens.accessToken}` },
    });
    expect(audit.ok).toBe(true);
    const auditLogs = (await audit.json()) as { action: string }[];
    expect(Array.isArray(auditLogs)).toBe(true);
  });

  test("complaint comments and assignment flow", async () => {
    const resident = await otpLogin("8888888888");
    const created = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resident.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "Security gate broken",
        type: "security",
        description: "Main gate not closing",
      }),
    });
    const complaint = (await created.json()) as { id: string };

    const admin = await otpLogin("9999999999");
    const assign = await fetch(`${base}/v1/complaints/${complaint.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.tokens.accessToken}`,
      },
      body: JSON.stringify({ status: "assigned" }),
    });
    expect(assign.ok).toBe(true);
    const assigned = (await assign.json()) as {
      status: string;
      assignedToUserId: string | null;
    };
    expect(assigned.status).toBe("assigned");
    expect(assigned.assignedToUserId).toBeTruthy();

    const comment = await fetch(
      `${base}/v1/complaints/${complaint.id}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${admin.tokens.accessToken}`,
        },
        body: JSON.stringify({ body: "Technician dispatched" }),
      },
    );
    expect(comment.ok).toBe(true);
    const withComment = (await comment.json()) as {
      comments: { body: string; createdAt?: string }[];
    };
    expect(withComment.comments.some((c) => c.body === "Technician dispatched")).toBe(
      true,
    );
    expect(withComment.comments[0]?.createdAt ?? "").toMatch(/Z$/);
  });

  test("resident can comment, ask, edit, and delete an open complaint", async () => {
    const resident = await otpLogin("8888888888");
    const rAuth = {
      Authorization: `Bearer ${resident.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const created = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({
        title: "Tap dripping",
        type: "plumbing",
        description: "Kitchen tap will not close",
      }),
    });
    expect(created.ok).toBe(true);
    const complaint = (await created.json()) as {
      id: string;
      createdAt: string;
    };
    expect(complaint.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const edited = await fetch(`${base}/v1/complaints/${complaint.id}`, {
      method: "PATCH",
      headers: rAuth,
      body: JSON.stringify({ title: "Kitchen tap dripping" }),
    });
    expect(edited.ok).toBe(true);
    expect(((await edited.json()) as { title: string }).title).toBe(
      "Kitchen tap dripping",
    );

    const question = await fetch(`${base}/v1/complaints/${complaint.id}/comments`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({ body: "Can someone visit today?", kind: "question" }),
    });
    expect(question.ok).toBe(true);
    const withQ = (await question.json()) as {
      comments: { body: string; kind: string }[];
    };
    expect(withQ.comments.some((c) => c.kind === "question")).toBe(true);

    const comment = await fetch(`${base}/v1/complaints/${complaint.id}/comments`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({ body: "Still leaking this evening." }),
    });
    expect(comment.ok).toBe(true);

    const removed = await fetch(`${base}/v1/complaints/${complaint.id}`, {
      method: "DELETE",
      headers: rAuth,
    });
    expect(removed.ok).toBe(true);

    const gone = await fetch(`${base}/v1/complaints/${complaint.id}`, {
      headers: rAuth,
    });
    expect(gone.status).toBe(404);
  });

  test("chairperson can raise complaint by selecting a flat", async () => {
    const session = await otpLogin("9999999999");
    expect(session.user.role).toBe("chairperson");
    const me = await fetch(`${base}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    const staffUser = (await me.json()) as {
      tenantId: string;
      flatId: string | null;
    };
    const buildings = await fetch(
      `${base}/v1/societies/${staffUser.tenantId}/buildings`,
      { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: { Authorization: `Bearer ${session.tokens.accessToken}` } },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: `C-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const picked = (await createFlat.json()) as { id: string; number: string };
    expect(picked.id).not.toBe(staffUser.flatId);

    const create = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "Chairperson raised issue",
        type: "other",
        typeOtherText: "inspection",
        description: "Raised from Client App Admin mode",
        flatId: picked.id,
      }),
    });
    expect(create.ok).toBe(true);
    const complaint = (await create.json()) as {
      id: string;
      flatId: string;
      flatNumber: string;
    };
    expect(complaint.flatId).toBe(picked.id);
    expect(complaint.flatNumber).toBe(picked.number);
  });

  test("resident cannot raise a complaint for another flat", async () => {
    const resident = await otpLogin("8888888888");
    const staff = await otpLogin("9999999999");
    const linkedFlatId = resident.user.flatId;
    if (!linkedFlatId) throw new Error("resident fixture has no linked flat");

    const me = await fetch(`${base}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${staff.tokens.accessToken}` },
    });
    const staffUser = (await me.json()) as { tenantId: string };
    const buildings = await fetch(
      `${base}/v1/societies/${staffUser.tenantId}/buildings`,
      { headers: { Authorization: `Bearer ${staff.tokens.accessToken}` } },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: { Authorization: `Bearer ${staff.tokens.accessToken}` } },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staff.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: `R-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const other = (await createFlat.json()) as { id: string };

    const spoof = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resident.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "Not my flat",
        type: "plumbing",
        description: "Trying another lot",
        flatId: other.id,
      }),
    });
    expect(spoof.status).toBe(403);
    const spoofBody = (await spoof.json()) as { code: string };
    expect(spoofBody.code).toBe("forbidden");

    const own = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resident.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "My linked flat",
        type: "plumbing",
        description: "Kitchen tap drip",
      }),
    });
    expect(own.ok).toBe(true);
    const complaint = (await own.json()) as { flatId: string };
    expect(complaint.flatId).toBe(linkedFlatId);
  });

  test("unlinked resident cannot raise a complaint", async () => {
    const staff = await otpLogin("9999999999");
    const staffAuth = { Authorization: `Bearer ${staff.tokens.accessToken}` };
    const me = await fetch(`${base}/v1/auth/me`, { headers: staffAuth });
    const staffUser = (await me.json()) as { tenantId: string };
    const buildings = await fetch(
      `${base}/v1/societies/${staffUser.tenantId}/buildings`,
      { headers: staffAuth },
    );
    const buildingList = (await buildings.json()) as { id: string }[];
    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: staffAuth },
    );
    const wingList = (await wings.json()) as { id: string }[];
    const createFlat = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      method: "POST",
      headers: { ...staffAuth, "Content-Type": "application/json" },
      body: JSON.stringify({ number: `U-${Date.now().toString().slice(-6)}` }),
    });
    expect(createFlat.ok).toBe(true);
    const flat = (await createFlat.json()) as { id: string };
    const phone = `87${String(Date.now()).slice(-8)}`;
    const onboard = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: { ...staffAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unlinked Resident",
        phone,
        flatId: flat.id,
        isOwner: true,
      }),
    });
    expect(onboard.ok).toBe(true);

    const linked = await otpLogin(phone);
    expect(linked.user.flatId).toBe(flat.id);
    await db
      .update(residents)
      .set({ isDeleted: true, updatedBy: staff.user.id })
      .where(eq(residents.userId, linked.user.id));

    const unlinked = await otpLogin(phone);
    expect(unlinked.user.role).toBe("resident");
    expect(unlinked.user.flatId).toBeNull();

    const create = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${unlinked.tokens.accessToken}`,
      },
      body: JSON.stringify({
        title: "No household",
        type: "plumbing",
        description: "Should not attach to a random lot",
        flatId: flat.id,
      }),
    });
    expect(create.status).toBe(400);
    const body = (await create.json()) as { code: string };
    expect(body.code).toBe("no_flat");
  });

  test("platform can add SocietyHub user to society team", async () => {
    const session = await passwordLogin(
      "superadmin@societyhub.local",
      process.env.SUPERADMIN_PASSWORD ?? "Test@1234",
    );
    const societies = await fetch(`${base}/v1/societies`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(societies.ok).toBe(true);
    const list = (await societies.json()) as { id: string }[];
    expect(list.length).toBeGreaterThan(0);

    const email = `platform.ops.${Date.now()}@societyhub.local`;
    const phone = `8${String(Date.now()).slice(-9)}`;
    const add = await fetch(`${base}/v1/manage/societies/${list[0]!.id}/team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({
        email,
        phone,
        name: "Platform Ops",
        role: "secretary",
      }),
    });
    expect(add.ok).toBe(true);
    const body = (await add.json()) as { role: string; userId: string };
    expect(body.role).toBe("secretary");

    const listed = await fetch(`${base}/v1/manage/societies/${list[0]!.id}/team`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(listed.ok).toBe(true);
    const team = (await listed.json()) as { userId: string; role: string }[];
    expect(team.some((m) => m.userId === body.userId && m.role === "secretary")).toBe(
      true,
    );

    const otp = await otpLogin(phone);
    expect(otp.user.id).toBe(body.userId);

    const removed = await fetch(
      `${base}/v1/manage/societies/${list[0]!.id}/team/${body.userId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(removed.ok).toBe(true);

    const afterDelete = await fetch(
      `${base}/v1/manage/societies/${list[0]!.id}/team`,
      {
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(afterDelete.ok).toBe(true);
    const remaining = (await afterDelete.json()) as { userId: string }[];
    expect(remaining.some((m) => m.userId === body.userId)).toBe(false);

    const missingSociety = await fetch(
      `${base}/v1/manage/societies/${crypto.randomUUID()}/team`,
      {
        headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
      },
    );
    expect(missingSociety.status).toBe(404);
  });

  test("re-adding society team member with mobile enables OTP login", async () => {
    const session = await passwordLogin(
      "superadmin@societyhub.local",
      process.env.SUPERADMIN_PASSWORD ?? "Test@1234",
    );
    const societies = await fetch(`${base}/v1/societies`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(societies.ok).toBe(true);
    const list = (await societies.json()) as { id: string }[];
    expect(list.length).toBeGreaterThan(0);

    const email = `ops.nophone.${Date.now()}@societyhub.local`;
    const phone = `7${String(Date.now()).slice(-9)}`;
    const first = await fetch(`${base}/v1/manage/societies/${list[0]!.id}/team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({
        email,
        name: "No Phone Yet",
        role: "committee",
      }),
    });
    expect(first.ok).toBe(true);

    await fetch(`${base}/v1/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const blocked = await fetch(`${base}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: "123456" }),
    });
    expect(blocked.status).toBe(403);

    const attach = await fetch(`${base}/v1/manage/societies/${list[0]!.id}/team`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.tokens.accessToken}`,
      },
      body: JSON.stringify({
        email,
        phone,
        role: "committee",
      }),
    });
    expect(attach.ok).toBe(true);

    const otp = await otpLogin(phone);
    expect(otp.user.id).toBeTruthy();
  });

  test("resident UPI screenshot is credited only after staff acknowledge", async () => {
    const staff = await otpLogin("9999999999");
    const resident = await otpLogin("8888888888");
    const sAuth = {
      Authorization: `Bearer ${staff.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const rAuth = { Authorization: `Bearer ${resident.tokens.accessToken}` };

    const account = await fetch(`${base}/v1/payments/account`, {
      method: "PATCH",
      headers: sAuth,
      body: JSON.stringify({ upiId: "keshav@upi", accountName: "Keshav Heights" }),
    });
    expect(account.ok).toBe(true);
    const published = (await account.json()) as { upiId: string };
    expect(published.upiId).toBe("keshav@upi");

    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    const qrForm = new FormData();
    qrForm.append("file", new File([png], "qr.png", { type: "image/png" }));
    const qrUpload = await fetch(`${base}/v1/payments/account/qr`, {
      method: "POST",
      headers: { Authorization: sAuth.Authorization },
      body: qrForm,
    });
    expect(qrUpload.ok).toBe(true);
    const withQr = (await qrUpload.json()) as { qrUrl: string | null };
    expect(withQr.qrUrl).toBeTruthy();

    const accountGet = await fetch(`${base}/v1/payments/account`, { headers: rAuth });
    expect(accountGet.ok).toBe(true);

    const qrGet = await fetch(`${base}/v1/payments/account/qr`, { headers: rAuth });
    expect(qrGet.ok).toBe(true);

    const periodYm = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm, amountPaise: 15000, reason: "Monthly maintenance" }),
    });
    const bills = (await (
      await fetch(`${base}/v1/bills/mine`, { headers: rAuth })
    ).json()) as { id: string; periodYm: string }[];
    const bill = bills.find((b) => b.periodYm === periodYm);
    expect(bill).toBeTruthy();

    const form = new FormData();
    form.append("billId", bill!.id);
    form.append("file", new File([png], "proof.png", { type: "image/png" }));
    const submit = await fetch(`${base}/v1/payments/offline`, {
      method: "POST",
      headers: rAuth,
      body: form,
    });
    expect(submit.ok).toBe(true);
    const pending = (await submit.json()) as {
      id: string;
      status: string;
      method: string;
    };
    expect(pending.status).toBe("pending");
    expect(pending.method).toBe("upi");

    const proof = await fetch(`${base}/v1/payments/${pending.id}/proof`, {
      headers: { Authorization: sAuth.Authorization },
    });
    expect(proof.ok).toBe(true);

    const before = (await (
      await fetch(`${base}/v1/bills/${bill!.id}`, { headers: rAuth })
    ).json()) as { status: string };
    expect(before.status).not.toBe("paid");

    const residentAck = await fetch(`${base}/v1/payments/${pending.id}/acknowledge`, {
      method: "POST",
      headers: { ...rAuth, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(residentAck.status).toBe(403);

    const ack = await fetch(`${base}/v1/payments/${pending.id}/acknowledge`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({}),
    });
    expect(ack.ok).toBe(true);
    const credited = (await ack.json()) as { status: string };
    expect(credited.status).toBe("success");

    const after = (await (
      await fetch(`${base}/v1/bills/${bill!.id}`, { headers: rAuth })
    ).json()) as { status: string };
    expect(after.status).toBe("paid");

    const rejectPeriod = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm: rejectPeriod, amountPaise: 15000, reason: "Monthly maintenance" }),
    });
    const laterBills = (await (
      await fetch(`${base}/v1/bills/mine`, { headers: rAuth })
    ).json()) as { id: string; periodYm: string }[];
    const rejectBill = laterBills.find((b) => b.periodYm === rejectPeriod);
    expect(rejectBill).toBeTruthy();
    const rejectForm = new FormData();
    rejectForm.append("billId", rejectBill!.id);
    rejectForm.append("file", new File([png], "proof2.png", { type: "image/png" }));
    const rejectSubmit = await fetch(`${base}/v1/payments/offline`, {
      method: "POST",
      headers: rAuth,
      body: rejectForm,
    });
    expect(rejectSubmit.ok).toBe(true);
    const toReject = (await rejectSubmit.json()) as { id: string };
    const rejected = await fetch(`${base}/v1/payments/${toReject.id}/reject`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ note: "Unclear screenshot" }),
    });
    expect(rejected.ok).toBe(true);
    const rejectedBody = (await rejected.json()) as { status: string };
    expect(rejectedBody.status).toBe("failed");
    const stillUnpaid = (await (
      await fetch(`${base}/v1/bills/${rejectBill!.id}`, { headers: rAuth })
    ).json()) as { status: string };
    expect(stillUnpaid.status).not.toBe("paid");
  });

  test("profile, notifications, team, and invitations", async () => {
    const staff = await otpLogin("9999999999");
    const auth = { Authorization: `Bearer ${staff.tokens.accessToken}` };

    const profileGet = await fetch(`${base}/v1/profile`, { headers: auth });
    expect(profileGet.ok).toBe(true);

    const profilePatch = await fetch(`${base}/v1/profile`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        emergencyContact: "9999999999",
        vehicleNumber: "MH12AB1234",
      }),
    });
    expect(profilePatch.ok).toBe(true);

    const team = await fetch(`${base}/v1/team`, { headers: auth });
    expect(team.ok).toBe(true);

    const addPhone = `6${String(Date.now()).slice(-9)}`;
    const addEmail = `team.add.${Date.now()}@example.com`;
    const addedRes = await fetch(`${base}/v1/team`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: addEmail,
        phone: addPhone,
        name: "New Staff",
        role: "secretary",
      }),
    });
    expect(addedRes.ok).toBe(true);
    const added = (await addedRes.json()) as { userId: string; role: string };
    expect(added.role).toBe("secretary");
    const addedOtp = await otpLogin(addPhone);
    expect(addedOtp.user.id).toBe(added.userId);

    const householdNoFlat = await fetch(`${base}/v1/household/members`, {
      headers: { Authorization: `Bearer ${addedOtp.tokens.accessToken}` },
    });
    expect(householdNoFlat.status).toBe(400);

    const noFlatVehicles = await fetch(`${base}/v1/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${addedOtp.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pngGasConnection: true,
        vehicles: [{ kind: "two_wheeler" }],
      }),
    });
    expect(noFlatVehicles.status).toBe(400);
    const noFlatBody = (await noFlatVehicles.json()) as { code: string };
    expect(noFlatBody.code).toBe("no_flat");

    const emergencyOnly = await fetch(`${base}/v1/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${addedOtp.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ emergencyContact: "9111111111" }),
    });
    expect(emergencyOnly.ok).toBe(true);

    const movedPhone = `5${String(Date.now()).slice(-9)}`;
    const patchedRes = await fetch(`${base}/v1/team/${added.userId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: movedPhone,
        name: "Renamed Staff",
        role: "treasurer",
      }),
    });
    expect(patchedRes.ok).toBe(true);
    const patched = (await patchedRes.json()) as {
      phone: string;
      name: string;
      role: string;
    };
    expect(patched.phone).toBe(movedPhone);
    expect(patched.name).toBe("Renamed Staff");
    expect(patched.role).toBe("treasurer");
    const patchedOtp = await otpLogin(movedPhone);
    expect(patchedOtp.user.id).toBe(added.userId);

    const selfRemove = await fetch(`${base}/v1/team/${staff.user.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(selfRemove.status).toBe(400);

    const removedRes = await fetch(`${base}/v1/team/${added.userId}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(removedRes.ok).toBe(true);

    const restoredRes = await fetch(`${base}/v1/team`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: addEmail,
        phone: movedPhone,
        name: "New Staff",
        role: "secretary",
      }),
    });
    expect(restoredRes.ok).toBe(true);

    const takenPhone = await fetch(`${base}/v1/team`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: addEmail,
        phone: "8888888888",
        role: "committee",
      }),
    });
    expect(takenPhone.status).toBe(409);

    const resident = await otpLogin("8888888888");
    const residentAdd = await fetch(`${base}/v1/team`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resident.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: `4${String(Date.now()).slice(-9)}`,
        role: "committee",
      }),
    });
    expect(residentAdd.status).toBe(403);

    const invite = await fetch(`${base}/v1/invitations`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `invite.${Date.now()}@example.com`,
        role: "resident",
      }),
    });
    expect(invite.ok).toBe(true);
    const invitation = (await invite.json()) as { id: string };

    const invites = await fetch(`${base}/v1/invitations`, { headers: auth });
    expect(invites.ok).toBe(true);

    const revoke = await fetch(`${base}/v1/invitations/${invitation.id}/revoke`, {
      method: "POST",
      headers: auth,
    });
    expect(revoke.ok).toBe(true);

    const adminStructure = await fetch(`${base}/v1/admin/structure`, {
      headers: auth,
    });
    expect(adminStructure.ok).toBe(true);

    // Inventory create/import is Manage-only (platform).
    const platform = await passwordLogin(
      "superadmin@societyhub.local",
      process.env.SUPERADMIN_PASSWORD ?? "Test@1234",
    );
    const platformAuth = {
      Authorization: `Bearer ${platform.tokens.accessToken}`,
    };
    const meRes = await fetch(`${base}/v1/auth/me`, { headers: auth });
    expect(meRes.ok).toBe(true);
    const meBody = (await meRes.json()) as { tenantId: string };
    const tenantId = meBody.tenantId;
    expect(tenantId).toBeTruthy();

    const flatImport = await fetch(
      `${base}/v1/manage/societies/${tenantId}/flats/import`,
      {
        method: "POST",
        headers: { ...platformAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingName: "Tower CSV",
          rows: [
            {
              wing: "Z",
              floor: 9,
              flatNumber: `Z-CSV-${Date.now().toString().slice(-6)}`,
            },
          ],
        }),
      },
    );
    expect(flatImport.ok).toBe(true);
    const flatImportBody = (await flatImport.json()) as { created: number };
    expect(flatImportBody.created).toBeGreaterThanOrEqual(1);

    const parkingImport = await fetch(
      `${base}/v1/manage/societies/${tenantId}/parkings/import`,
      {
        method: "POST",
        headers: { ...platformAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { kind: "open", slotNumber: `OP-${Date.now().toString().slice(-6)}` },
          ],
        }),
      },
    );
    expect(parkingImport.ok).toBe(true);
    const parkingImportBody = (await parkingImport.json()) as { created: number };
    expect(parkingImportBody.created).toBeGreaterThanOrEqual(1);

    const adminTeam = await fetch(`${base}/v1/admin/team`, { headers: auth });
    expect(adminTeam.ok).toBe(true);

    const adminInvite = await fetch(`${base}/v1/admin/invites`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: `7${String(Date.now()).slice(-9)}`,
        role: "committee",
      }),
    });
    expect(adminInvite.ok).toBe(true);
  });

  test("structure buildings wings flats as chairperson", async () => {
    const staff = await otpLogin("9999999999");
    const auth = { Authorization: `Bearer ${staff.tokens.accessToken}` };
    const me = await fetch(`${base}/v1/auth/me`, { headers: auth });
    const user = (await me.json()) as { tenantId: string };

    const buildings = await fetch(
      `${base}/v1/societies/${user.tenantId}/buildings`,
      { headers: auth },
    );
    expect(buildings.ok).toBe(true);
    const buildingList = (await buildings.json()) as { id: string }[];
    expect(buildingList.length).toBeGreaterThan(0);

    const wings = await fetch(
      `${base}/v1/buildings/${buildingList[0]!.id}/wings`,
      { headers: auth },
    );
    expect(wings.ok).toBe(true);
    const wingList = (await wings.json()) as { id: string }[];
    expect(wingList.length).toBeGreaterThan(0);

    const flats = await fetch(`${base}/v1/wings/${wingList[0]!.id}/flats`, {
      headers: auth,
    });
    expect(flats.ok).toBe(true);

    const newFlat = `C-${Date.now().toString().slice(-4)}`;
    const createFlat = await fetch(
      `${base}/v1/wings/${wingList[0]!.id}/flats`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ number: newFlat }),
      },
    );
    expect(createFlat.ok).toBe(true);
    const flatBody = (await createFlat.json()) as { id: string };

    const createBuilding = await fetch(
      `${base}/v1/societies/${user.tenantId}/buildings`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Tower-${Date.now().toString().slice(-4)}` }),
      },
    );
    expect(createBuilding.ok).toBe(true);
    const buildingBody = (await createBuilding.json()) as { id: string };

    const createWing = await fetch(
      `${base}/v1/buildings/${buildingBody.id}/wings`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `W-${Date.now().toString().slice(-3)}` }),
      },
    );
    expect(createWing.ok).toBe(true);
    const wingBody = (await createWing.json()) as { id: string };

    expect(
      (
        await fetch(`${base}/v1/flats/${flatBody.id}`, {
          method: "DELETE",
          headers: auth,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/wings/${wingBody.id}`, {
          method: "DELETE",
          headers: auth,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/buildings/${buildingBody.id}`, {
          method: "DELETE",
          headers: auth,
        })
      ).ok,
    ).toBe(true);
  });

  test("misc modules: visitors parking bookings assets vendors events", async () => {
    const resident = await otpLogin("8888888888");
    const staff = await otpLogin("9999999999");
    const rAuth = {
      Authorization: `Bearer ${resident.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const sAuth = {
      Authorization: `Bearer ${staff.tokens.accessToken}`,
      "Content-Type": "application/json",
    };

    const visitor = await fetch(`${base}/v1/visitors`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({
        visitorName: "Courier",
        purpose: "Delivery",
      }),
    });
    expect(visitor.ok).toBe(true);
    const visitorBody = (await visitor.json()) as { id: string };

    const visitors = await fetch(`${base}/v1/visitors`, {
      headers: { Authorization: rAuth.Authorization },
    });
    expect(visitors.ok).toBe(true);

    const delVisitor = await fetch(`${base}/v1/visitors/${visitorBody.id}`, {
      method: "DELETE",
      headers: { Authorization: rAuth.Authorization },
    });
    expect(delVisitor.ok).toBe(true);

    const parking = await fetch(`${base}/v1/parking`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ slotNumber: `P-${Date.now().toString().slice(-4)}` }),
    });
    expect(parking.ok).toBe(true);
    const parkingBody = (await parking.json()) as { id: string };
    expect(
      (
        await fetch(`${base}/v1/parking`, {
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/parking/${parkingBody.id}`, {
          method: "DELETE",
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);

    const start = new Date(Date.now() + 3600_000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    const end = new Date(Date.now() + 7200_000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    const booking = await fetch(`${base}/v1/bookings`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({
        facilityName: "Clubhouse",
        startAt: start,
        endAt: end,
      }),
    });
    expect(booking.ok).toBe(true);
    const bookingBody = (await booking.json()) as { id: string };
    expect(
      (
        await fetch(`${base}/v1/bookings`, {
          headers: { Authorization: rAuth.Authorization },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/bookings/${bookingBody.id}`, {
          method: "DELETE",
          headers: { Authorization: rAuth.Authorization },
        })
      ).ok,
    ).toBe(true);

    const asset = await fetch(`${base}/v1/assets`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ name: `Pump-${Date.now().toString().slice(-4)}` }),
    });
    expect(asset.ok).toBe(true);
    const assetBody = (await asset.json()) as { id: string };
    expect(
      (
        await fetch(`${base}/v1/assets`, {
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/assets/${assetBody.id}`, {
          method: "DELETE",
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);

    const vendor = await fetch(`${base}/v1/vendors`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ name: `Vendor-${Date.now().toString().slice(-4)}` }),
    });
    expect(vendor.ok).toBe(true);
    const vendorBody = (await vendor.json()) as { id: string };
    expect(
      (
        await fetch(`${base}/v1/vendors`, {
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/vendors/${vendorBody.id}`, {
          method: "DELETE",
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);

    const event = await fetch(`${base}/v1/events`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        title: `Fest-${Date.now().toString().slice(-4)}`,
        startAt: start,
      }),
    });
    expect(event.ok).toBe(true);
    const eventBody = (await event.json()) as { id: string };
    expect(
      (
        await fetch(`${base}/v1/events`, {
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/events/${eventBody.id}`, {
          method: "DELETE",
          headers: { Authorization: sAuth.Authorization },
        })
      ).ok,
    ).toBe(true);
  });

  test("offline payment, receipt, void bill, notice update, soft-delete complaint", async () => {
    const staff = await otpLogin("9999999999");
    const resident = await otpLogin("8888888888");
    const sAuth = {
      Authorization: `Bearer ${staff.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const rAuth = {
      Authorization: `Bearer ${resident.tokens.accessToken}`,
      "Content-Type": "application/json",
    };

    const flats = (await (
      await fetch(`${base}/v1/admin/flats`, {
        headers: { Authorization: sAuth.Authorization },
      })
    ).json()) as { id: string }[];

    const periodYm = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm, amountPaise: 10000, reason: "Monthly maintenance" }),
    });

    const bills = (await (
      await fetch(`${base}/v1/bills/mine`, {
        headers: { Authorization: rAuth.Authorization },
      })
    ).json()) as { id: string; status: string; periodYm: string }[];
    const bill = bills.find((b) => b.periodYm === periodYm && b.status !== "paid");
    expect(bill).toBeTruthy();

    const offline = await fetch(`${base}/v1/payments`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        flatId: flats[0]!.id,
        billId: bill!.id,
        amountPaise: 10000,
        method: "cash",
      }),
    });
    expect(offline.ok).toBe(true);
    const payment = (await offline.json()) as { id: string };

    const receipt = await fetch(`${base}/v1/payments/${payment.id}/receipt`, {
      headers: { Authorization: sAuth.Authorization },
    });
    expect(receipt.ok).toBe(true);

    const periodYm2 = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm: periodYm2, amountPaise: 20000, reason: "Monthly maintenance" }),
    });
    const bills2 = (await (
      await fetch(`${base}/v1/bills`, {
        headers: { Authorization: sAuth.Authorization },
      })
    ).json()) as { items: { id: string; periodYm: string; status: string }[] };
    const toVoid = bills2.items.find(
      (b) => b.periodYm === periodYm2 && b.status !== "void",
    );
    expect(toVoid).toBeTruthy();
    const voidRes = await fetch(`${base}/v1/bills/${toVoid!.id}`, {
      method: "DELETE",
      headers: sAuth,
      body: JSON.stringify({ reason: "duplicate" }),
    });
    expect(voidRes.ok).toBe(true);

    const notice = await fetch(`${base}/v1/notices`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        title: "Temp notice",
        body: "Body",
        audience: "all",
      }),
    });
    const noticeBody = (await notice.json()) as { id: string };
    const update = await fetch(`${base}/v1/notices/${noticeBody.id}`, {
      method: "PATCH",
      headers: sAuth,
      body: JSON.stringify({ title: "Updated notice" }),
    });
    expect(update.ok).toBe(true);
    await fetch(`${base}/v1/notices/${noticeBody.id}/publish`, {
      method: "POST",
      headers: { Authorization: sAuth.Authorization },
    });
    const unpublish = await fetch(
      `${base}/v1/notices/${noticeBody.id}/unpublish`,
      { method: "POST", headers: { Authorization: sAuth.Authorization } },
    );
    expect(unpublish.ok).toBe(true);

    const created = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({
        title: "To delete",
        type: "other",
        typeOtherText: "noise",
        description: "Will be soft-deleted",
      }),
    });
    const complaint = (await created.json()) as { id: string };
    const del = await fetch(`${base}/v1/complaints/${complaint.id}`, {
      method: "DELETE",
      headers: { Authorization: sAuth.Authorization },
    });
    expect(del.ok).toBe(true);
  });

  test("bills pay path, payments list/mine/webhook, notifications, media, auth extras", async () => {
    const staff = await otpLogin("9999999999");
    const resident = await otpLogin("8888888888");
    const platform = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const sAuth = {
      Authorization: `Bearer ${staff.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const rAuth = {
      Authorization: `Bearer ${resident.tokens.accessToken}`,
      "Content-Type": "application/json",
    };

    const periodYm = uniquePeriodYm();
    const generated = await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm, amountPaise: 15000, reason: "Monthly maintenance" }),
    });
    expect(generated.ok).toBe(true);
    expect(((await generated.json()) as { created: number }).created).toBeGreaterThan(0);

    const mine = (await (
      await fetch(`${base}/v1/bills/mine`, {
        headers: { Authorization: rAuth.Authorization },
      })
    ).json()) as { id: string; periodYm: string; status: string }[];
    const bill = mine.find((b) => b.periodYm === periodYm && b.status !== "paid");
    expect(bill).toBeTruthy();

    const billGet = await fetch(`${base}/v1/bills/${bill!.id}`, {
      headers: { Authorization: rAuth.Authorization },
    });
    expect(billGet.ok).toBe(true);

    const pay = await fetch(`${base}/v1/bills/${bill!.id}/pay`, {
      method: "POST",
      headers: rAuth,
    });
    expect(pay.ok).toBe(true);
    const paid = (await pay.json()) as {
      id: string;
      status: string;
    };
    expect(paid.status).toBe("success");

    const paymentsList = await fetch(`${base}/v1/payments?page=1&limit=20`, {
      headers: { Authorization: sAuth.Authorization },
    });
    expect(paymentsList.ok).toBe(true);

    const paymentsMine = await fetch(`${base}/v1/payments/mine`, {
      headers: { Authorization: rAuth.Authorization },
    });
    expect(paymentsMine.ok).toBe(true);

    // Seed a pending razorpay payment for webhook coverage
    const periodYm2 = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm: periodYm2, amountPaise: 18000, reason: "Monthly maintenance" }),
    });
    const mine2 = (await (
      await fetch(`${base}/v1/bills/mine`, {
        headers: { Authorization: rAuth.Authorization },
      })
    ).json()) as { id: string; periodYm: string; status: string }[];
    const bill2 = mine2.find((b) => b.periodYm === periodYm2 && b.status !== "paid");
    const mockPay = await fetch(`${base}/v1/payments/mock`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({ billId: bill2!.id }),
    });
    expect(mockPay.ok).toBe(true);
    const mockBody = (await mockPay.json()) as { id: string };
    const orderId = `order_dev_${mockBody.id.slice(0, 12)}`;

    const webhookMissing = await fetch(`${base}/v1/payments/razorpay/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(webhookMissing.status).toBe(400);

    const webhookOk = await fetch(`${base}/v1/payments/razorpay/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        paymentId: `pay_hook_${Date.now()}`,
        status: "success",
      }),
    });
    expect(webhookOk.ok).toBe(true);

    const webhookMissingOrder = await fetch(
      `${base}/v1/payments/razorpay/webhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order_missing_xyz" }),
      },
    );
    expect(webhookMissingOrder.status).toBe(404);

    const notifs = await fetch(`${base}/v1/notifications`, {
      headers: { Authorization: rAuth.Authorization },
    });
    expect(notifs.ok).toBe(true);
    const notificationList = (await notifs.json()) as { id: string }[];
    expect(notificationList.length).toBeGreaterThan(0);
    const mark = await fetch(
      `${base}/v1/notifications/${notificationList[0]!.id}/read`,
      { method: "POST", headers: { Authorization: rAuth.Authorization } },
    );
    expect(mark.ok).toBe(true);
    // Idempotent second mark
    expect(
      (
        await fetch(
          `${base}/v1/notifications/${notificationList[0]!.id}/read`,
          { method: "POST", headers: { Authorization: rAuth.Authorization } },
        )
      ).ok,
    ).toBe(true);

    const created = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({
        title: "With photo",
        type: "other",
        typeOtherText: "leak",
        description: "Attachment coverage",
      }),
    });
    const complaint = (await created.json()) as { id: string };
    const form = new FormData();
    form.append(
      "file",
      new File([Uint8Array.from([1, 2, 3, 4])], "leak.png", {
        type: "image/png",
      }),
    );
    const attach = await fetch(
      `${base}/v1/complaints/${complaint.id}/attachments`,
      {
        method: "POST",
        headers: { Authorization: rAuth.Authorization },
        body: form,
      },
    );
    expect(attach.ok).toBe(true);
    const withAtt = (await attach.json()) as {
      attachments: { id: string; url: string }[];
    };
    expect(withAtt.attachments.length).toBeGreaterThan(0);
    const media = await fetch(
      `${base}/v1/media/${withAtt.attachments[0]!.id}`,
      { headers: { Authorization: rAuth.Authorization } },
    );
    expect(media.ok).toBe(true);

    const staffList = await fetch(`${base}/v1/complaints?page=1&limit=5`, {
      headers: { Authorization: sAuth.Authorization },
    });
    expect(staffList.ok).toBe(true);

    const changePw = await fetch(`${base}/v1/auth/password/change`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platform.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "Test@1234",
        newPassword: "Test@1234",
      }),
    });
    expect(changePw.ok).toBe(true);

    const authProfile = await fetch(`${base}/v1/auth/profile`, {
      method: "PATCH",
      headers: rAuth,
      body: JSON.stringify({ emergencyContact: "8888888888" }),
    });
    expect(authProfile.ok).toBe(true);

    const auditLogs = await fetch(`${base}/v1/audit-logs`, {
      headers: { Authorization: sAuth.Authorization },
    });
    expect(auditLogs.ok).toBe(true);

    // Soft-delete a throwaway society (platform)
    const createSociety = await fetch(`${base}/v1/societies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platform.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Temp Delete ${Date.now()}`,
        city: "Pune",
      }),
    });
    expect(createSociety.ok).toBe(true);
    const society = (await createSociety.json()) as { id: string };
    const delSociety = await fetch(`${base}/v1/societies/${society.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${platform.tokens.accessToken}` },
    });
    expect(delSociety.ok).toBe(true);

    // Error mapping + invitation helper coverage
    const { toErrorBody, AppError } = await import("./lib/errors");
    expect(toErrorBody(new AppError(404, "x", "y")).status).toBe(404);
    const prevError = console.error;
    console.error = () => {};
    try {
      expect(toErrorBody(new Error("boom")).body.code).toBe("internal_error");
    } finally {
      console.error = prevError;
    }

    const invite = await fetch(`${base}/v1/invitations`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        email: `token.${Date.now()}@example.com`,
        role: "resident",
      }),
    });
    const invitation = (await invite.json()) as { id: string; devToken?: string };
    expect(invitation.devToken).toBeTruthy();
    const { findPendingInvitationByToken } = await import(
      "./modules/invitations/routes"
    );
    const pending = await findPendingInvitationByToken(invitation.devToken!);
    expect(pending.id).toBe(invitation.id);

    // Team add by phone (new user) + identity_required error
    const me = (await (
      await fetch(`${base}/v1/auth/me`, {
        headers: { Authorization: sAuth.Authorization },
      })
    ).json()) as { tenantId: string };
    const addPhone = await fetch(
      `${base}/v1/manage/societies/${me.tenantId}/team`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${platform.tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: `6${String(Date.now()).slice(-9)}`,
          name: "Phone Staff",
          role: "treasurer",
        }),
      },
    );
    expect(addPhone.ok).toBe(true);
    const reuseEmail = `reuse2.${Date.now()}@example.com`;
    await fetch(`${base}/v1/manage/societies/${me.tenantId}/team`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platform.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: reuseEmail,
        name: "First",
        role: "committee",
      }),
    });
    const updateName = await fetch(
      `${base}/v1/manage/societies/${me.tenantId}/team`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${platform.tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: reuseEmail,
          name: "Updated Name",
          role: "committee",
        }),
      },
    );
    expect(updateName.ok).toBe(true);

    const badTeam = await fetch(
      `${base}/v1/manage/societies/${me.tenantId}/team`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${platform.tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "No identity", role: "secretary" }),
      },
    );
    expect(badTeam.status).toBe(400);

    // Booking without explicit flatId — chairperson's linked flat resolves from JWT claims
    const bookingImplicitFlat = await fetch(`${base}/v1/bookings`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        facilityName: "Hall",
        startAt: "2030-01-01 10:00:00",
        endAt: "2030-01-01 11:00:00",
      }),
    });
    expect(bookingImplicitFlat.status).toBe(200);
    const bookingBody = (await bookingImplicitFlat.json()) as {
      id: string;
      facilityName: string;
      flatId: string;
      status: string;
    };
    expect(bookingBody).toMatchObject({
      facilityName: "Hall",
      flatId: expect.any(String),
      status: "confirmed",
    });
  });

  test("auth error paths, fresh profile insert, and tenant scope guard", async () => {
    // OTP expired/missing
    const badOtp = await fetch(`${base}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "7000000001", code: "000000" }),
    });
    expect(badOtp.status).toBe(400);

    await fetch(`${base}/v1/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "7000000002" }),
    });
    const wrongOtp = await fetch(`${base}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "7000000002", code: "000000" }),
    });
    expect(wrongOtp.status).toBe(400);

    await fetch(`${base}/v1/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "7000000003" }),
    });
    const notOnboarded = await fetch(`${base}/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "7000000003", code: "123456" }),
    });
    expect(notOnboarded.status).toBe(403);

    const badGoogle = await fetch(`${base}/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "not-dev-token" }),
    });
    expect(badGoogle.status).toBe(400);

    const googleUnknown = await fetch(`${base}/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "dev:7000000004" }),
    });
    expect(googleUnknown.status).toBe(403);

    const pinMissing = await fetch(`${base}/v1/auth/pin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "8888888888", pin: "1234" }),
    });
    // Resident may or may not have pin from earlier tests; either 400 or 401 is fine for coverage.
    expect([400, 401].includes(pinMissing.status)).toBe(true);

    const badPassword = await fetch(`${base}/v1/auth/password/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "superadmin@societyhub.local",
        password: "WrongPass1!",
      }),
    });
    expect(badPassword.status).toBe(401);

    const unknownEmail = await fetch(`${base}/v1/auth/password/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "Whatever1!",
      }),
    });
    expect(unknownEmail.status).toBe(401);

    const resetBad = await fetch(`${base}/v1/auth/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "superadmin@societyhub.local",
        code: "000000",
        newPassword: "Test@1234",
      }),
    });
    expect(resetBad.status).toBe(400);

    const platform = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const changeBad = await fetch(`${base}/v1/auth/password/change`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platform.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "NotCurrent1!",
        newPassword: "Test@1234",
      }),
    });
    expect(changeBad.status).toBe(401);

    const badRefresh = await fetch(`${base}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "not.a.valid.jwt.token" }),
    });
    expect(badRefresh.status).toBe(401);

    // Revoked refresh token path
    const pinUser = await otpLogin("9999999999");
    await fetch(`${base}/v1/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pinUser.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: pinUser.tokens.refreshToken }),
    });
    const revokedRefresh = await fetch(`${base}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: pinUser.tokens.refreshToken }),
    });
    expect(revokedRefresh.status).toBe(401);

    const pinNotSet = await fetch(`${base}/v1/auth/pin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "8888888888", pin: "9999" }),
    });
    expect([400, 401].includes(pinNotSet.status)).toBe(true);

    const resident = await otpLogin("8888888888");
    const missingSociety = await fetch(`${base}/v1/auth/select-tenant`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resident.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "00000000-0000-0000-0000-000000000099",
      }),
    });
    expect(missingSociety.status).toBe(404);

    // Create a second society, then resident (not a member) tries select-tenant
    const otherSociety = await fetch(`${base}/v1/societies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${platform.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `Other Soc ${Date.now()}`,
        city: "Mumbai",
      }),
    });
    expect(otherSociety.ok).toBe(true);
    const other = (await otherSociety.json()) as { id: string };
    const notMember = await fetch(`${base}/v1/auth/select-tenant`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resident.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenantId: other.id }),
    });
    expect(notMember.status).toBe(403);

    // Tenant scope: staff cannot list buildings of another society
    const staff = await otpLogin("9999999999");
    const crossTenant = await fetch(
      `${base}/v1/societies/${other.id}/buildings`,
      { headers: { Authorization: `Bearer ${staff.tokens.accessToken}` } },
    );
    expect(crossTenant.status).toBe(403);

    // Fresh resident → first profile PATCH hits insert path
    const flats = (await (
      await fetch(`${base}/v1/admin/flats`, {
        headers: { Authorization: `Bearer ${staff.tokens.accessToken}` },
      })
    ).json()) as { id: string }[];
    const phone = `5${String(Date.now()).slice(-9)}`;
    await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staff.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Profile Newbie",
        phone,
        flatId: flats[0]!.id,
        email: `newbie.${Date.now()}@example.com`,
      }),
    });
    const newbie = await otpLogin(phone);
    const firstProfile = await fetch(`${base}/v1/profile`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${newbie.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vehicleNumber: "MH14ZZ9999" }),
    });
    expect(firstProfile.ok).toBe(true);

    // Media via ?access_token=
    const complaint = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newbie.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Media token",
        type: "other",
        typeOtherText: "x",
        description: "access_token query",
      }),
    });
    const c = (await complaint.json()) as { id: string };
    const form = new FormData();
    form.append(
      "file",
      new File([Uint8Array.from([9, 8, 7])], "a.jpg", { type: "image/jpeg" }),
    );
    const attached = await fetch(`${base}/v1/complaints/${c.id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${newbie.tokens.accessToken}` },
      body: form,
    });
    const withAtt = (await attached.json()) as {
      attachments: { id: string }[];
    };
    const mediaQs = await fetch(
      `${base}/v1/media/${withAtt.attachments[0]!.id}?access_token=${newbie.tokens.accessToken}`,
    );
    expect(mediaQs.ok).toBe(true);

    // Complaint without explicit flatId — chairperson's linked flat resolved from JWT claims
    const staffComplaint = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staff.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "No flat",
        type: "plumbing",
        description: "missing flatId",
      }),
    });
    expect(staffComplaint.status).toBe(200);
    const staffComplaintBody = (await staffComplaint.json()) as {
      id: string;
      title: string;
      type: string;
      flatId: string;
    };
    expect(staffComplaintBody).toMatchObject({
      title: "No flat",
      type: "plumbing",
      flatId: expect.any(String),
    });

    // Onboard existing user (email/phone reuse) for admin update branch
    const existingPhone = phone;
    const reOnboard = await fetch(`${base}/v1/admin/residents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${staff.tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Profile Newbie Updated",
        phone: existingPhone,
        flatId: flats[0]!.id,
        email: `newbie.${Date.now()}@example.com`,
      }),
    });
    expect(reOnboard.ok).toBe(true);
  });

  test("thorough RBAC, remaining routes, and error paths", async () => {
    const staff = await otpLogin("9999999999");
    const resident = await otpLogin("8888888888");
    const platform = await passwordLogin(
      "superadmin@societyhub.local",
      "Test@1234",
    );
    const sAuth = {
      Authorization: `Bearer ${staff.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const rAuth = {
      Authorization: `Bearer ${resident.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const pAuth = {
      Authorization: `Bearer ${platform.tokens.accessToken}`,
      "Content-Type": "application/json",
    };

    // 401 without bearer
    expect((await fetch(`${base}/v1/auth/me`)).status).toBe(401);
    expect((await fetch(`${base}/v1/complaints`)).status).toBe(401);
    expect((await fetch(`${base}/v1/admin/flats`)).status).toBe(401);
    expect((await fetch(`${base}/v1/bills/generate`, { method: "POST" })).status).toBe(401);

    // 403 resident on staff-only
    expect(
      (
        await fetch(`${base}/v1/bills/generate`, {
          method: "POST",
          headers: rAuth,
          body: JSON.stringify({
            periodYm: uniquePeriodYm(),
            amountPaise: 1000,
            reason: "Monthly maintenance",
          }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/v1/payments?page=1`, {
          headers: { Authorization: rAuth.Authorization },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/v1/audit`, {
          headers: { Authorization: rAuth.Authorization },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/v1/admin/structure`, {
          headers: { Authorization: rAuth.Authorization },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/v1/societies`, {
          method: "POST",
          headers: rAuth,
          body: JSON.stringify({ name: "Nope" }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/v1/manage/societies/${crypto.randomUUID()}/team`, {
          method: "POST",
          headers: rAuth,
          body: JSON.stringify({ email: "x@y.com", role: "secretary" }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${base}/v1/manage/societies/${crypto.randomUUID()}/team`, {
          headers: { Authorization: rAuth.Authorization },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(
          `${base}/v1/manage/societies/${crypto.randomUUID()}/team/${crypto.randomUUID()}`,
          {
            method: "DELETE",
            headers: { Authorization: rAuth.Authorization },
          },
        )
      ).status,
    ).toBe(403);

    // Societies list as platform + get own society as staff
    const societies = await fetch(`${base}/v1/societies`, {
      headers: { Authorization: pAuth.Authorization },
    });
    expect(societies.ok).toBe(true);
    const societyList = (await societies.json()) as { id: string }[];
    expect(societyList.length).toBeGreaterThan(0);
    const me = (await (
      await fetch(`${base}/v1/auth/me`, {
        headers: { Authorization: sAuth.Authorization },
      })
    ).json()) as { tenantId: string };
    const societyGet = await fetch(`${base}/v1/societies/${me.tenantId}`, {
      headers: { Authorization: sAuth.Authorization },
    });
    expect(societyGet.ok).toBe(true);
    expect(
      (
        await fetch(`${base}/v1/manage/societies/${me.tenantId}/team`, {
          headers: { Authorization: sAuth.Authorization },
        })
      ).status,
    ).toBe(403);

    // Complaint comments GET + invalid attachment type
    const created = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({
        title: "Comment list",
        type: "other",
        typeOtherText: "test",
        description: "For GET comments coverage",
      }),
    });
    const complaint = (await created.json()) as { id: string };
    await fetch(`${base}/v1/complaints/${complaint.id}/comments`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({ body: "First note" }),
    });
    const comments = await fetch(
      `${base}/v1/complaints/${complaint.id}/comments`,
      { headers: { Authorization: rAuth.Authorization } },
    );
    expect(comments.ok).toBe(true);
    const commentList = (await comments.json()) as { body: string }[];
    expect(commentList.some((c) => c.body === "First note")).toBe(true);

    const badFile = new FormData();
    badFile.append(
      "file",
      new File([Uint8Array.from([1])], "x.txt", { type: "text/plain" }),
    );
    const badAttach = await fetch(
      `${base}/v1/complaints/${complaint.id}/attachments`,
      {
        method: "POST",
        headers: { Authorization: rAuth.Authorization },
        body: badFile,
      },
    );
    expect(badAttach.status).toBe(400);

    const missingFile = new FormData();
    const noFile = await fetch(
      `${base}/v1/complaints/${complaint.id}/attachments`,
      {
        method: "POST",
        headers: { Authorization: rAuth.Authorization },
        body: missingFile,
      },
    );
    expect(noFile.status).toBe(400);

    // Notice soft-delete
    const notice = await fetch(`${base}/v1/notices`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        title: "Delete me",
        body: "Temporary",
        audience: "all",
      }),
    });
    const noticeBody = (await notice.json()) as { id: string };
    const delNotice = await fetch(`${base}/v1/notices/${noticeBody.id}`, {
      method: "DELETE",
      headers: { Authorization: sAuth.Authorization },
    });
    expect(delNotice.ok).toBe(true);

    // Already-paid bill path
    const periodYm = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm, amountPaise: 7777, reason: "Monthly maintenance" }),
    });
    const mine = (await (
      await fetch(`${base}/v1/bills/mine`, {
        headers: { Authorization: rAuth.Authorization },
      })
    ).json()) as { id: string; periodYm: string; status: string }[];
    const unpaid = mine.find((b) => b.periodYm === periodYm && b.status !== "paid");
    expect(unpaid).toBeTruthy();
    const firstPay = await fetch(`${base}/v1/bills/${unpaid!.id}/pay`, {
      method: "POST",
      headers: rAuth,
    });
    expect(firstPay.ok).toBe(true);
    const secondPay = await fetch(`${base}/v1/bills/${unpaid!.id}/pay`, {
      method: "POST",
      headers: rAuth,
    });
    expect(secondPay.status).toBe(400);

    // Mock pay missing billId
    const mockBad = await fetch(`${base}/v1/payments/mock`, {
      method: "POST",
      headers: rAuth,
      body: JSON.stringify({}),
    });
    expect(mockBad.status).toBe(400);

    // Receipt not found
    const missingReceipt = await fetch(
      `${base}/v1/payments/${crypto.randomUUID()}/receipt`,
      { headers: { Authorization: sAuth.Authorization } },
    );
    expect(missingReceipt.status).toBe(404);

    // Media not found
    const missingMedia = await fetch(
      `${base}/v1/media/${crypto.randomUUID()}`,
      { headers: { Authorization: rAuth.Authorization } },
    );
    expect(missingMedia.status).toBe(404);

    // Invitation identity required + revoke unknown
    const inviteBad = await fetch(`${base}/v1/invitations`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ role: "resident" }),
    });
    expect(inviteBad.status).toBe(400);
    const revokeMissing = await fetch(
      `${base}/v1/invitations/${crypto.randomUUID()}/revoke`,
      { method: "POST", headers: { Authorization: sAuth.Authorization } },
    );
    expect(revokeMissing.status).toBe(404);

    // Resident cannot open another resident's complaint (create as staff for other flat then try)
    const otherComplaint = await fetch(`${base}/v1/complaints`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({
        title: "Staff raised",
        type: "security",
        description: "Gate issue",
        flatId: (
          await (
            await fetch(`${base}/v1/admin/flats`, {
              headers: { Authorization: sAuth.Authorization },
            })
          ).json() as { id: string }[]
        )[0]!.id,
      }),
    });
    expect(otherComplaint.ok).toBe(true);
    const otherId = ((await otherComplaint.json()) as { id: string }).id;
    // Resident may still see if they raised it — staff raised so resident GET should 404
    const peek = await fetch(`${base}/v1/complaints/${otherId}`, {
      headers: { Authorization: rAuth.Authorization },
    });
    expect(peek.status).toBe(404);

    // Void with corrected flag
    const periodVoid = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm: periodVoid, amountPaise: 3333, reason: "Monthly maintenance" }),
    });
    const bills = (await (
      await fetch(`${base}/v1/bills?page=1&limit=50`, {
        headers: { Authorization: sAuth.Authorization },
      })
    ).json()) as { items: { id: string; periodYm: string }[] };
    const toCorrect = bills.items.find((b) => b.periodYm === periodVoid);
    expect(toCorrect).toBeTruthy();
    const corrected = await fetch(`${base}/v1/bills/${toCorrect!.id}`, {
      method: "DELETE",
      headers: sAuth,
      body: JSON.stringify({ corrected: true, reason: "typo" }),
    });
    expect(corrected.ok).toBe(true);

    // OpenAPI docs surface is reachable
    const docs = await fetch(`${base}/docs`);
    expect(docs.ok).toBe(true);
  });
});
