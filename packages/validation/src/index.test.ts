import { describe, expect, test } from "bun:test";
import {
  acceptInvitationSchema,
  addTeamMemberSchema,
  changeTeamRoleSchema,
  createFamilyMemberSchema,
  flatListQuerySchema,
  invitationListQuerySchema,
  moveOutResidentSchema,
  rejectDocumentSchema,
  rejectResidentSchema,
  residentListQuerySchema,
  suspendResidentSchema,
  updateFamilyMemberSchema,
  uploadDocumentMetaSchema,
  changePasswordSchema,
  createAssetSchema,
  createBookingSchema,
  createBuildingSchema,
  createComplaintCommentSchema,
  createComplaintSchema,
  updateComplaintSchema,
  createEventSchema,
  createFlatSchema,
  createSocietyFlatSchema,
  importSocietyFlatsSchema,
  createSocietyBuildingSchema,
  createSocietyParkingSchema,
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
  addHouseholdMemberSchema,
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

  test("addHouseholdMemberSchema", () => {
    expect(
      addHouseholdMemberSchema.parse({
        name: "Kid",
        phone: "8888888881",
        email: "",
      }),
    ).toMatchObject({ name: "Kid", phone: "8888888881", email: null });
  });

  test("onboardResidentSchema", () => {
    const flatId = "66666666-6666-6666-6666-666666666666";
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        adultCount: 2,
        childCount: 1,
        seniorCitizenCount: 1,
        editOwner: true,
        editUserId: flatId,
      }),
    ).toMatchObject({
      adultCount: 2,
      childCount: 1,
      seniorCitizenCount: 1,
      editOwner: true,
      editUserId: flatId,
    });
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        email: "",
      }).email,
    ).toBeNull();
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        vehicles: [{ kind: "two_wheeler" }, { kind: "two_wheeler" }],
      }).vehicles,
    ).toEqual([
      {
        kind: "two_wheeler",
        registrationNumber: null,
        parkingPurchased: false,
        parkingSlot: undefined,
      },
      {
        kind: "two_wheeler",
        registrationNumber: null,
        parkingPurchased: false,
        parkingSlot: undefined,
      },
    ]);
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        email: "ravi@example.com",
        pngGasConnection: true,
        vehicles: [
          { kind: "two_wheeler", registrationNumber: "MH12TW0001" },
          { kind: "two_wheeler", registrationNumber: "MH12TW0002" },
          {
            kind: "two_wheeler",
            registrationNumber: "MH12TW0003",
            parkingPurchased: true,
          },
        ],
      }).vehicles,
    ).toHaveLength(3);
    expect(() =>
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        email: "ravi@example.com",
        vehicles: [
          { kind: "two_wheeler", registrationNumber: "MH12TW0001" },
          { kind: "two_wheeler", registrationNumber: "MH12TW0002" },
          { kind: "two_wheeler", registrationNumber: "MH12TW0003" },
        ],
      }),
    ).toThrow();
    expect(() =>
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        email: "ravi@example.com",
        vehicles: [
          { kind: "four_wheeler", registrationNumber: "MH12FW0001" },
          { kind: "four_wheeler", registrationNumber: "MH12FW0002" },
        ],
      }),
    ).toThrow();
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
        channels: ["email", "whatsapp"],
      }).channels,
    ).toEqual(["email", "whatsapp"]);
    expect(
      onboardResidentSchema.parse({
        name: "Ravi",
        phone: "7777777777",
        flatId,
      }).channels,
    ).toBeUndefined();
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
    expect(updateComplaintSchema.parse({ title: "Updated leak" }).title).toBe(
      "Updated leak",
    );
    expect(() => updateComplaintSchema.parse({})).toThrow();
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
    expect(createComplaintCommentSchema.parse({ body: "Update please" })).toEqual({
      body: "Update please",
      kind: "comment",
    });
    expect(
      createComplaintCommentSchema.parse({ body: "Need a photo?", kind: "question" }).kind,
    ).toBe("question");
    expect(() => createComplaintCommentSchema.parse({ body: "" })).toThrow();
  });

  test("society/structure schemas", () => {
    expect(
      createSocietySchema.parse({ name: "Keshav Heights", city: "Pune" }).name,
    ).toBe("Keshav Heights");
    expect(createBuildingSchema.parse({ name: "Tower A" }).name).toBe("Tower A");
    expect(createWingSchema.parse({ name: "A" }).name).toBe("A");
    expect(createFlatSchema.parse({ number: "101" }).number).toBe("101");
    expect(
      createSocietyFlatSchema.parse({ wing: " A ", floor: "3", flatNumber: "101" }),
    ).toEqual({ wing: "A", floor: 3, flatNumber: "101" });
    expect(
      importSocietyFlatsSchema.parse({
        buildingName: "Tower A",
        rows: [{ wing: "B", floor: 1, flatNumber: "201" }],
      }).buildingName,
    ).toBe("Tower A");
    expect(
      createSocietyBuildingSchema.parse({ name: " Tower B " }).name,
    ).toBe("Tower B");
    expect(() =>
      createSocietyFlatSchema.parse({ wing: "", floor: 1, flatNumber: "101" }),
    ).toThrow();
    expect(
      createSocietyParkingSchema.parse({
        kind: "puzzle",
        wing: " A ",
        floor: "6",
        slotNumber: "12",
      }),
    ).toMatchObject({ kind: "puzzle", wing: "A", slotNumber: "12" });
    expect(
      createSocietyParkingSchema.parse({ kind: "open", slotNumber: "OP-1" }),
    ).toMatchObject({ kind: "open", slotNumber: "OP-1" });
    expect(() =>
      createSocietyParkingSchema.parse({ kind: "puzzle", slotNumber: "12" }),
    ).toThrow();
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
    const household = updateResidentProfileSchema.parse({
      pngGasConnection: true,
      adultCount: 2,
      childCount: 1,
      seniorCitizenCount: 0,
      parkingSlot: "104",
      parkingSlotId: "11111111-1111-1111-1111-111111111111",
      vehicles: [{ kind: "two_wheeler" }, { kind: "two_wheeler" }],
    });
    expect(household.adultCount).toBe(2);
    expect(household.parkingSlot).toBe("104");
    expect(household.vehicles).toHaveLength(2);
    expect(household.vehicles?.[0]?.registrationNumber).toBeNull();
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
    expect(
      residentImportSchema.parse({
        rows: [
          {
            name: "Asha",
            phone: "9999999999",
            flatNumber: "101",
            vehicles: [
              { kind: "two_wheeler" },
              { kind: "two_wheeler" },
              { kind: "four_wheeler" },
            ],
          },
        ],
      }).rows[0]!.vehicles,
    ).toHaveLength(3);
    expect(() =>
      residentImportSchema.parse({
        rows: [{ name: "X", phone: "1", flatNumber: "1" }],
      }),
    ).toThrow();
  });

  test("billing and payment schemas", () => {
    expect(
      generateBillsSchema.parse({
        periodYm: "2026-07",
        amountPaise: 500000,
        reason: "Monthly maintenance",
      }).periodYm,
    ).toBe("2026-07");
    expect(() =>
      generateBillsSchema.parse({ periodYm: "bad", amountPaise: 100 }),
    ).toThrow();
    expect(() =>
      generateBillsSchema.parse({ periodYm: "2026-07", amountPaise: 500000 }),
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
  test("resident directory query defaults to page 1 of 20, sorted by name", () => {
    const parsed = residentListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sort).toBe("name");
    expect(parsed.order).toBe("asc");

    const coerced = residentListQuerySchema.parse({
      page: "3",
      limit: "50",
      search: "rohan",
      residentType: "tenant",
      status: "moved_out",
      verificationStatus: "under_review",
      sort: "flat",
      order: "desc",
    });
    expect(coerced.page).toBe(3);
    expect(coerced.limit).toBe(50);
    expect(coerced.residentType).toBe("tenant");
    expect(coerced.status).toBe("moved_out");

    expect(() => residentListQuerySchema.parse({ limit: 500 })).toThrow();
    expect(() => residentListQuerySchema.parse({ status: "nope" })).toThrow();
  });

  test("flat directory query accepts only real occupancy values", () => {
    expect(flatListQuerySchema.parse({}).limit).toBe(20);
    expect(flatListQuerySchema.parse({ occupancy: "vacant" }).occupancy).toBe("vacant");
    expect(() => flatListQuerySchema.parse({ occupancy: "empty" })).toThrow();
  });

  test("onboarding accepts a resident type and defaults to owner", () => {
    const base = {
      name: "Rohan Vichare",
      phone: "9800000000",
      email: "rohan@example.com",
      flatId: "11111111-1111-1111-1111-111111111111",
    };
    expect(onboardResidentSchema.parse(base).residentType).toBe("owner");
    expect(onboardResidentSchema.parse(base).isPrimary).toBe(true);
    expect(
      onboardResidentSchema.parse({ ...base, residentType: "tenant" }).residentType,
    ).toBe("tenant");
    expect(() =>
      onboardResidentSchema.parse({ ...base, residentType: "landlord" }),
    ).toThrow();
  });

  test("rejection needs a usable reason", () => {
    expect(rejectResidentSchema.parse({ reason: "Blurry scan" }).reason).toBe(
      "Blurry scan",
    );
    expect(() => rejectResidentSchema.parse({})).toThrow();
    expect(() => rejectResidentSchema.parse({ reason: "no" })).toThrow();
    expect(() => rejectDocumentSchema.parse({ reason: "" })).toThrow();
    // Suspension and move-out reasons are optional.
    expect(suspendResidentSchema.parse({}).reason).toBeUndefined();
    expect(moveOutResidentSchema.parse({}).moveOutDate).toBeUndefined();
  });

  test("family and document schemas", () => {
    expect(
      createFamilyMemberSchema.parse({ name: "Sayali" }).relationship,
    ).toBe("other");
    expect(
      createFamilyMemberSchema.parse({ name: "Aarav", relationship: "child" })
        .relationship,
    ).toBe("child");
    expect(() =>
      createFamilyMemberSchema.parse({ name: "X", relationship: "cousin" }),
    ).toThrow();
    expect(updateFamilyMemberSchema.parse({}).name).toBeUndefined();
    expect(uploadDocumentMetaSchema.parse({}).docType).toBe("other");
    expect(
      uploadDocumentMetaSchema.parse({ docType: "tenant_agreement" }).docType,
    ).toBe("tenant_agreement");
  });

  test("invitations carry a flat, a resident type and an expiry window", () => {
    const parsed = createInvitationSchema.parse({ email: "a@b.com" });
    expect(parsed.role).toBe("resident");
    expect(parsed.expiresInDays).toBe(14);
    expect(
      createInvitationSchema.parse({ phone: "9800000000", expiresInDays: "30" })
        .expiresInDays,
    ).toBe(30);
    expect(() =>
      createInvitationSchema.parse({ email: "a@b.com", expiresInDays: 500 }),
    ).toThrow();
    expect(acceptInvitationSchema.parse({ token: "abcdefgh" }).token).toBe("abcdefgh");
    expect(() => acceptInvitationSchema.parse({ token: "short" })).toThrow();
    expect(invitationListQuerySchema.parse({}).page).toBe(1);
  });

  test("team member needs some way to identify the person", () => {
    expect(
      addTeamMemberSchema.parse({ email: "ops@x.test", role: "secretary" }).role,
    ).toBe("secretary");
    expect(
      addTeamMemberSchema.parse({ phone: "9800000000", role: "committee" }).role,
    ).toBe("committee");
    expect(
      addTeamMemberSchema.parse({
        userId: "11111111-1111-1111-1111-111111111111",
        role: "treasurer",
      }).role,
    ).toBe("treasurer");

    // Neither userId, email nor phone — the superRefine must reject it.
    const result = addTeamMemberSchema.safeParse({ role: "committee" });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toBe(
      "Provide a userId, an email or a phone",
    );

    expect(
      changeTeamRoleSchema.parse({ fromRole: "secretary", toRole: "treasurer" })
        .toRole,
    ).toBe("treasurer");
    expect(() =>
      changeTeamRoleSchema.parse({ fromRole: "resident", toRole: "treasurer" }),
    ).toThrow();
  });

  test("self-service profile edits cannot touch membership fields", () => {
    const parsed = updateResidentProfileSchema.parse({
      name: "Rohan",
      emergencyContactName: "Aai",
      communicationPreferences: { whatsapp: true },
    });
    expect(parsed.name).toBe("Rohan");
    expect(parsed.communicationPreferences?.whatsapp).toBe(true);
    // Flat, status and verification are simply not part of the schema.
    expect("flatId" in parsed).toBe(false);
    expect("verificationStatus" in parsed).toBe(false);
  });

  test("CSV import defaults to an all-or-nothing apply", () => {
    const parsed = residentImportSchema.parse({
      rows: [{ name: "A", phone: "9800000000", flatNumber: "101" }],
    });
    expect(parsed.allowPartial).toBe(false);
    expect(parsed.updateFlats).toBe(true);
    expect(parsed.rows[0]!.isOwner).toBe(true);
    expect(
      residentImportSchema.parse({
        rows: [
          { name: "A", phone: "9800000000", flatNumber: "101", residentType: "tenant" },
        ],
        allowPartial: true,
      }).rows[0]!.residentType,
    ).toBe("tenant");
  });
});
