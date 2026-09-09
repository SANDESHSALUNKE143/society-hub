import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "./app";

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
      const body = (await ok.json()) as { user: { email: string | null } };
      expect(body.user.email).toBe("admin@keshav.local");

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
  });

  test("CSV resident import upserts on re-upload", async () => {
    const admin = await otpLogin("9999999999");
    const auth = {
      Authorization: `Bearer ${admin.tokens.accessToken}`,
      "Content-Type": "application/json",
    };
    const flats = (await (
      await fetch(`${base}/v1/admin/flats`, { headers: auth })
    ).json()) as {
      id: string;
      number: string;
      wingName: string | null;
      floor: number | null;
      parkingSlot: string | null;
    }[];
    expect(flats.length).toBeGreaterThan(0);
    const flat = flats[0]!;
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
            isOwner: false,
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
            isOwner: false,
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
      body: JSON.stringify({ periodYm, amountPaise: 500000 }),
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
    const notices = (await list.json()) as { id: string }[];
    expect(notices.some((n) => n.id === notice.id)).toBe(true);

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
      comments: { body: string }[];
    };
    expect(withComment.comments.some((c) => c.body === "Technician dispatched")).toBe(
      true,
    );
  });

  test("chairperson can raise complaint by selecting a flat", async () => {
    const session = await otpLogin("9999999999");
    expect(session.user.role).toBe("chairperson");
    const flatsRes = await fetch(`${base}/v1/admin/flats`, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    });
    expect(flatsRes.ok).toBe(true);
    const flats = (await flatsRes.json()) as { id: string; number: string }[];
    expect(flats.length).toBeGreaterThan(0);

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
        flatId: flats[0]!.id,
      }),
    });
    expect(create.ok).toBe(true);
    const complaint = (await create.json()) as {
      id: string;
      flatId: string;
      flatNumber: string;
    };
    expect(complaint.flatId).toBe(flats[0]!.id);
    expect(complaint.flatNumber).toBe(flats[0]!.number);
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

    const otp = await otpLogin(phone);
    expect(otp.user.id).toBe(body.userId);
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

    const periodYm = uniquePeriodYm();
    await fetch(`${base}/v1/bills/generate`, {
      method: "POST",
      headers: sAuth,
      body: JSON.stringify({ periodYm, amountPaise: 15000 }),
    });
    const bills = (await (
      await fetch(`${base}/v1/bills/mine`, { headers: rAuth })
    ).json()) as { id: string; periodYm: string }[];
    const bill = bills.find((b) => b.periodYm === periodYm);
    expect(bill).toBeTruthy();

    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
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

    const movedPhone = `5${String(Date.now()).slice(-9)}`;
    const patchedRes = await fetch(`${base}/v1/team/${added.userId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ phone: movedPhone, name: "Renamed Staff" }),
    });
    expect(patchedRes.ok).toBe(true);
    const patched = (await patchedRes.json()) as { phone: string; name: string };
    expect(patched.phone).toBe(movedPhone);
    expect(patched.name).toBe("Renamed Staff");
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
      body: JSON.stringify({ periodYm, amountPaise: 10000 }),
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
      body: JSON.stringify({ periodYm: periodYm2, amountPaise: 20000 }),
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
      body: JSON.stringify({ periodYm, amountPaise: 15000 }),
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
      body: JSON.stringify({ periodYm: periodYm2, amountPaise: 18000 }),
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
      body: JSON.stringify({ periodYm, amountPaise: 7777 }),
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
      body: JSON.stringify({ periodYm: periodVoid, amountPaise: 3333 }),
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
