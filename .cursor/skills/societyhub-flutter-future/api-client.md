# Flutter ↔ Bun API client standards

Align with [docs/09-API.md](../../../docs/09-API.md) and `packages/sdk`.

## Base contract

| Item | Value |
|------|--------|
| Prefix | `/v1` |
| Auth | `Authorization: Bearer <accessToken>` |
| Body | JSON |
| Errors | `{ "code": string, "message": string, "details"?: unknown }` |

Success payloads follow each endpoint’s documented shape (often nested under resource keys or returned as the object itself — **match Swagger / SDK**, do not invent envelopes).

## Dio setup (pattern)

```dart
final dio = Dio(BaseOptions(
  baseUrl: config.baseUrl, // e.g. https://api.example.com  (paths include /v1/…)
  connectTimeout: const Duration(seconds: 15),
  receiveTimeout: const Duration(seconds: 30),
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
));
```

Path examples (same as SDK):

- `POST /v1/auth/otp/request`
- `POST /v1/auth/otp/verify`
- `POST /v1/auth/password/login`
- `POST /v1/auth/google`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`
- `POST /v1/complaints`

## Interceptors

1. **Auth** — attach `Bearer` from secure session if present.  
2. **Refresh** — on `401`, call refresh **once** (mutex/lock so parallel 401s don’t stampede), update tokens via `onTokens`, retry original request.  
3. **Logging** — debug only; redact `Authorization`, bodies containing `password`, `code`, `refreshToken`, `idToken`.

Mirror `packages/sdk` behavior: get refresh token → `POST /v1/auth/refresh` → save new pair → retry.

## Error mapping

```dart
class ApiException implements Exception {
  ApiException({required this.code, required this.message, this.statusCode, this.details});
  final String code;
  final String message;
  final int? statusCode;
  final Object? details;
}
```

| HTTP | Handling |
|------|----------|
| 400 / validation_error | Show field errors from `details` when present |
| 401 | Refresh or logout |
| 403 | “Not allowed” — do not retry |
| 404 | Feature-specific empty/not found |
| 429 | Back off; show “try again later” |
| 5xx | Generic retry message |

## Repository pattern

```dart
class AuthRepository {
  AuthRepository(this._api, this._session);
  final SocietyHubApi _api;
  final SessionStore _session;

  Future<void> loginWithOtp({required String phone, required String code}) async {
    final res = await _api.auth.verifyOtp(phone: phone, code: code);
    await _session.saveTokens(res.tokens);
    // also persist tenantId / flatId if returned — per API docs
  }
}
```

Widgets call repositories / notifiers — never `dio` directly.

## DTO sync checklist

When adding an endpoint:

1. Confirm path + body in `docs/09-API.md` / Swagger  
2. Add freezed model + `fromJson`  
3. Add method on `SocietyHubApi`  
4. Add repository method  
5. Unit test JSON fixture round-trip  

## Media / blobs

If downloading media with `GET /v1/media/:id`, support Bearer **or** documented `?access_token=` — prefer Bearer in-app. Do not put long-lived refresh tokens in URLs.

## Multi-tenant

After login, if the user belongs to **more than one society**, call `GET /v1/auth/memberships` then `POST /v1/auth/select-tenant`. Memberships are **one row per society** (not per role). Persist active `tenantId` with the session (not only in memory).
