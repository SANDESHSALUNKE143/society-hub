import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models.dart';
import '../api/society_hub_api.dart';
import '../config/api_config.dart';

const accessTokenStorageKey = 'sh_mobile_access';
const refreshTokenStorageKey = 'sh_mobile_refresh';
const userStorageKey = 'sh_mobile_user';

/// Roles allowed in Client App (mirrors web `auth.tsx`).
const allowedRoles = {
  'superadmin',
  'chairperson',
  'admin',
  'secretary',
  'treasurer',
  'cashier',
  'committee',
  'resident',
  'tenant',
};

enum AppMode { admin, resident }

bool canUseAdminMode(String? role) {
  if (role == null) return false;
  return {
    'superadmin',
    'chairperson',
    'admin',
    'secretary',
    'treasurer',
    'cashier',
    'committee',
  }.contains(role);
}

/// Society-wide flat picker is Admin mode only (FR-CMP-1).
bool canPickComplaintFlat(String? role, AppMode mode) {
  return canUseAdminMode(role) && mode == AppMode.admin;
}

bool isPlatformRole(String? role) => role == 'superadmin';

class SessionState {
  const SessionState({
    this.user,
    this.loading = true,
    this.mode = AppMode.resident,
  });

  final UserDto? user;
  final bool loading;
  final AppMode mode;

  SessionState copyWith({
    UserDto? user,
    bool? loading,
    AppMode? mode,
    bool clearUser = false,
  }) {
    return SessionState(
      user: clearUser ? null : (user ?? this.user),
      loading: loading ?? this.loading,
      mode: mode ?? this.mode,
    );
  }
}

final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});

final apiConfigProvider = Provider<ApiConfig>((ref) {
  return ApiConfig.fromEnvironment();
});

/// When true, skip reading secure storage / calling `/me` on startup (tests).
final skipSessionRestoreProvider = Provider<bool>((ref) => false);

/// Optional Dio injection for tests — wired via [SessionController.replaceApiForTest].
final sessionProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);

class SessionController extends Notifier<SessionState> {
  late FlutterSecureStorage _storage;
  late SocietyHubApi api;
  String? _access;
  String? _refresh;

  @override
  SessionState build() {
    _storage = ref.watch(secureStorageProvider);
    final config = ref.watch(apiConfigProvider);
    api = SocietyHubApi(
      config: config,
      getAccessToken: () => _access,
      getRefreshToken: () => _refresh,
      onTokens: _persistTokens,
      onSessionInvalid: clearSession,
    );
    final skip = ref.watch(skipSessionRestoreProvider);
    if (!skip) {
      Future.microtask(_restore);
      return const SessionState();
    }
    return const SessionState(loading: false);
  }

  /// Swap API client after build (unit / widget tests with mocked Dio).
  @visibleForTesting
  void replaceApiForTest(SocietyHubApi next) {
    api = next;
  }

  Future<void> _restore() async {
    try {
      _access = await _storage.read(key: accessTokenStorageKey);
      _refresh = await _storage.read(key: refreshTokenStorageKey);
      final raw = await _storage.read(key: userStorageKey);
      if (_access == null || raw == null) {
        state = state.copyWith(loading: false, clearUser: true);
        return;
      }
      final user = UserDto.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      if (!allowedRoles.contains(user.role)) {
        await clearSession();
        return;
      }
      state = state.copyWith(
        user: user,
        loading: false,
        mode: _defaultMode(user.role),
      );
      try {
        final me = await api.me();
        if (!allowedRoles.contains(me.role)) {
          await clearSession();
          return;
        }
        await _persistUser(me);
        state = state.copyWith(user: me, mode: _defaultMode(me.role));
      } catch (_) {
        await clearSession();
      }
    } catch (_) {
      state = state.copyWith(loading: false, clearUser: true);
    }
  }

  AppMode _defaultMode(String role) {
    if (isPlatformRole(role) || canUseAdminMode(role)) {
      return AppMode.admin;
    }
    return AppMode.resident;
  }

  Future<void> _persistTokens(AuthTokens tokens) async {
    _access = tokens.accessToken;
    _refresh = tokens.refreshToken;
    await _storage.write(key: accessTokenStorageKey, value: tokens.accessToken);
    await _storage.write(key: refreshTokenStorageKey, value: tokens.refreshToken);
  }

  Future<void> _persistUser(UserDto user) async {
    await _storage.write(key: userStorageKey, value: jsonEncode(user.toJson()));
  }

  Future<void> setSession(UserDto user, AuthTokens tokens) async {
    if (!allowedRoles.contains(user.role)) {
      await clearSession();
      throw ApiException(
        code: 'role_not_allowed',
        message: 'This account cannot use the Client App.',
      );
    }
    await _persistTokens(tokens);
    await _persistUser(user);
    state = state.copyWith(
      user: user,
      loading: false,
      mode: _defaultMode(user.role),
    );
  }

  Future<void> clearSession() async {
    final refresh = _refresh;
    _access = null;
    _refresh = null;
    await _storage.delete(key: accessTokenStorageKey);
    await _storage.delete(key: refreshTokenStorageKey);
    await _storage.delete(key: userStorageKey);
    if (refresh != null && refresh.isNotEmpty) {
      try {
        await api.logout(refresh);
      } catch (_) {}
    }
    state = const SessionState(loading: false);
  }

  void setMode(AppMode mode) {
    final user = state.user;
    if (user == null) return;
    if (mode == AppMode.admin && !canUseAdminMode(user.role)) return;
    state = state.copyWith(mode: mode);
  }

  bool get isStaffView {
    final user = state.user;
    if (user == null) return false;
    return canPickComplaintFlat(user.role, state.mode);
  }

  String? get debugAccessToken => _access;
  String? get debugRefreshToken => _refresh;
}

final apiProvider = Provider<SocietyHubApi>((ref) {
  return ref.watch(sessionProvider.notifier).api;
});
