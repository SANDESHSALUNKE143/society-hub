import { afterEach, describe, expect, test } from "bun:test";
import { ApiClientError, createSocietyHubClient } from "./index";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sdk client", () => {
  test("requestOtp posts phone without auth", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonOk({ ok: true, devCode: "123456" });
    }) as typeof fetch;

    const client = createSocietyHubClient({ baseUrl: "http://api.test" });
    const res = await client.requestOtp("8888888888");
    expect(res.devCode).toBe("123456");
    expect(calls[0]?.url).toBe("http://api.test/v1/auth/otp/request");
  });

  test("verifyOtp loginPin loginGoogle loginPassword", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({
        user: { id: "1" },
        tokens: { accessToken: "a", refreshToken: "r", expiresIn: 900 },
      });
    }) as typeof fetch;
    const client = createSocietyHubClient({ baseUrl: "http://api.test" });
    await client.verifyOtp("8888888888", "123456");
    await client.loginPin("8888888888", "1234");
    await client.loginGoogle("dev:8888888888");
    await client.loginPassword("a@b.com", "Test@1234");
    expect(paths).toEqual([
      "http://api.test/v1/auth/otp/verify",
      "http://api.test/v1/auth/pin/login",
      "http://api.test/v1/auth/google",
      "http://api.test/v1/auth/password/login",
    ]);
  });

  test("authenticated helpers", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url, init) => {
      paths.push(String(url));
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer tok");
      if (String(url).endsWith("/me")) {
        return jsonOk({
          id: "1",
          phone: null,
          email: "a@b.com",
          name: "A",
          username: null,
          role: "admin",
          tenantId: "t",
          flatId: null,
          flatNumber: null,
          hasPin: false,
        });
      }
      return jsonOk({ ok: true });
    }) as typeof fetch;

    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
      getRefreshToken: () => "ref",
    });
    await client.me();
    await client.setPin("1234");
    await client.changePassword("oldpass12", "newpass12");
    await client.logout("ref");
    await client.listFlats();
    await client.onboardResident({
      name: "R",
      phone: "7777777777",
      flatId: "66666666-6666-6666-6666-666666666666",
      email: "r@e.com",
    });
    await client.listComplaints(1, 10);
    await client.getComplaint("c1");
    await client.createComplaint({
      title: "Leak",
      type: "plumbing",
      description: "drip drip drip",
    });
    await client.updateComplaintStatus("c1", "resolved", {
      note: "Fixed",
    });
    expect(paths.length).toBeGreaterThan(8);
  });

  test("uploadAttachment uses FormData", async () => {
    globalThis.fetch = (async (_url, init) => {
      expect(init?.body).toBeInstanceOf(FormData);
      return jsonOk({ id: "c1", attachments: [] });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });
    const file = new File(["x"], "a.png", { type: "image/png" });
    await client.uploadAttachment("c1", file);
  });

  test("refresh helper and onTokens", async () => {
    let saved: string | null = null;
    globalThis.fetch = (async (url) => {
      if (String(url).includes("/refresh")) {
        return jsonOk({
          accessToken: "new-a",
          refreshToken: "new-r",
          expiresIn: 900,
        });
      }
      return jsonOk({ ok: true });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getRefreshToken: () => "old-r",
      onTokens: (t) => {
        saved = t.accessToken;
      },
    });
    const tokens = await client.refresh("old-r");
    expect(tokens.accessToken).toBe("new-a");
    expect(saved).toBeNull();
  });

  test("auto refresh on 401 then retries", async () => {
    let n = 0;
    globalThis.fetch = (async (url, init) => {
      if (String(url).includes("/refresh")) {
        return jsonOk({
          accessToken: "new-a",
          refreshToken: "new-r",
          expiresIn: 900,
        });
      }
      n += 1;
      if (n === 1) {
        return new Response(JSON.stringify({ code: "unauthorized", message: "x" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer new-a");
      return jsonOk({
        id: "1",
        phone: null,
        email: "a@b.com",
        name: "A",
        username: null,
        role: "admin",
        tenantId: "t",
        flatId: null,
        flatNumber: null,
        hasPin: false,
      });
    }) as typeof fetch;

    let access = "old-a";
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => access,
      getRefreshToken: () => "ref",
      onTokens: (t) => {
        access = t.accessToken;
      },
    });
    const me = await client.me();
    expect(me.email).toBe("a@b.com");
  });

  test("throws ApiClientError on failure", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: "unauthorized", message: "Nope" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const client = createSocietyHubClient({ baseUrl: "http://api.test" });
    try {
      await client.me();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).status).toBe(401);
    }
  });

  test("forgotPassword and resetPassword helpers", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({ ok: true, devCode: "123456" });
    }) as typeof fetch;
    const client = createSocietyHubClient({ baseUrl: "http://api.test" });
    await client.forgotPassword("a@b.com");
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({ ok: true });
    }) as typeof fetch;
    await client.resetPassword("a@b.com", "123456", "Test@1234");
    expect(paths[0]).toContain("/forgot");
    expect(paths[1]).toContain("/reset");
  });

  test("membership, tenant, and profile helpers", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({ ok: true });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });
    await client.listMemberships();
    await client.selectTenant("11111111-1111-1111-1111-111111111111");
    await client.updateProfile({ vehicleNumber: "MH12AB1234" });
    expect(paths).toEqual([
      "http://api.test/v1/auth/memberships",
      "http://api.test/v1/auth/select-tenant",
      // Profile edits go to the canonical /v1/profile route, which also
      // accepts the display name and communication preferences.
      "http://api.test/v1/profile",
    ]);
  });

  test("society, building, wing, and flat helpers", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({ ok: true });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });
    await client.listSocieties();
    await client.createSociety({ name: "Keshav Heights" });
    await client.getSociety("s1");
    await client.addSocietyTeamMember("s1", {
      email: "ops@societyhub.local",
      role: "secretary",
    });
    await client.listBuildings("s1");
    await client.createBuilding("s1", "Tower A");
    await client.listWings("b1");
    await client.createWing("b1", "A");
    await client.listFlatsForWing("w1");
    await client.createFlat("w1", "101");
    expect(paths.length).toBe(10);
    expect(paths.some((p) => p.includes("/v1/manage/societies/s1/team"))).toBe(true);
  });

  test("invitation, bill, and payment helpers", async () => {
    globalThis.fetch = (async () => jsonOk({ ok: true })) as unknown as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });
    await client.listInvitations();
    await client.createInvitation({ email: "a@b.com", role: "resident" });
    await client.revokeInvitation("inv1");
    await client.listBills(1, 20);
    await client.myBills();
    await client.generateBills({ periodYm: "2026-07", amountPaise: 500000 });
    await client.getBill("bill1");
    await client.listPayments(1, 20);
    await client.myPayments();
    await client.recordPayment({ flatId: "f1", amountPaise: 1000, method: "cash" });
    await client.payBillMock("bill1");
    expect(true).toBe(true);
  });

  test("notice, notification, dashboard, and audit helpers", async () => {
    globalThis.fetch = (async () => jsonOk({ ok: true })) as unknown as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });
    await client.listNotices();
    await client.createNotice({ title: "Water cut", body: "10am", audience: "all" });
    await client.updateNotice("n1", { title: "Updated" });
    await client.publishNotice("n1");
    await client.unpublishNotice("n1");
    await client.listNotifications();
    await client.markNotificationRead("notif1");
    await client.getDashboardStats();
    await client.listAuditLogs();
    await client.listAuditLogs("bill");
    await client.listTeam();
    expect(true).toBe(true);
  });

  test("future module helpers: visitors, parking, bookings, assets, vendors, events", async () => {
    globalThis.fetch = (async () => jsonOk({ ok: true })) as unknown as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });
    await client.listVisitors();
    await client.createVisitor({ visitorName: "Ravi" });
    await client.listParkingSlots();
    await client.createParkingSlot({ slotNumber: "P-1" });
    await client.listBookings();
    await client.createBooking({
      facilityName: "Clubhouse",
      startAt: "2026-08-01T10:00:00.000Z",
      endAt: "2026-08-01T12:00:00.000Z",
    });
    await client.listAssets();
    await client.createAsset({ name: "Generator" });
    await client.listVendors();
    await client.createVendor({ name: "ABC Plumbers" });
    await client.listEvents();
    await client.createEvent({ title: "Ganesh Utsav" });
    expect(true).toBe(true);
  });

  test("resident directory helpers build server-side query strings", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({ items: [], page: 1, limit: 20, total: 0 });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });

    await client.listResidents();
    await client.listResidents({
      page: 2,
      limit: 50,
      search: "rohan vichare",
      residentType: "tenant",
      status: "active",
      verificationStatus: "pending",
      sort: "flat",
      order: "desc",
    });
    // Empty and undefined filters must not appear in the query string at all.
    await client.listResidents({ search: "", buildingId: undefined, page: 1 });
    await client.listFlatsWithOccupancy({ occupancy: "vacant" });
    await client.listInvitations({ status: "pending", search: "a@b.com" });

    expect(paths[0]).toBe("http://api.test/v1/admin/residents");
    expect(paths[1]).toContain("page=2");
    expect(paths[1]).toContain("limit=50");
    expect(paths[1]).toContain("search=rohan+vichare");
    expect(paths[1]).toContain("residentType=tenant");
    expect(paths[1]).toContain("verificationStatus=pending");
    expect(paths[1]).toContain("sort=flat");
    expect(paths[1]).toContain("order=desc");
    expect(paths[2]).toBe("http://api.test/v1/admin/residents?page=1");
    expect(paths[3]).toBe("http://api.test/v1/admin/occupancy/flats?occupancy=vacant");
    expect(paths[4]).toContain("/v1/invitations?status=pending");
  });

  test("resident lifecycle helpers hit the documented routes", async () => {
    const calls: Array<{ path: string; method: string }> = [];
    globalThis.fetch = (async (url, init) => {
      calls.push({ path: String(url), method: (init as RequestInit)?.method ?? "GET" });
      return jsonOk({ ok: true });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });

    await client.getResident("r1");
    await client.updateResident("r1", { residentType: "owner" });
    await client.verifyResident("r1");
    await client.rejectResident("r1", "Blurry document");
    await client.suspendResident("r1", "Dues unpaid");
    await client.suspendResident("r1");
    await client.reactivateResident("r1");
    await client.moveOutResident("r1", { reason: "Relocated" });
    await client.moveOutResident("r1");
    await client.listResidentActivity("r1");
    await client.onboardResident({
      name: "Rohan",
      phone: "9800000000",
      flatId: "f1",
      email: "rohan@example.com",
      residentType: "owner",
    });

    expect(calls.map((c) => c.path)).toEqual([
      "http://api.test/v1/admin/residents/r1",
      "http://api.test/v1/admin/residents/r1",
      "http://api.test/v1/admin/residents/r1/verify",
      "http://api.test/v1/admin/residents/r1/reject",
      "http://api.test/v1/admin/residents/r1/suspend",
      "http://api.test/v1/admin/residents/r1/suspend",
      "http://api.test/v1/admin/residents/r1/reactivate",
      "http://api.test/v1/admin/residents/r1/move-out",
      "http://api.test/v1/admin/residents/r1/move-out",
      "http://api.test/v1/admin/residents/r1/activity",
      "http://api.test/v1/admin/residents",
    ]);
    expect(calls[1]!.method).toBe("PATCH");
    expect(calls[2]!.method).toBe("POST");
  });

  test("family, document, flat and team helpers", async () => {
    const paths: string[] = [];
    globalThis.fetch = (async (url) => {
      paths.push(String(url));
      return jsonOk({ ok: true });
    }) as typeof fetch;
    const client = createSocietyHubClient({
      baseUrl: "http://api.test",
      getAccessToken: () => "tok",
    });

    await client.listFamilyMembers("r1");
    await client.addFamilyMember("r1", { name: "Sayali", relationship: "spouse" });
    await client.removeFamilyMember("r1", "f9");
    await client.listResidentDocuments("r1");
    await client.uploadResidentDocument(
      "r1",
      new File(["x"], "id.png", { type: "image/png" }),
      { docType: "identity", documentNumber: "XXXX1234", expiresAt: "2030-01-01" },
    );
    await client.uploadMyDocument(new File(["y"], "lease.pdf", { type: "application/pdf" }), {
      docType: "tenant_agreement",
    });
    await client.verifyDocument("d1");
    await client.rejectDocument("d1", "Unreadable");
    await client.deleteDocument("d1");
    await client.getFlatDetail("fl1");
    await client.listFlatResidents("fl1");
    await client.listFlatHistory("fl1");
    await client.getOccupancyStats();
    await client.addTeamMember({ email: "ops@x.test", role: "secretary" });
    await client.changeTeamRole("u1", "secretary", "treasurer");
    await client.removeTeamRole("u1", "treasurer");
    await client.resendInvitation("i1");
    await client.getInvitation("tok-123");
    await client.acceptInvitation({ token: "tok-123", name: "Rohan" });
    await client.previewResidentImport({
      rows: [{ name: "A", phone: "9800000001", flatNumber: "101" }],
    });

    expect(paths).toContain("http://api.test/v1/admin/residents/r1/family/f9");
    expect(paths).toContain("http://api.test/v1/admin/residents/r1/documents");
    expect(paths).toContain("http://api.test/v1/profile/documents");
    expect(paths).toContain("http://api.test/v1/admin/resident-documents/d1/verify");
    expect(paths).toContain("http://api.test/v1/admin/resident-documents/d1");
    expect(paths).toContain("http://api.test/v1/admin/flats/fl1/history");
    expect(paths).toContain("http://api.test/v1/admin/occupancy/stats");
    expect(paths).toContain("http://api.test/v1/team/members/u1/role");
    expect(paths).toContain("http://api.test/v1/team/members/u1/roles/treasurer");
    expect(paths).toContain("http://api.test/v1/invitations/i1/resend");
    expect(paths).toContain("http://api.test/v1/invites/tok-123");
    expect(paths).toContain("http://api.test/v1/invites/accept");
    expect(paths).toContain("http://api.test/v1/admin/residents/import/preview");
  });

  test("handles non-json error body", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const client = createSocietyHubClient({ baseUrl: "http://api.test" });
    try {
      await client.me();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).body.code).toBe("http_error");
    }
  });
});
