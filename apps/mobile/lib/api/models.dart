class ApiException implements Exception {
  ApiException({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
  });

  final String code;
  final String message;
  final int? statusCode;
  final Object? details;

  @override
  String toString() => message;
}

class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresIn: (json['expiresIn'] as num).toInt(),
    );
  }
}

class UserDto {
  const UserDto({
    required this.id,
    required this.phone,
    required this.email,
    required this.name,
    required this.username,
    required this.role,
    required this.tenantId,
    required this.flatId,
    required this.flatNumber,
    required this.hasPin,
  });

  final String id;
  final String? phone;
  final String? email;
  final String? name;
  final String? username;
  final String role;
  final String tenantId;
  final String? flatId;
  final String? flatNumber;
  final bool hasPin;

  factory UserDto.fromJson(Map<String, dynamic> json) {
    return UserDto(
      id: json['id'] as String,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      name: json['name'] as String?,
      username: json['username'] as String?,
      role: json['role'] as String,
      tenantId: json['tenantId'] as String,
      flatId: json['flatId'] as String?,
      flatNumber: json['flatNumber'] as String?,
      hasPin: json['hasPin'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone': phone,
        'email': email,
        'name': name,
        'username': username,
        'role': role,
        'tenantId': tenantId,
        'flatId': flatId,
        'flatNumber': flatNumber,
        'hasPin': hasPin,
      };
}

class MembershipDto {
  const MembershipDto({
    required this.tenantId,
    required this.societyName,
    required this.role,
    required this.canUseAdminMode,
  });

  final String tenantId;
  final String societyName;
  final String role;
  final bool canUseAdminMode;

  factory MembershipDto.fromJson(Map<String, dynamic> json) {
    return MembershipDto(
      tenantId: json['tenantId'] as String,
      societyName: json['societyName'] as String,
      role: json['role'] as String,
      canUseAdminMode: json['canUseAdminMode'] as bool? ?? false,
    );
  }
}

class FlatDto {
  const FlatDto({
    required this.id,
    required this.number,
    required this.wingName,
    this.floor,
    this.parkingSlot,
    this.pngGasConnection = false,
    this.twoWheelerCount = 0,
    this.fourWheelerCount = 0,
    this.adultCount = 0,
    this.childCount = 0,
    this.seniorCitizenCount = 0,
  });

  final String id;
  final String number;
  final String? wingName;
  final int? floor;
  final String? parkingSlot;
  final bool pngGasConnection;
  final int twoWheelerCount;
  final int fourWheelerCount;
  final int adultCount;
  final int childCount;
  final int seniorCitizenCount;

  factory FlatDto.fromJson(Map<String, dynamic> json) {
    return FlatDto(
      id: json['id'] as String,
      number: json['number'] as String,
      wingName: json['wingName'] as String?,
      floor: (json['floor'] as num?)?.toInt(),
      parkingSlot: json['parkingSlot'] as String?,
      pngGasConnection: json['pngGasConnection'] as bool? ?? false,
      twoWheelerCount: (json['twoWheelerCount'] as num?)?.toInt() ?? 0,
      fourWheelerCount: (json['fourWheelerCount'] as num?)?.toInt() ?? 0,
      adultCount: (json['adultCount'] as num?)?.toInt() ?? 0,
      childCount: (json['childCount'] as num?)?.toInt() ?? 0,
      seniorCitizenCount: (json['seniorCitizenCount'] as num?)?.toInt() ?? 0,
    );
  }

  String get label {
    if (wingName == null || wingName!.isEmpty) return number;
    return '$wingName-$number';
  }
}

class ComplaintAttachmentDto {
  const ComplaintAttachmentDto({
    required this.id,
    required this.contentKind,
    required this.contentType,
    required this.url,
    required this.byteSize,
  });

  final String id;
  final String contentKind;
  final String contentType;
  final String url;
  final int byteSize;

  factory ComplaintAttachmentDto.fromJson(Map<String, dynamic> json) {
    return ComplaintAttachmentDto(
      id: json['id'] as String,
      contentKind: json['contentKind'] as String? ?? 'image',
      contentType: json['contentType'] as String? ?? '',
      url: json['url'] as String? ?? '',
      byteSize: (json['byteSize'] as num?)?.toInt() ?? 0,
    );
  }
}

class ComplaintStatusEventDto {
  const ComplaintStatusEventDto({
    required this.id,
    required this.fromStatus,
    required this.toStatus,
    required this.note,
    required this.actorName,
    required this.createdAt,
  });

  final String id;
  final String? fromStatus;
  final String toStatus;
  final String? note;
  final String? actorName;
  final String createdAt;

  factory ComplaintStatusEventDto.fromJson(Map<String, dynamic> json) {
    return ComplaintStatusEventDto(
      id: json['id'] as String,
      fromStatus: json['fromStatus'] as String?,
      toStatus: json['toStatus'] as String,
      note: json['note'] as String?,
      actorName: json['actorName'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}

class ComplaintDto {
  const ComplaintDto({
    required this.id,
    required this.ticketNumber,
    required this.title,
    required this.type,
    required this.description,
    required this.status,
    required this.flatId,
    required this.flatNumber,
    required this.residentName,
    required this.createdAt,
    this.typeOtherText,
    this.queuePosition,
    this.openAheadCount,
    this.queueHint,
    this.attachments = const [],
    this.statusEvents = const [],
    this.closingNote,
  });

  final String id;
  final String ticketNumber;
  final String title;
  final String type;
  final String? typeOtherText;
  final String description;
  final String status;
  final String flatId;
  final String flatNumber;
  final String? residentName;
  final String createdAt;
  final int? queuePosition;
  final int? openAheadCount;
  final String? queueHint;
  final List<ComplaintAttachmentDto> attachments;
  final List<ComplaintStatusEventDto> statusEvents;
  final String? closingNote;

  factory ComplaintDto.fromJson(Map<String, dynamic> json) {
    final attachmentsJson = json['attachments'] as List<dynamic>? ?? [];
    final eventsJson = json['statusEvents'] as List<dynamic>? ?? [];
    return ComplaintDto(
      id: json['id'] as String,
      ticketNumber: json['ticketNumber'] as String,
      title: json['title'] as String,
      type: json['type'] as String,
      typeOtherText: json['typeOtherText'] as String?,
      description: json['description'] as String? ?? '',
      status: json['status'] as String,
      flatId: json['flatId'] as String? ?? '',
      flatNumber: json['flatNumber'] as String? ?? '',
      residentName: json['residentName'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      queuePosition: (json['queuePosition'] as num?)?.toInt(),
      openAheadCount: (json['openAheadCount'] as num?)?.toInt(),
      queueHint: json['queueHint'] as String?,
      attachments: attachmentsJson
          .map((e) => ComplaintAttachmentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      statusEvents: eventsJson
          .map((e) => ComplaintStatusEventDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      closingNote: json['closingNote'] as String?,
    );
  }
}

class ResidentVehicleDto {
  const ResidentVehicleDto({
    required this.kind,
    required this.registrationNumber,
    required this.parkingPurchased,
    required this.parkingSlot,
  });

  final String kind;
  final String? registrationNumber;
  final bool parkingPurchased;
  final String? parkingSlot;

  factory ResidentVehicleDto.fromJson(Map<String, dynamic> json) {
    return ResidentVehicleDto(
      kind: json['kind'] as String? ?? 'four_wheeler',
      registrationNumber: json['registrationNumber'] as String?,
      parkingPurchased: json['parkingPurchased'] as bool? ?? false,
      parkingSlot: json['parkingSlot'] as String?,
    );
  }
}

class ProfileFlatDto {
  const ProfileFlatDto({
    required this.id,
    required this.number,
    required this.wingName,
    required this.buildingName,
    required this.floor,
    required this.parkingSlot,
    required this.isOwner,
    this.pngGasConnection = false,
    this.adultCount = 0,
    this.childCount = 0,
    this.seniorCitizenCount = 0,
    this.twoWheelerCount = 0,
    this.fourWheelerCount = 0,
  });

  final String id;
  final String number;
  final String? wingName;
  final String? buildingName;
  final int? floor;
  final String? parkingSlot;
  final bool isOwner;
  final bool pngGasConnection;
  final int adultCount;
  final int childCount;
  final int seniorCitizenCount;
  final int twoWheelerCount;
  final int fourWheelerCount;

  factory ProfileFlatDto.fromJson(Map<String, dynamic> json) {
    return ProfileFlatDto(
      id: json['id'] as String,
      number: json['number'] as String,
      wingName: json['wingName'] as String?,
      buildingName: json['buildingName'] as String?,
      floor: (json['floor'] as num?)?.toInt(),
      parkingSlot: json['parkingSlot'] as String?,
      isOwner: json['isOwner'] as bool? ?? false,
      pngGasConnection: json['pngGasConnection'] as bool? ?? false,
      adultCount: (json['adultCount'] as num?)?.toInt() ?? 0,
      childCount: (json['childCount'] as num?)?.toInt() ?? 0,
      seniorCitizenCount: (json['seniorCitizenCount'] as num?)?.toInt() ?? 0,
      twoWheelerCount: (json['twoWheelerCount'] as num?)?.toInt() ?? 0,
      fourWheelerCount: (json['fourWheelerCount'] as num?)?.toInt() ?? 0,
    );
  }

  String get label {
    if (wingName == null || wingName!.isEmpty) return number;
    return '$wingName-$number';
  }
}

class ResidentProfileDto {
  const ResidentProfileDto({
    required this.userId,
    required this.emergencyContact,
    required this.vehicleNumber,
    required this.societyName,
    required this.flat,
    this.vehicles = const [],
  });

  final String userId;
  final String? emergencyContact;
  final String? vehicleNumber;
  final String? societyName;
  final ProfileFlatDto? flat;
  final List<ResidentVehicleDto> vehicles;

  factory ResidentProfileDto.fromJson(Map<String, dynamic> json) {
    final flatJson = json['flat'] as Map<String, dynamic>?;
    final vehiclesJson = json['vehicles'] as List<dynamic>? ?? const [];
    return ResidentProfileDto(
      userId: json['userId'] as String,
      emergencyContact: json['emergencyContact'] as String?,
      vehicleNumber: json['vehicleNumber'] as String?,
      societyName: json['societyName'] as String?,
      flat: flatJson == null ? null : ProfileFlatDto.fromJson(flatJson),
      vehicles: vehiclesJson
          .map((e) => ResidentVehicleDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class DashboardStatsDto {
  const DashboardStatsDto({
    required this.openComplaints,
    required this.totalComplaints,
    required this.duesOutstandingPaise,
    required this.upcomingBookings,
    required this.publishedNotices,
    required this.unreadNotifications,
  });

  final int openComplaints;
  final int totalComplaints;
  final int duesOutstandingPaise;
  final int upcomingBookings;
  final int publishedNotices;
  final int unreadNotifications;

  factory DashboardStatsDto.fromJson(Map<String, dynamic> json) {
    return DashboardStatsDto(
      openComplaints: (json['openComplaints'] as num?)?.toInt() ?? 0,
      totalComplaints: (json['totalComplaints'] as num?)?.toInt() ?? 0,
      duesOutstandingPaise:
          (json['duesOutstandingPaise'] as num?)?.toInt() ?? 0,
      upcomingBookings: (json['upcomingBookings'] as num?)?.toInt() ?? 0,
      publishedNotices: (json['publishedNotices'] as num?)?.toInt() ?? 0,
      unreadNotifications:
          (json['unreadNotifications'] as num?)?.toInt() ?? 0,
    );
  }
}

class TeamMemberDto {
  const TeamMemberDto({
    required this.userId,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
  });

  final String userId;
  final String? name;
  final String? email;
  final String? phone;
  final String role;

  factory TeamMemberDto.fromJson(Map<String, dynamic> json) {
    return TeamMemberDto(
      userId: json['userId'] as String,
      name: json['name'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      role: json['role'] as String,
    );
  }

  String get displayName => name ?? email ?? phone ?? userId;
}

class LoginResult {
  const LoginResult({
    required this.user,
    required this.tokens,
    this.memberships,
  });

  final UserDto user;
  final AuthTokens tokens;
  final List<MembershipDto>? memberships;

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    final membershipsJson = json['memberships'] as List<dynamic>?;
    return LoginResult(
      user: UserDto.fromJson(json['user'] as Map<String, dynamic>),
      tokens: AuthTokens.fromJson(json['tokens'] as Map<String, dynamic>),
      memberships: membershipsJson
          ?.map((e) => MembershipDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class PaginatedComplaints {
  const PaginatedComplaints({
    required this.items,
    required this.page,
    required this.limit,
    required this.total,
  });

  final List<ComplaintDto> items;
  final int page;
  final int limit;
  final int total;

  factory PaginatedComplaints.fromJson(Map<String, dynamic> json) {
    final items = (json['items'] as List<dynamic>? ?? [])
        .map((e) => ComplaintDto.fromJson(e as Map<String, dynamic>))
        .toList();
    return PaginatedComplaints(
      items: items,
      page: (json['page'] as num?)?.toInt() ?? 1,
      limit: (json['limit'] as num?)?.toInt() ?? 20,
      total: (json['total'] as num?)?.toInt() ?? items.length,
    );
  }
}

/// Friendly labels matching web Client App.
const Map<String, String> complaintTypeLabels = {
  'electric': 'Electric',
  'plumbing': 'Plumbing',
  'housekeeping': 'Housekeeping',
  'security': 'Security',
  'lift': 'Lift',
  'other': 'Other',
};

const Map<String, String> complaintStatusLabels = {
  'open': 'In queue',
  'assigned': 'Acknowledged',
  'in_progress': 'In progress',
  'resolved': 'Resolved',
  'closed': 'Closed',
};

String complaintStatusLabel(String status) =>
    complaintStatusLabels[status] ?? status.replaceAll('_', ' ');

String complaintTypeLabel(String type, {String? other}) {
  if (type == 'other' && other != null && other.isNotEmpty) return other;
  return complaintTypeLabels[type] ?? type;
}
