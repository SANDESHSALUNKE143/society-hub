import 'dart:async';

import 'package:dio/dio.dart';

import '../config/api_config.dart';
import 'models.dart';

// Public ctor names (getAccessToken, …) differ from private fields by design.
// ignore_for_file: prefer_initializing_formals

typedef TokenGetter = String? Function();
typedef TokensSaver = FutureOr<void> Function(AuthTokens tokens);
typedef SessionCleared = FutureOr<void> Function();

/// Dart mirror of `packages/sdk` — same `/v1` paths and payloads.
class SocietyHubApi {
  SocietyHubApi({
    required ApiConfig config,
    required TokenGetter getAccessToken,
    required TokenGetter getRefreshToken,
    required TokensSaver onTokens,
    required SessionCleared onSessionInvalid,
    Dio? dio,
  })  : _getAccessToken = getAccessToken,
        _getRefreshToken = getRefreshToken,
        _onTokens = onTokens,
        _onSessionInvalid = onSessionInvalid,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: config.baseUrl,
                // Render Hobby cold-starts can take ~60s; keep headroom.
                connectTimeout: const Duration(seconds: 90),
                receiveTimeout: const Duration(seconds: 90),
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.extra['auth'] != false) {
            final token = _getAccessToken();
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final status = error.response?.statusCode;
          final opts = error.requestOptions;
          final alreadyRetried = opts.extra['retried'] == true;
          if (status == 401 &&
              opts.extra['auth'] != false &&
              !alreadyRetried) {
            final refreshed = await _tryRefresh();
            if (refreshed != null) {
              opts.extra['retried'] = true;
              opts.headers['Authorization'] =
                  'Bearer ${refreshed.accessToken}';
              try {
                final clone = await _dio.fetch(opts);
                return handler.resolve(clone);
              } catch (e) {
                if (e is DioException) return handler.next(e);
                return handler.next(error);
              }
            }
            await _onSessionInvalid();
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio _dio;
  final TokenGetter _getAccessToken;
  final TokenGetter _getRefreshToken;
  final TokensSaver _onTokens;
  final SessionCleared _onSessionInvalid;
  Future<AuthTokens?>? _refreshInFlight;

  Future<AuthTokens?> _tryRefresh() {
    return _refreshInFlight ??= () async {
      try {
        final refresh = _getRefreshToken();
        if (refresh == null || refresh.isEmpty) return null;
        final tokens = await refreshTokens(refresh);
        await _onTokens(tokens);
        return tokens;
      } catch (_) {
        return null;
      } finally {
        _refreshInFlight = null;
      }
    }();
  }

  Future<T> _request<T>(
    String path, {
    String method = 'GET',
    Object? data,
    bool auth = true,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await _dio.request<dynamic>(
        path,
        data: data,
        options: Options(
          method: method,
          extra: {'auth': auth},
        ),
      );
      if (res.statusCode == 204 || res.data == null) {
        return parse(null);
      }
      return parse(res.data);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  ApiException _mapError(DioException e) {
    final data = e.response?.data;
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      final apiMessage = map['message'] as String?;
      if (apiMessage != null && apiMessage.trim().isNotEmpty) {
        return ApiException(
          code: map['code'] as String? ?? 'http_error',
          message: apiMessage,
          statusCode: e.response?.statusCode,
          details: map['details'],
        );
      }
    }
    final status = e.response?.statusCode;
    if (status == 404 || status == 502 || status == 503) {
      return ApiException(
        code: 'http_error',
        message: 'Cannot reach the SocietyHub server.',
        statusCode: status,
      );
    }
    return ApiException(
      code: 'http_error',
      message: e.message ?? 'Request failed',
      statusCode: status,
    );
  }

  Future<({bool ok, String? devCode})> requestOtp(String phone) {
    return _request(
      '/v1/auth/otp/request',
      method: 'POST',
      data: {'phone': phone},
      auth: false,
      parse: (json) {
        final map = json as Map<String, dynamic>;
        return (ok: true, devCode: map['devCode'] as String?);
      },
    );
  }

  Future<LoginResult> verifyOtp(String phone, String code) {
    return _request(
      '/v1/auth/otp/verify',
      method: 'POST',
      data: {'phone': phone, 'code': code},
      auth: false,
      parse: (json) => LoginResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<LoginResult> loginPassword(String email, String password) {
    return _request(
      '/v1/auth/password/login',
      method: 'POST',
      data: {'email': email, 'password': password},
      auth: false,
      parse: (json) => LoginResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<LoginResult> loginPin(String phone, String pin) {
    return _request(
      '/v1/auth/pin/login',
      method: 'POST',
      data: {'phone': phone, 'pin': pin},
      auth: false,
      parse: (json) => LoginResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<LoginResult> loginGoogle(String idToken) {
    return _request(
      '/v1/auth/google',
      method: 'POST',
      data: {'idToken': idToken},
      auth: false,
      parse: (json) => LoginResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<AuthTokens> refreshTokens(String refreshToken) {
    return _request(
      '/v1/auth/refresh',
      method: 'POST',
      data: {'refreshToken': refreshToken},
      auth: false,
      parse: (json) => AuthTokens.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> logout(String refreshToken) {
    return _request(
      '/v1/auth/logout',
      method: 'POST',
      data: {'refreshToken': refreshToken},
      parse: (_) {},
    );
  }

  Future<UserDto> me() {
    return _request(
      '/v1/auth/me',
      parse: (json) => UserDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<List<MembershipDto>> listMemberships() {
    return _request(
      '/v1/auth/memberships',
      parse: (json) => (json as List<dynamic>)
          .map((e) => MembershipDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<LoginResult> selectTenant(String tenantId) {
    return _request(
      '/v1/auth/select-tenant',
      method: 'POST',
      data: {'tenantId': tenantId},
      parse: (json) => LoginResult.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> setPin(String pin) {
    return _request(
      '/v1/auth/pin',
      method: 'POST',
      data: {'pin': pin},
      parse: (_) {},
    );
  }

  Future<PaginatedComplaints> listComplaints({
    int page = 1,
    int limit = 20,
    bool mine = false,
  }) {
    final mineQs = mine ? '&mine=1' : '';
    return _request(
      '/v1/complaints?page=$page&limit=$limit$mineQs',
      parse: (json) =>
          PaginatedComplaints.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<ComplaintDto> getComplaint(String id) {
    return _request(
      '/v1/complaints/$id',
      parse: (json) => ComplaintDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<ComplaintDto> createComplaint({
    required String title,
    required String type,
    required String description,
    String? flatId,
    String? typeOtherText,
  }) {
    return _request(
      '/v1/complaints',
      method: 'POST',
      data: {
        'title': title,
        'type': type,
        'description': description,
        'flatId': ?flatId,
        'typeOtherText': ?typeOtherText,
      },
      parse: (json) => ComplaintDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<ComplaintDto> updateComplaint(
    String id, {
    String? title,
    String? type,
    String? typeOtherText,
    String? description,
  }) {
    return _request(
      '/v1/complaints/$id',
      method: 'PATCH',
      data: {
        if (title != null) 'title': title,
        if (type != null) 'type': type,
        if (typeOtherText != null) 'typeOtherText': typeOtherText,
        if (description != null) 'description': description,
      },
      parse: (json) => ComplaintDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<ComplaintDto> addComplaintComment(
    String id,
    String body, {
    String kind = 'comment',
  }) {
    return _request(
      '/v1/complaints/$id/comments',
      method: 'POST',
      data: {'body': body, 'kind': kind},
      parse: (json) => ComplaintDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> deleteComplaint(String id) async {
    await _request<Object?>(
      '/v1/complaints/$id',
      method: 'DELETE',
      parse: (_) => null,
    );
  }

  Future<ComplaintDto> updateComplaintStatus(
    String id,
    String status, {
    String? note,
    String? assignedToUserId,
  }) {
    return _request(
      '/v1/complaints/$id/status',
      method: 'PATCH',
      data: {
        'status': status,
        'note': note,
        'assignedToUserId': assignedToUserId,
      },
      parse: (json) => ComplaintDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<ComplaintDto> uploadAttachment({
    required String complaintId,
    required String filePath,
    required String filename,
  }) async {
    try {
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath, filename: filename),
      });
      final res = await _dio.post<dynamic>(
        '/v1/complaints/$complaintId/attachments',
        data: form,
        options: Options(
          contentType: 'multipart/form-data',
          extra: {'auth': true},
        ),
      );
      return ComplaintDto.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  Future<ResidentProfileDto> getProfile() {
    return _request(
      '/v1/profile',
      parse: (json) =>
          ResidentProfileDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<List<ParkingSlotDto>> listResidentParkings() {
    return _request(
      '/v1/parking',
      parse: (json) => (json as List<dynamic>)
          .map((e) => ParkingSlotDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<ResidentProfileDto> updateProfile({
    String? emergencyContact,
    String? vehicleNumber,
    bool? pngGasConnection,
    int? adultCount,
    int? childCount,
    int? seniorCitizenCount,
    String? parkingSlot,
    String? parkingSlotId,
    List<Map<String, Object?>>? vehicles,
  }) {
    return _request(
      '/v1/profile',
      method: 'PATCH',
      data: {
        'emergencyContact': emergencyContact,
        if (vehicleNumber != null) 'vehicleNumber': vehicleNumber,
        if (pngGasConnection != null) 'pngGasConnection': pngGasConnection,
        if (adultCount != null) 'adultCount': adultCount,
        if (childCount != null) 'childCount': childCount,
        if (seniorCitizenCount != null) 'seniorCitizenCount': seniorCitizenCount,
        if (parkingSlot != null) 'parkingSlot': parkingSlot,
        if (parkingSlotId != null) 'parkingSlotId': parkingSlotId,
        if (vehicles != null) 'vehicles': vehicles,
      },
      parse: (json) =>
          ResidentProfileDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<DashboardStatsDto> getDashboardStats({bool mine = false}) {
    final mineQs = mine ? '?mine=1' : '';
    return _request(
      '/v1/dashboard/stats$mineQs',
      parse: (json) =>
          DashboardStatsDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<List<FlatDto>> listFlats() {
    return _request(
      '/v1/admin/flats',
      parse: (json) => (json as List<dynamic>)
          .map((e) => FlatDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<List<ParkingSlotDto>> listParkings() {
    return _request(
      '/v1/admin/parkings',
      parse: (json) => (json as List<dynamic>)
          .map((e) => ParkingSlotDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<List<TeamMemberDto>> listTeam() {
    return _request(
      '/v1/team',
      parse: (json) => (json as List<dynamic>)
          .map((e) => TeamMemberDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<({String userId, String role, String societyName})> addTeamMember({
    String? email,
    String? phone,
    String? name,
    String role = 'committee',
  }) {
    return _request(
      '/v1/team',
      method: 'POST',
      data: {
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (name != null && name.isNotEmpty) 'name': name,
        'role': role,
      },
      parse: (json) {
        final map = json as Map<String, dynamic>;
        return (
          userId: map['userId'] as String,
          role: map['role'] as String,
          societyName: map['societyName'] as String? ?? '',
        );
      },
    );
  }

  Future<TeamMemberDto> updateTeamMember(
    String userId, {
    String? email,
    String? phone,
    String? name,
    String? role,
  }) {
    return _request(
      '/v1/team/$userId',
      method: 'PATCH',
      data: {
        if (email != null && email.isNotEmpty) 'email': email,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (name != null && name.isNotEmpty) 'name': name,
        if (role != null && role.isNotEmpty) 'role': role,
      },
      parse: (json) => TeamMemberDto.fromJson(json as Map<String, dynamic>),
    );
  }

  Future<void> removeTeamMember(String userId) {
    return _request(
      '/v1/team/$userId',
      method: 'DELETE',
      parse: (_) {},
    );
  }

  Future<List<SocietyResidentDto>> listResidents() {
    return _request(
      '/v1/admin/residents',
      parse: (json) => (json as List<dynamic>)
          .map((e) => SocietyResidentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<List<SocietyResidentDto>> listHouseholdMembers() {
    return _request(
      '/v1/household/members',
      parse: (json) => (json as List<dynamic>)
          .map((e) => SocietyResidentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Future<UserDto> addHouseholdMember({
    required String name,
    required String phone,
    String? email,
  }) {
    return _request(
      '/v1/household/members',
      method: 'POST',
      data: {
        'name': name,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
      },
      parse: (json) {
        final map = json as Map<String, dynamic>;
        final user = map['user'] as Map<String, dynamic>? ?? map;
        return UserDto.fromJson(user);
      },
    );
  }

  Future<UserDto> updateHouseholdMember({
    required String userId,
    required String name,
    required String phone,
    String? email,
  }) {
    return _request(
      '/v1/household/members/$userId',
      method: 'PATCH',
      data: {
        'name': name,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
      },
      parse: (json) {
        final map = json as Map<String, dynamic>;
        final user = map['user'] as Map<String, dynamic>? ?? map;
        return UserDto.fromJson(user);
      },
    );
  }

  Future<void> removeHouseholdMember(String userId) {
    return _request(
      '/v1/household/members/$userId',
      method: 'DELETE',
      parse: (_) {},
    );
  }

  Future<UserDto> onboardResident({
    required String name,
    required String phone,
    required String flatId,
    String? email,
    int? floor,
    String? parkingSlot,
    String? parkingSlotId,
    bool isOwner = true,
    bool editOwner = false,
    String? emergencyContact,
    bool? pngGasConnection,
    int? adultCount,
    int? childCount,
    int? seniorCitizenCount,
    List<Map<String, Object?>>? vehicles,
  }) {
    return _request(
      '/v1/admin/residents',
      method: 'POST',
      data: {
        'name': name,
        'phone': phone,
        'flatId': flatId,
        if (email != null && email.isNotEmpty) 'email': email,
        if (floor != null) 'floor': floor,
        if (parkingSlot != null && parkingSlot.isNotEmpty) 'parkingSlot': parkingSlot,
        if (parkingSlotId != null && parkingSlotId.isNotEmpty)
          'parkingSlotId': parkingSlotId,
        'isOwner': isOwner,
        if (editOwner) 'editOwner': true,
        if (emergencyContact != null && emergencyContact.isNotEmpty)
          'emergencyContact': emergencyContact,
        if (pngGasConnection != null) 'pngGasConnection': pngGasConnection,
        if (adultCount != null) 'adultCount': adultCount,
        if (childCount != null) 'childCount': childCount,
        if (seniorCitizenCount != null) 'seniorCitizenCount': seniorCitizenCount,
        if (vehicles != null) 'vehicles': vehicles,
      },
      parse: (json) {
        final map = json as Map<String, dynamic>;
        final user = map['user'] as Map<String, dynamic>? ?? map;
        return UserDto.fromJson(user);
      },
    );
  }
}
