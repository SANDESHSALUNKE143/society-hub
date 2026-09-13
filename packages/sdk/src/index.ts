import type {
  AuthTokens,
  ComplaintDto,
  FlatDto,
  Paginated,
  UserDto,
  ApiErrorBody,
  MembershipDto,
  SocietyDto,
  BuildingDto,
  WingDto,
  InvitationDto,
  BillDto,
  PaymentDto,
  PaymentAccountDto,
  NoticeDto,
  NotificationDto,
  AuditLogDto,
  ActivityEventDto,
  PlatformUserDto,
  TeamMemberDto,
  SocietyResidentDto,
  VisitorDto,
  ParkingSlotDto,
  BookingDto,
  AssetDto,
  VendorDto,
  EventDto,
  ResidentImportResultDto,
  ResidentImportPreviewDto,
  SocietyFlatImportResultDto,
  DashboardStatsDto,
  ResidentProfileDto,
  ResidentSummaryDto,
  ResidentDetailDto,
  ResidentDocumentDto,
  ResidentFamilyMemberDto,
  ResidentType,
  ResidentStatus,
  VerificationStatus,
  PlatformPlanDto,
  PlatformSubscriptionDto,
  PlatformDiscountDto,
  PlatformBillDto,
  PlatformAnnouncementDto,
  SupportTicketDto,
  IntegrationHealthDto,
  ResidentDocumentType,
  FamilyRelationship,
  FlatDetailDto,
  FlatOccupancySummaryDto,
  FlatOccupantDto,
  FlatOccupancyHistoryEntryDto,
  OccupancyStatsDto,
  CommunicationPreferences,
} from "@society-hub/types";

export type ResidentListParams = {
  page?: number;
  limit?: number;
  search?: string;
  buildingId?: string;
  wingId?: string;
  flatId?: string;
  residentType?: ResidentType;
  status?: ResidentStatus;
  verificationStatus?: VerificationStatus;
  sort?: "name" | "flat" | "createdAt" | "status";
  order?: "asc" | "desc";
};

function toQuery(params: Record<string, unknown> | undefined) {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

export type SocietyHubClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  onTokens?: (tokens: AuthTokens) => void;
};

export function createSocietyHubClient(opts: SocietyHubClientOptions) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
    auth = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (auth) {
      const token = opts.getAccessToken?.();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    let res = await fetch(`${opts.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && auth && opts.getRefreshToken) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
        res = await fetch(`${opts.baseUrl}${path}`, { ...init, headers });
      }
    }

    if (!res.ok) {
      let body: ApiErrorBody = {
        code: "http_error",
        message: res.statusText,
      };
      try {
        body = (await res.json()) as ApiErrorBody;
      } catch {
        /* ignore */
      }
      throw new ApiClientError(res.status, body);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async function tryRefresh(): Promise<AuthTokens | null> {
    const refreshToken = opts.getRefreshToken?.();
    if (!refreshToken) return null;
    try {
      const tokens = await request<AuthTokens>(
        "/v1/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        },
        false,
      );
      opts.onTokens?.(tokens);
      return tokens;
    } catch {
      return null;
    }
  }

  return {
    requestOtp: (phone: string) =>
      request<{ ok: true; devCode?: string }>(
        "/v1/auth/otp/request",
        { method: "POST", body: JSON.stringify({ phone }) },
        false,
      ),
    verifyOtp: (phone: string, code: string) =>
      request<{ user: UserDto; tokens: AuthTokens; memberships?: MembershipDto[] }>(
        "/v1/auth/otp/verify",
        { method: "POST", body: JSON.stringify({ phone, code }) },
        false,
      ),
    loginPin: (phone: string, pin: string) =>
      request<{ user: UserDto; tokens: AuthTokens; memberships?: MembershipDto[] }>(
        "/v1/auth/pin/login",
        { method: "POST", body: JSON.stringify({ phone, pin }) },
        false,
      ),
    loginPassword: (email: string, password: string) =>
      request<{ user: UserDto; tokens: AuthTokens; memberships?: MembershipDto[] }>(
        "/v1/auth/password/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
        false,
      ),
    forgotPassword: (email: string) =>
      request<{ ok: true; devCode?: string }>(
        "/v1/auth/password/forgot",
        { method: "POST", body: JSON.stringify({ email }) },
        false,
      ),
    resetPassword: (email: string, code: string, newPassword: string) =>
      request<{ ok: true }>(
        "/v1/auth/password/reset",
        {
          method: "POST",
          body: JSON.stringify({ email, code, newPassword }),
        },
        false,
      ),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: true }>("/v1/auth/password/change", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    loginGoogle: (idToken: string) =>
      request<{ user: UserDto; tokens: AuthTokens; memberships?: MembershipDto[] }>(
        "/v1/auth/google",
        { method: "POST", body: JSON.stringify({ idToken }) },
        false,
      ),
    setPin: (pin: string) =>
      request<{ ok: true }>("/v1/auth/pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    refresh: (refreshToken: string) =>
      request<AuthTokens>(
        "/v1/auth/refresh",
        { method: "POST", body: JSON.stringify({ refreshToken }) },
        false,
      ),
    me: () => request<UserDto>("/v1/auth/me"),
    logout: (refreshToken: string) =>
      request<{ ok: true }>("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }),
    listMemberships: () => request<MembershipDto[]>("/v1/auth/memberships"),
    getProfile: () => request<ResidentProfileDto>("/v1/profile"),
    selectTenant: (tenantId: string) =>
      request<{ user: UserDto; tokens: AuthTokens }>("/v1/auth/select-tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId }),
      }),
    updateProfile: (body: {
      name?: string;
      emergencyContact?: string | null;
      emergencyContactName?: string | null;
      emergencyContactRelation?: string | null;
      emergencyContactPhone?: string | null;
      vehicleNumber?: string | null;
      communicationPreferences?: Partial<CommunicationPreferences>;
      pngGasConnection?: boolean;
      adultCount?: number;
      childCount?: number;
      seniorCitizenCount?: number;
      parkingSlot?: string | null;
      parkingSlotId?: string | null;
      vehicles?: Array<{
        kind: "two_wheeler" | "four_wheeler";
        registrationNumber?: string | null;
        parkingPurchased?: boolean;
        parkingSlot?: string | null;
      }>;
    }) =>
      request<ResidentProfileDto>("/v1/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    uploadMyDocument: (
      file: File,
      meta: {
        docType: ResidentDocumentType;
        documentNumber?: string | null;
        expiresAt?: string | null;
      },
    ) => {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", meta.docType);
      if (meta.documentNumber) form.append("documentNumber", meta.documentNumber);
      if (meta.expiresAt) form.append("expiresAt", meta.expiresAt);
      return request<ResidentDocumentDto>("/v1/profile/documents", {
        method: "POST",
        body: form,
      });
    },
    listFlats: () => request<FlatDto[]>("/v1/admin/flats"),
    listParkings: () => request<ParkingSlotDto[]>("/v1/admin/parkings"),
    listHouseholdMembers: () =>
      request<SocietyResidentDto[]>("/v1/household/members"),
    addHouseholdMember: (body: {
      name: string;
      phone: string;
      email?: string | null;
    }) =>
      request<{ user: UserDto }>("/v1/household/members", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateHouseholdMember: (
      userId: string,
      body: { name: string; phone: string; email?: string | null },
    ) =>
      request<{ user: UserDto }>(`/v1/household/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    removeHouseholdMember: (userId: string) =>
      request<{ ok: true }>(`/v1/household/members/${userId}`, {
        method: "DELETE",
      }),
    removeResident: (userId: string) =>
      request<{ ok: true }>(`/v1/admin/residents/by-user/${userId}`, {
        method: "DELETE",
      }),
    onboardResident: (body: {
      name: string;
      phone: string;
      flatId: string;
      email?: string | null;
      residentType?: ResidentType;
      isPrimary?: boolean;
      moveInDate?: string | null;
      remarks?: string | null;
      floor?: number | null;
      parkingSlot?: string | null;
      parkingSlotId?: string | null;
      isOwner?: boolean;
      editOwner?: boolean;
      editUserId?: string;
      emergencyContact?: string | null;
      vehicleNumber?: string | null;
      vehicles?: Array<{
        kind: "two_wheeler" | "four_wheeler";
        registrationNumber?: string | null;
        parkingPurchased?: boolean;
        parkingSlot?: string | null;
      }>;
      pngGasConnection?: boolean;
      adultCount?: number;
      childCount?: number;
      seniorCitizenCount?: number;
      /** Welcome notify only — does not create an invitation. */
      channels?: Array<"email" | "whatsapp">;
    }) =>
      request<{
        user: UserDto;
        resident: ResidentDetailDto;
        created?: boolean;
        updated?: boolean;
        delivery?: {
          email?: { ok: boolean; error?: string };
          whatsapp?: { ok: boolean; error?: string };
        };
      }>("/v1/admin/residents", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    listSocietyResidents: () =>
      request<SocietyResidentDto[]>("/v1/admin/society-residents"),

    // ---- Resident directory & lifecycle -----------------------------------
    listResidents: (params?: ResidentListParams) =>
      request<Paginated<ResidentSummaryDto>>(
        `/v1/admin/residents${toQuery(params)}`,
      ),
    getResident: (id: string) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}`),
    updateResident: (
      id: string,
      body: {
        name?: string;
        phone?: string;
        email?: string | null;
        residentType?: ResidentType;
        isPrimary?: boolean;
        moveInDate?: string | null;
        remarks?: string | null;
      },
    ) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    verifyResident: (id: string) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}/verify`, {
        method: "POST",
      }),
    rejectResident: (id: string, reason: string) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    suspendResident: (id: string, reason?: string | null) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason: reason ?? null }),
      }),
    reactivateResident: (id: string) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}/reactivate`, {
        method: "POST",
      }),
    moveOutResident: (
      id: string,
      body?: {
        moveOutDate?: string | null;
        reason?: string | null;
        remarks?: string | null;
      },
    ) =>
      request<ResidentDetailDto>(`/v1/admin/residents/${id}/move-out`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    listResidentActivity: (id: string) =>
      request<ActivityEventDto[]>(`/v1/admin/residents/${id}/activity`),

    // ---- Family ------------------------------------------------------------
    listFamilyMembers: (residentId: string) =>
      request<ResidentFamilyMemberDto[]>(
        `/v1/admin/residents/${residentId}/family`,
      ),
    addFamilyMember: (
      residentId: string,
      body: {
        name: string;
        relationship: FamilyRelationship;
        phone?: string | null;
        email?: string | null;
      },
    ) =>
      request<ResidentFamilyMemberDto[]>(
        `/v1/admin/residents/${residentId}/family`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    removeFamilyMember: (residentId: string, familyId: string) =>
      request<ResidentFamilyMemberDto[]>(
        `/v1/admin/residents/${residentId}/family/${familyId}`,
        { method: "DELETE" },
      ),

    // ---- Documents ---------------------------------------------------------
    listResidentDocuments: (residentId: string) =>
      request<ResidentDocumentDto[]>(
        `/v1/admin/residents/${residentId}/documents`,
      ),
    uploadResidentDocument: (
      residentId: string,
      file: File,
      meta: {
        docType: ResidentDocumentType;
        documentNumber?: string | null;
        expiresAt?: string | null;
      },
    ) => {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", meta.docType);
      if (meta.documentNumber) form.append("documentNumber", meta.documentNumber);
      if (meta.expiresAt) form.append("expiresAt", meta.expiresAt);
      return request<ResidentDocumentDto[]>(
        `/v1/admin/residents/${residentId}/documents`,
        { method: "POST", body: form },
      );
    },
    verifyDocument: (documentId: string) =>
      request<ResidentDocumentDto>(
        `/v1/admin/resident-documents/${documentId}/verify`,
        { method: "POST" },
      ),
    rejectDocument: (documentId: string, reason: string) =>
      request<ResidentDocumentDto>(
        `/v1/admin/resident-documents/${documentId}/reject`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    deleteDocument: (documentId: string) =>
      request<{ ok: true }>(`/v1/admin/resident-documents/${documentId}`, {
        method: "DELETE",
      }),

    // ---- Flat occupancy ----------------------------------------------------
    getFlatDetail: (flatId: string) =>
      request<FlatDetailDto>(`/v1/admin/flats/${flatId}`),
    listFlatResidents: (flatId: string) =>
      request<FlatOccupantDto[]>(`/v1/admin/flats/${flatId}/residents`),
    listFlatHistory: (flatId: string) =>
      request<FlatOccupancyHistoryEntryDto[]>(
        `/v1/admin/flats/${flatId}/history`,
      ),
    getOccupancyStats: () =>
      request<OccupancyStatsDto>("/v1/admin/occupancy/stats"),
    listFlatsWithOccupancy: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      buildingId?: string;
      wingId?: string;
      occupancy?: "vacant" | "owner_occupied" | "tenant_occupied";
    }) =>
      request<Paginated<FlatOccupancySummaryDto>>(
        `/v1/admin/occupancy/flats${toQuery(params)}`,
      ),

    previewResidentImport: (body: {
      rows: Array<{
        name: string;
        phone: string;
        email?: string | null;
        flatNumber: string;
        wingName?: string | null;
        floor?: number | null;
        parkingSlot?: string | null;
        isOwner?: boolean;
        residentType?: ResidentType;
        emergencyContact?: string | null;
        vehicleNumber?: string | null;
        vehicles?: Array<{
          kind: "two_wheeler" | "four_wheeler";
          registrationNumber?: string | null;
          parkingPurchased?: boolean;
          parkingSlot?: string | null;
        }>;
        pngGasConnection?: boolean;
        adultCount?: number;
        childCount?: number;
        seniorCitizenCount?: number;
      }>;
      createMissingFlats?: boolean;
    }) =>
      request<ResidentImportPreviewDto>("/v1/admin/residents/import/preview", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    importResidents: (body: {
      rows: Array<{
        name: string;
        phone: string;
        email?: string | null;
        flatNumber: string;
        wingName?: string | null;
        floor?: number | null;
        parkingSlot?: string | null;
        isOwner?: boolean;
        residentType?: ResidentType;
        emergencyContact?: string | null;
        vehicleNumber?: string | null;
        vehicles?: Array<{
          kind: "two_wheeler" | "four_wheeler";
          registrationNumber: string | null;
          parkingPurchased?: boolean;
          parkingSlot?: string | null;
        }>;
        pngGasConnection?: boolean;
        adultCount?: number;
        childCount?: number;
        seniorCitizenCount?: number;
        sendInvite?: boolean;
      }>;
      sendInvites?: boolean;
      forceInvite?: boolean;
      updateFlats?: boolean;
      createMissingFlats?: boolean;
      allowPartial?: boolean;
    }) =>
      request<ResidentImportResultDto>("/v1/admin/residents/import", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listComplaints: (page = 1, limit = 20, opts?: { mine?: boolean }) =>
      request<Paginated<ComplaintDto>>(
        `/v1/complaints?page=${page}&limit=${limit}${opts?.mine ? "&mine=1" : ""}`,
      ),
    getComplaint: (id: string) =>
      request<ComplaintDto>(`/v1/complaints/${id}`),
    createComplaint: (body: {
      title: string;
      type: string;
      typeOtherText?: string | null;
      description: string;
      flatId?: string | null;
    }) =>
      request<ComplaintDto>("/v1/complaints", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateComplaintStatus: (
      id: string,
      status: string,
      opts?: { note?: string | null; assignedToUserId?: string | null },
    ) =>
      request<ComplaintDto>(`/v1/complaints/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          note: opts?.note ?? null,
          assignedToUserId: opts?.assignedToUserId ?? null,
        }),
      }),
    updateComplaint: (
      id: string,
      body: {
        title?: string;
        type?: string;
        typeOtherText?: string | null;
        description?: string;
      },
    ) =>
      request<ComplaintDto>(`/v1/complaints/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    addComplaintComment: (
      id: string,
      body: string,
      kind: "comment" | "question" = "comment",
    ) =>
      request<ComplaintDto>(`/v1/complaints/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, kind }),
      }),
    deleteComplaint: (id: string) =>
      request<{ ok: true }>(`/v1/complaints/${id}`, { method: "DELETE" }),
    uploadAttachment: async (complaintId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<ComplaintDto>(
        `/v1/complaints/${complaintId}/attachments`,
        { method: "POST", body: form },
      );
    },

    listSocieties: () => request<SocietyDto[]>("/v1/societies"),
    createSociety: (body: {
      name: string;
      address?: string | null;
      city?: string | null;
      pincode?: string | null;
      chairpersonName?: string | null;
      chairpersonEmail?: string | null;
      chairpersonPhone?: string | null;
    }) =>
      request<SocietyDto>("/v1/societies", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateSociety: (
      societyId: string,
      body: {
        name: string;
        address?: string | null;
        city?: string | null;
        pincode?: string | null;
      },
    ) =>
      request<SocietyDto>(`/v1/societies/${societyId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    getSociety: (id: string) => request<SocietyDto>(`/v1/societies/${id}`),
    listSocietyTeam: (societyId: string) =>
      request<TeamMemberDto[]>(`/v1/manage/societies/${societyId}/team`),
    addSocietyTeamMember: (
      societyId: string,
      body: {
        email?: string;
        phone?: string;
        name?: string;
        role?:
          | "chairperson"
          | "admin"
          | "secretary"
          | "treasurer"
          | "cashier"
          | "committee";
      },
    ) =>
      request<{
        ok: true;
        userId: string;
        tenantId: string;
        role: string;
        societyName: string;
      }>(`/v1/manage/societies/${societyId}/team`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    removeSocietyTeamMember: (societyId: string, userId: string) =>
      request<{ ok: true }>(`/v1/manage/societies/${societyId}/team/${userId}`, {
        method: "DELETE",
      }),
    listManageSocietyFlats: (societyId: string) =>
      request<FlatDto[]>(`/v1/manage/societies/${societyId}/flats`),
    listManageSocietyBuildings: (societyId: string) =>
      request<
        Array<{ id: string; name: string; wingCount: number; flatCount: number }>
      >(`/v1/manage/societies/${societyId}/buildings`),
    addManageSocietyBuilding: (societyId: string, body: { name: string }) =>
      request<{ id: string; name: string }>(
        `/v1/manage/societies/${societyId}/buildings`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    renameManageSocietyBuilding: (
      societyId: string,
      buildingId: string,
      body: { name: string },
    ) =>
      request<{ id: string; name: string }>(
        `/v1/manage/societies/${societyId}/buildings/${buildingId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    deleteManageSocietyBuilding: (societyId: string, buildingId: string) =>
      request<{ ok: true }>(
        `/v1/manage/societies/${societyId}/buildings/${buildingId}`,
        { method: "DELETE" },
      ),
    listManageSocietyWings: (societyId: string, buildingId: string) =>
      request<
        Array<{
          id: string;
          name: string;
          buildingId: string;
          flatCount: number;
        }>
      >(`/v1/manage/societies/${societyId}/buildings/${buildingId}/wings`),
    addManageSocietyWing: (
      societyId: string,
      buildingId: string,
      body: { name: string },
    ) =>
      request<{
        id: string;
        name: string;
        buildingId: string;
        flatCount: number;
      }>(`/v1/manage/societies/${societyId}/buildings/${buildingId}/wings`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    renameManageSocietyWing: (
      societyId: string,
      wingId: string,
      body: { name: string },
    ) =>
      request<{
        id: string;
        name: string;
        buildingId: string;
        flatCount: number;
      }>(`/v1/manage/societies/${societyId}/wings/${wingId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteManageSocietyWing: (societyId: string, wingId: string) =>
      request<{ ok: true }>(
        `/v1/manage/societies/${societyId}/wings/${wingId}`,
        { method: "DELETE" },
      ),
    addManageSocietyFlat: (
      societyId: string,
      body: {
        wing: string;
        floor: number;
        flatNumber: string;
        buildingId?: string | null;
        buildingName?: string | null;
      },
    ) =>
      request<FlatDto>(`/v1/manage/societies/${societyId}/flats`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    importManageSocietyFlats: (
      societyId: string,
      body: {
        rows: Array<{ wing: string; floor: number; flatNumber: string }>;
        buildingId?: string | null;
        buildingName?: string | null;
      },
    ) =>
      request<SocietyFlatImportResultDto>(
        `/v1/manage/societies/${societyId}/flats/import`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    updateManageSocietyFlat: (
      societyId: string,
      flatId: string,
      body: {
        wing: string;
        floor: number;
        flatNumber: string;
        buildingId?: string | null;
        buildingName?: string | null;
      },
    ) =>
      request<FlatDto>(`/v1/manage/societies/${societyId}/flats/${flatId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteManageSocietyFlat: (societyId: string, flatId: string) =>
      request<{ ok: true }>(
        `/v1/manage/societies/${societyId}/flats/${flatId}`,
        { method: "DELETE" },
      ),
    listManageSocietyParkings: (societyId: string) =>
      request<ParkingSlotDto[]>(`/v1/manage/societies/${societyId}/parkings`),
    addManageSocietyParking: (
      societyId: string,
      body: {
        kind: "puzzle" | "open";
        wing?: string | null;
        floor?: number | null;
        slotNumber: string;
      },
    ) =>
      request<ParkingSlotDto>(`/v1/manage/societies/${societyId}/parkings`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    importManageSocietyParkings: (
      societyId: string,
      rows: Array<{
        kind: "puzzle" | "open";
        wing?: string | null;
        floor?: number | null;
        slotNumber: string;
      }>,
    ) =>
      request<SocietyFlatImportResultDto>(
        `/v1/manage/societies/${societyId}/parkings/import`,
        {
          method: "POST",
          body: JSON.stringify({ rows }),
        },
      ),
    updateManageSocietyParking: (
      societyId: string,
      parkingId: string,
      body: {
        kind: "puzzle" | "open";
        wing?: string | null;
        floor?: number | null;
        slotNumber: string;
      },
    ) =>
      request<ParkingSlotDto>(
        `/v1/manage/societies/${societyId}/parkings/${parkingId}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    deleteManageSocietyParking: (societyId: string, parkingId: string) =>
      request<{ ok: true }>(
        `/v1/manage/societies/${societyId}/parkings/${parkingId}`,
        { method: "DELETE" },
      ),

    listPlatformUsers: (q?: string) => {
      const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      return request<PlatformUserDto[]>(`/v1/manage/users${query}`);
    },
    getPlatformUser: (id: string) =>
      request<PlatformUserDto>(`/v1/manage/users/${id}`),
    listUserActivity: (userId: string) =>
      request<ActivityEventDto[]>(`/v1/manage/users/${userId}/activity`),
    listPlatformActivity: () =>
      request<ActivityEventDto[]>("/v1/manage/activity"),

    listBuildings: (societyId: string) =>
      request<BuildingDto[]>(`/v1/societies/${societyId}/buildings`),
    createBuilding: (societyId: string, name: string) =>
      request<BuildingDto>(`/v1/societies/${societyId}/buildings`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    listWings: (buildingId: string) =>
      request<WingDto[]>(`/v1/buildings/${buildingId}/wings`),
    createWing: (buildingId: string, name: string) =>
      request<WingDto>(`/v1/buildings/${buildingId}/wings`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    listFlatsForWing: (wingId: string) =>
      request<FlatDto[]>(`/v1/wings/${wingId}/flats`),
    createFlat: (
      wingId: string,
      body: {
        number: string;
        floor?: number | null;
        parkingSlot?: string | null;
        details?: Record<string, string> | null;
      } | string,
    ) =>
      request<FlatDto>(`/v1/wings/${wingId}/flats`, {
        method: "POST",
        body: JSON.stringify(
          typeof body === "string" ? { number: body } : body,
        ),
      }),

    listInvitations: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: "pending" | "accepted" | "revoked" | "expired";
      role?: string;
    }) =>
      request<Paginated<InvitationDto>>(`/v1/invitations${toQuery(params)}`),
    createInvitation: (body: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      role: string;
      flatId?: string | null;
      residentType?: ResidentType | null;
      expiresInDays?: number;
      channels?: Array<"email" | "whatsapp">;
    }) =>
      request<InvitationDto>("/v1/invitations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    resendInvitation: (id: string) =>
      request<InvitationDto>(`/v1/invitations/${id}/resend`, { method: "POST" }),
    revokeInvitation: (id: string) =>
      request<InvitationDto>(`/v1/invitations/${id}/revoke`, {
        method: "POST",
      }),
    /** Public: inspect an invite before signing in. */
    getInvitation: (token: string) =>
      request<{
        societyName: string | null;
        name: string | null;
        email: string | null;
        phone: string | null;
        role: string;
        residentType: ResidentType | null;
        flatNumber: string | null;
        expiresAt: string | null;
      }>(`/v1/invites/${encodeURIComponent(token)}`, {}, false),
    acceptInvitation: (body: {
      token: string;
      name?: string;
      phone?: string;
      email?: string | null;
    }) =>
      request<{
        ok: true;
        userId: string;
        residentId: string | null;
        tenantId: string;
        role: string;
      }>("/v1/invites/accept", { method: "POST", body: JSON.stringify(body) }, false),

    listBills: (page = 1, limit = 20) =>
      request<Paginated<BillDto>>(`/v1/bills?page=${page}&limit=${limit}`),
    myBills: () => request<BillDto[]>("/v1/bills/mine"),
    generateBills: (body: {
      periodYm: string;
      amountPaise: number;
      reason: string;
      notes?: string | null;
      flatIds?: string[];
    }) =>
      request<{ created: number }>("/v1/bills/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getBill: (id: string) => request<BillDto>(`/v1/bills/${id}`),
    deleteBill: (id: string, body?: { corrected?: boolean }) =>
      request<{ ok: true; status: string }>(`/v1/bills/${id}`, {
        method: "DELETE",
        body: JSON.stringify(body ?? {}),
      }),
    notifyBill: (id: string) =>
      request<{ ok: true; notified: number }>(`/v1/bills/${id}/notify`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    listPayments: (page = 1, limit = 20) =>
      request<Paginated<PaymentDto>>(`/v1/payments?page=${page}&limit=${limit}`),
    myPayments: () => request<PaymentDto[]>("/v1/payments/mine"),
    recordPayment: (body: {
      billId?: string | null;
      flatId: string;
      amountPaise: number;
      method: string;
      receiptNumber?: string | null;
    }) =>
      request<PaymentDto>("/v1/payments", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    payBillMock: (billId: string) =>
      request<PaymentDto>(`/v1/payments/mock`, {
        method: "POST",
        body: JSON.stringify({ billId }),
      }),
    getPaymentAccount: () => request<PaymentAccountDto>("/v1/payments/account"),
    updatePaymentAccount: (body: {
      upiId?: string | null;
      accountName?: string | null;
      accountNumber?: string | null;
      ifsc?: string | null;
    }) =>
      request<PaymentAccountDto>("/v1/payments/account", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    uploadPaymentQr: (file: File) => {
      const data = new FormData();
      data.append("file", file);
      return request<PaymentAccountDto>("/v1/payments/account/qr", {
        method: "POST",
        body: data,
      });
    },
    submitOfflinePayment: (billId: string, file: File) => {
      const data = new FormData();
      data.append("billId", billId);
      data.append("file", file);
      return request<PaymentDto>("/v1/payments/offline", {
        method: "POST",
        body: data,
      });
    },
    acknowledgePayment: (id: string, note?: string | null) =>
      request<PaymentDto>(`/v1/payments/${id}/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ note: note ?? null }),
      }),
    rejectPayment: (id: string, note?: string | null) =>
      request<PaymentDto>(`/v1/payments/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: note ?? null }),
      }),

    listNotices: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: "published" | "draft";
      sort?: "createdAt" | "publishedAt" | "title";
      order?: "asc" | "desc";
    }) =>
      request<Paginated<NoticeDto>>(`/v1/notices${toQuery(params)}`),
    getNotice: (id: string) => request<NoticeDto>(`/v1/notices/${id}`),
    createNotice: (body: {
      title: string;
      body: string;
      audience: string;
      wingId?: string | null;
      flatId?: string | null;
    }) =>
      request<NoticeDto>("/v1/notices", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateNotice: (
      id: string,
      body: { title?: string; body?: string },
    ) =>
      request<NoticeDto>(`/v1/notices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    uploadNoticeAttachment: (id: string, file: File) => {
      const data = new FormData();
      data.append("file", file);
      return request<NoticeDto>(`/v1/notices/${id}/attachments`, {
        method: "POST",
        body: data,
      });
    },
    deleteNoticeAttachment: (noticeId: string, attachmentId: string) =>
      request<NoticeDto>(`/v1/notices/${noticeId}/attachments/${attachmentId}`, {
        method: "DELETE",
      }),
    publishNotice: (id: string) =>
      request<NoticeDto>(`/v1/notices/${id}/publish`, { method: "POST" }),
    unpublishNotice: (id: string) =>
      request<NoticeDto>(`/v1/notices/${id}/unpublish`, { method: "POST" }),
    markNoticeRead: (id: string) =>
      request<{ ok: true }>(`/v1/notices/${id}/read`, { method: "POST" }),

    listNotifications: (page = 1, limit = 20) =>
      request<Paginated<NotificationDto>>(
        `/v1/notifications?page=${page}&limit=${limit}`,
      ),
    notificationsUnreadCount: () =>
      request<{ unread: number }>("/v1/notifications/unread-count"),
    markAllNotificationsRead: () =>
      request<{ ok: true }>("/v1/notifications/read-all", { method: "POST" }),
    markNotificationRead: (id: string) =>
      request<NotificationDto>(`/v1/notifications/${id}/read`, {
        method: "POST",
      }),

    getDashboardStats: (opts?: { mine?: boolean }) =>
      request<DashboardStatsDto>(
        `/v1/dashboard/stats${opts?.mine ? "?mine=1" : ""}`,
      ),

    getSocietySettings: () =>
      request<{
        id: string;
        name: string;
        slaDays: number;
        billingDefaults: string | null;
        status: "active" | "suspended";
        featureFlagsJson: string | null;
        planId: string | null;
      }>("/v1/society/settings"),
    updateSocietySettings: (body: {
      slaDays?: number;
      billingDefaults?: string | null;
    }) =>
      request<{ ok: true }>("/v1/society/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    listSupportTickets: () => request<SupportTicketDto[]>("/v1/support/tickets"),
    createSupportTicket: (body: { subject: string; body: string }) =>
      request<SupportTicketDto>("/v1/support/tickets", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    listAuditLogs: (search?: string) => {
      const query = search ? `?q=${encodeURIComponent(search)}` : "";
      return request<AuditLogDto[]>(`/v1/audit-logs${query}`);
    },

    listTeam: () => request<TeamMemberDto[]>("/v1/team"),
    addTeamMember: (body: {
      userId?: string;
      name?: string;
      email?: string | null;
      phone?: string | null;
      role:
        | "chairperson"
        | "admin"
        | "secretary"
        | "treasurer"
        | "cashier"
        | "committee";
    }) =>
      request<TeamMemberDto[]>("/v1/team/members", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    changeTeamRole: (userId: string, fromRole: string, toRole: string) =>
      request<TeamMemberDto[]>(`/v1/team/members/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ fromRole, toRole }),
      }),
    removeTeamRole: (userId: string, role: string) =>
      request<TeamMemberDto[]>(`/v1/team/members/${userId}/roles/${role}`, {
        method: "DELETE",
      }),
    updateTeamMember: (
      userId: string,
      body: {
        email?: string;
        phone?: string;
        name?: string;
        role?:
          | "chairperson"
          | "admin"
          | "secretary"
          | "treasurer"
          | "cashier"
          | "committee";
      },
    ) =>
      request<TeamMemberDto>(`/v1/team/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    removeTeamMember: (userId: string) =>
      request<{ ok: true }>(`/v1/team/${userId}`, { method: "DELETE" }),

    listVisitors: (page = 1, limit = 20) =>
      request<Paginated<VisitorDto>>(`/v1/visitors?page=${page}&limit=${limit}`),
    createVisitor: (body: {
      visitorName: string;
      flatId?: string;
      phone?: string | null;
      purpose?: string | null;
      expectedAt?: string | null;
    }) =>
      request<VisitorDto>("/v1/visitors", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    checkInVisitor: (id: string) =>
      request<VisitorDto>(`/v1/visitors/${id}/check-in`, { method: "POST" }),
    checkOutVisitor: (id: string) =>
      request<VisitorDto>(`/v1/visitors/${id}/check-out`, { method: "POST" }),
    deleteVisitor: (id: string) =>
      request<{ ok: true }>(`/v1/visitors/${id}`, { method: "DELETE" }),

    listParkingSlots: (page = 1, limit = 50) =>
      request<Paginated<ParkingSlotDto>>(`/v1/parking?page=${page}&limit=${limit}`),
    createParkingSlot: (body: {
      slotNumber: string;
      type?: string;
      vehicleNumber?: string | null;
      flatId?: string | null;
    }) =>
      request<ParkingSlotDto>("/v1/parking", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    assignParking: (id: string, flatId: string) =>
      request<ParkingSlotDto>(`/v1/parking/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({ flatId }),
      }),
    releaseParking: (id: string) =>
      request<ParkingSlotDto>(`/v1/parking/${id}/release`, { method: "POST" }),

    listBookings: (page = 1, limit = 20) =>
      request<Paginated<BookingDto>>(`/v1/bookings?page=${page}&limit=${limit}`),
    createBooking: (body: {
      facilityName: string;
      startAt: string;
      endAt: string;
      flatId?: string;
    }) =>
      request<BookingDto>("/v1/bookings", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateBookingStatus: (
      id: string,
      status: "pending" | "confirmed" | "cancelled",
    ) =>
      request<BookingDto>(`/v1/bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    deleteBooking: (id: string) =>
      request<{ ok: true }>(`/v1/bookings/${id}`, { method: "DELETE" }),

    listAssets: (page = 1, limit = 20) =>
      request<Paginated<AssetDto>>(`/v1/assets?page=${page}&limit=${limit}`),
    createAsset: (body: {
      name: string;
      category?: string | null;
      location?: string | null;
      value?: number | null;
      notes?: string | null;
      nextServiceAt?: string | null;
    }) =>
      request<AssetDto>("/v1/assets", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateAsset: (id: string, body: Record<string, unknown>) =>
      request<AssetDto>(`/v1/assets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteAsset: (id: string) =>
      request<{ ok: true }>(`/v1/assets/${id}`, { method: "DELETE" }),

    listVendors: (page = 1, limit = 20) =>
      request<Paginated<VendorDto>>(`/v1/vendors?page=${page}&limit=${limit}`),
    createVendor: (body: {
      name: string;
      category?: string | null;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
    }) =>
      request<VendorDto>("/v1/vendors", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateVendor: (id: string, body: Record<string, unknown>) =>
      request<VendorDto>(`/v1/vendors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteVendor: (id: string) =>
      request<{ ok: true }>(`/v1/vendors/${id}`, { method: "DELETE" }),

    listEvents: (page = 1, limit = 20) =>
      request<Paginated<EventDto>>(`/v1/events?page=${page}&limit=${limit}`),
    createEvent: (body: {
      title: string;
      description?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      location?: string | null;
      capacity?: number | null;
    }) =>
      request<EventDto>("/v1/events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateEvent: (id: string, body: Record<string, unknown>) =>
      request<EventDto>(`/v1/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    rsvpEvent: (id: string) =>
      request<EventDto>(`/v1/events/${id}/rsvp`, { method: "POST" }),
    cancelEventRsvp: (id: string) =>
      request<{ ok: true }>(`/v1/events/${id}/rsvp`, { method: "DELETE" }),
    deleteEvent: (id: string) =>
      request<{ ok: true }>(`/v1/events/${id}`, { method: "DELETE" }),

    // Manage commercial
    listPlatformPlans: () => request<PlatformPlanDto[]>("/v1/manage/plans"),
    listPlatformSubscriptions: () =>
      request<PlatformSubscriptionDto[]>("/v1/manage/subscriptions"),
    assignPlatformSubscription: (body: {
      tenantId: string;
      planId: string;
      cycle?: "monthly" | "yearly";
    }) =>
      request<PlatformSubscriptionDto>("/v1/manage/subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listPlatformDiscounts: () =>
      request<PlatformDiscountDto[]>("/v1/manage/discounts"),
    createPlatformDiscount: (body: Record<string, unknown>) =>
      request<PlatformDiscountDto>("/v1/manage/discounts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listPlatformBills: () => request<PlatformBillDto[]>("/v1/manage/platform-bills"),
    generatePlatformBill: (body: {
      tenantId: string;
      periodYm: string;
      amountPaise?: number;
      notes?: string | null;
    }) =>
      request<PlatformBillDto>("/v1/manage/platform-bills/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    markPlatformBillPaid: (id: string) =>
      request<{ ok: true }>(`/v1/manage/platform-bills/${id}/mark-paid`, {
        method: "POST",
      }),
    listPlatformAnnouncements: () =>
      request<PlatformAnnouncementDto[]>("/v1/manage/announcements"),
    createPlatformAnnouncement: (body: {
      title: string;
      body: string;
      audience?: "all" | "tenants";
      tenantIds?: string[];
      publishNow?: boolean;
    }) =>
      request<PlatformAnnouncementDto>("/v1/manage/announcements", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    listManageSupportTickets: () =>
      request<SupportTicketDto[]>("/v1/manage/support-tickets"),
    replySupportTicket: (id: string, body: { reply: string; close?: boolean }) =>
      request<{ ok: true }>(`/v1/manage/support-tickets/${id}/reply`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getIntegrationsHealth: () =>
      request<IntegrationHealthDto>("/v1/manage/integrations/health"),
    updateManageSocietySettings: (
      id: string,
      body: {
        slaDays?: number;
        billingDefaults?: string | null;
        status?: "active" | "suspended";
        featureFlagsJson?: string | null;
        planId?: string | null;
      },
    ) =>
      request<{ ok: true }>(`/v1/manage/societies/${id}/settings`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };
}

export type SocietyHubClient = ReturnType<typeof createSocietyHubClient>;
