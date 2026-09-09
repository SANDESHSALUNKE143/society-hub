import { describe, expect, test } from "bun:test";
import {
  changePasswordSchema,
  createAssetSchema,
  createBookingSchema,
  createBuildingSchema,
  createComplaintCommentSchema,
  createComplaintSchema,
  createEventSchema,
  createFlatSchema,
  createInvitationSchema,
  createNoticeSchema,
  createParkingSlotSchema,
  createSocietySchema,
  createVendorSchema,
  createVisitorSchema,
  createWingSchema,
  forgotPasswordSchema,
  generateBillsSchema,
  googleAuthSchema,
  listQuerySchema,
  loginPasswordSchema,
  loginPinSchema,
  onboardResidentSchema,
  addSocietyTeamMemberSchema,
  updateSocietyTeamMemberSchema,
  residentImportSchema,
  razorpayWebhookSchema,
  recordPaymentSchema,
  updatePaymentAccountSchema,
  refreshSchema,
  requestOtpSchema,
  resetPasswordSchema,
  selectTenantSchema,
  setPinSchema,
  updateComplaintStatusSchema,
  updateNoticeSchema,
  updateResidentProfileSchema,
  verifyOtpSchema,
  voidBillSchema,
} from "./index";

describe("validation schemas", () => {
  test("requestOtpSchema accepts valid phone", () => {
    expect(requestOtpSchema.parse({ phone: "8888888888" }).phone).toBe(
      "8888888888",
    );
  });

  test("requestOtpSchema rejects short phone", () => {
    expect(() => requestOtpSchema.parse({ phone: "123" })).toThrow();
  });

  test("verifyOtpSchema", () => {
    expect(
      verifyOtpSchema.parse({ phone: "8888888888", code: "123456" }).code,
    ).toBe("123456");
  });

  test("setPinSchema and loginPinSchema", () => {
    expect(setPinSchema.parse({ pin: "1234" }).pin).toBe("1234");
    expect(() => setPinSchema.parse({ pin: "12" })).toThrow();
    expect(
      loginPinSchema.parse({ phone: "8888888888", pin: "123456" }).pin,
    ).toBe("123456");
  });

  test("loginPasswordSchema", () => {
    expect(
      loginPasswordSchema.parse({
        email: "a@b.com",
        password: "Test@1234",
      }).email,
    ).toBe("a@b.com");
    expect(() =>
      loginPasswordSchema.parse({ email: "bad", password: "short" }),
    ).toThrow();
  });

  test("forgot/reset/change password schemas", () => {
    expect(forgotPasswordSchema.parse({ email: "a@b.com" }).email).toBe(
      "a@b.com",
    );
    expect(
      resetPasswordSchema.parse({
        email: "a@b.com",
        code: "123456",
        newPassword: "Test@1234",
      }).code,
    ).toBe("123456");
    expect(
      changePasswordSchema.parse({
        currentPassword: "Test@1234",
        newPassword: "NewPass@12",
      }).newPassword,
    ).toBe("NewPass@12");
  });

  test("refresh and google schemas", () => {
    expect(refreshSchema.parse({ refreshToken: "x".repeat(20) }).refreshToken)
      .toHaveLength(20);
    expect(googleAuthSchema.parse({ idToken: "dev:8888888888" }).idToken).toBe(
      "dev:8888888888",
    );
  });

  test("onboardResidentSchema", () => {
    const flatId = "66666666-6666-6666-6666-666666666666";
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        email: "ravi@example.com",
      }).email,
    ).toBe("ravi@example.com");
  });

  test("createComplaintSchema and status update", () => {
    expect(
      createComplaintSchema.parse({
        title: "Leak",
        type: "plumbing",
        description: "Kitchen sink drip",
      }).type,
    ).toBe("plumbing");
    expect(
      createComplaintSchema.parse({
        title: "Leak",
        type: "plumbing",
        description: "Kitchen sink drip",
        flatId: "66666666-6666-6666-6666-666666666666",
      }).flatId,
    ).toBe("66666666-6666-6666-6666-666666666666");
    expect(
      updateComplaintStatusSchema.parse({
        status: "resolved",
        note: "Fixed the pipe joint",
      }).status,
    ).toBe("resolved");
    expect(() =>
      updateComplaintStatusSchema.parse({ status: "closed" }),
    ).toThrow();
  });

  test("listQuerySchema coerces page/limit", () => {
    expect(listQuerySchema.parse({ page: "2", limit: "10" })).toEqual({
      page: 2,
      limit: 10,
      mine: false,
    });
    expect(listQuerySchema.parse({})).toEqual({ page: 1, limit: 20, mine: false });
    expect(listQuerySchema.parse({ mine: "1" }).mine).toBe(true);
  });

  test("selectTenantSchema and complaint comment schema", () => {
    const tenantId = "11111111-1111-1111-1111-111111111111";
    expect(selectTenantSchema.parse({ tenantId }).tenantId).toBe(tenantId);
    expect(() => selectTenantSchema.parse({ tenantId: "bad" })).toThrow();
    expect(createComplaintCommentSchema.parse({ body: "Update please" }).body).toBe(
      "Update please",
    );
    expect(() => createComplaintCommentSchema.parse({ body: "" })).toThrow();
  });

  test("society/structure schemas", () => {
    expect(
      createSocietySchema.parse({ name: "Keshav Heights", city: "Pune" }).name,
    ).toBe("Keshav Heights");
    expect(createBuildingSchema.parse({ name: "Tower A" }).name).toBe("Tower A");
    expect(createWingSchema.parse({ name: "A" }).name).toBe("A");
    expect(createFlatSchema.parse({ number: "101" }).number).toBe("101");
  });

  test("addSocietyTeamMemberSchema requires email or phone", () => {
    expect(
      addSocietyTeamMemberSchema.parse({
        email: "ops@societyhub.local",
        phone: "8888888888",
        role: "secretary",
      }).phone,
    ).toBe("8888888888");
    expect(addSocietyTeamMemberSchema.parse({ phone: "8888888888" }).role).toBe(
      "chairperson",
    );
    expect(() =>
      addSocietyTeamMemberSchema.parse({ phone: "123", role: "secretary" }),
    ).toThrow();
    expect(
      updateSocietyTeamMemberSchema.parse({ phone: "8888888888" }).phone,
    ).toBe("8888888888");
    expect(() => updateSocietyTeamMemberSchema.parse({})).toThrow();
  });

  test("createInvitationSchema and updateResidentProfileSchema", () => {
    expect(
      createInvitationSchema.parse({ email: "a@b.com", role: "resident" }).role,
    ).toBe("resident");
    expect(createInvitationSchema.parse({}).role).toBe("resident");
    expect(
      createInvitationSchema.parse({
        phone: "9999999999",
        channels: ["whatsapp"],
      }).channels,
    ).toEqual(["whatsapp"]);
    expect(
      updateResidentProfileSchema.parse({ vehicleNumber: "MH12AB1234" })
        .vehicleNumber,
    ).toBe("MH12AB1234");
  });

  test("residentImportSchema validates bulk rows", () => {
    const ok = residentImportSchema.parse({
      rows: [
        {
          name: "Asha",
          phone: "9999999999",
          flatNumber: "101",
          isOwner: false,
          emergencyContact: "9111111111",
        },
      ],
      sendInvites: true,
      updateFlats: true,
      createMissingFlats: false,
      forceInvite: false,
    });
    expect(ok.rows).toHaveLength(1);
    expect(ok.rows[0]!.isOwner).toBe(false);
    expect(() =>
      residentImportSchema.parse({
        rows: [{ name: "X", phone: "1", flatNumber: "1" }],
      }),
    ).toThrow();
  });

  test("billing and payment schemas", () => {
    expect(
      generateBillsSchema.parse({ periodYm: "2026-07", amountPaise: 500000 })
        .periodYm,
    ).toBe("2026-07");
    expect(() =>
      generateBillsSchema.parse({ periodYm: "bad", amountPaise: 100 }),
    ).toThrow();
    expect(voidBillSchema.parse({ reason: "duplicate" }).reason).toBe(
      "duplicate",
    );
    const flatId = "66666666-6666-6666-6666-666666666666";
    expect(
      recordPaymentSchema.parse({ flatId, amountPaise: 1000, method: "cash" })
        .method,
    ).toBe("cash");
    expect(
      recordPaymentSchema.parse({ flatId, amountPaise: 1000, method: "upi" })
        .method,
    ).toBe("upi");
    expect(
      updatePaymentAccountSchema.parse({ upiId: "keshav@upi" }).upiId,
    ).toBe("keshav@upi");
    expect(
      razorpayWebhookSchema.parse({ orderId: "order_1", paymentId: "pay_1" })
        .status,
    ).toBe("success");
  });

  test("notice schemas", () => {
    expect(
      createNoticeSchema.parse({ title: "Water cut", body: "Tomorrow 10am" })
        .audience,
    ).toBe("all");
    expect(updateNoticeSchema.parse({ title: "Updated" }).title).toBe(
      "Updated",
    );
    expect(updateNoticeSchema.parse({}).title).toBeUndefined();
  });

  test("future module schemas", () => {
    expect(
      createVisitorSchema.parse({ visitorName: "Ravi Kumar" }).visitorName,
    ).toBe("Ravi Kumar");
    expect(
      createParkingSlotSchema.parse({ slotNumber: "P-12" }).slotNumber,
    ).toBe("P-12");
    expect(
      createBookingSchema.parse({
        facilityName: "Clubhouse",
        startAt: "2026-08-01T10:00:00.000Z",
        endAt: "2026-08-01T12:00:00.000Z",
      }).facilityName,
    ).toBe("Clubhouse");
    expect(createAssetSchema.parse({ name: "Generator" }).name).toBe(
      "Generator",
    );
    expect(createVendorSchema.parse({ name: "ABC Plumbers" }).name).toBe(
      "ABC Plumbers",
    );
    expect(createEventSchema.parse({ title: "Ganesh Utsav" }).title).toBe(
      "Ganesh Utsav",
    );
  });
});
