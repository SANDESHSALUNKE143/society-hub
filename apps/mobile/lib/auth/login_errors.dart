import 'dart:developer' as developer;

import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../api/models.dart';

const loginLogName = 'SocietyHub.Login';

/// Logcat / `flutter logs` — never log ID tokens, passwords, or OTP codes.
void logLoginFailure(Object error, [StackTrace? stack]) {
  if (error is GoogleSignInException) {
    developer.log(
      googleSignInDiagnostic(error),
      name: loginLogName,
      stackTrace: stack,
    );
    return;
  }
  if (error is ApiException) {
    developer.log(
      'API ${error.code} status=${error.statusCode}',
      name: loginLogName,
      stackTrace: stack,
    );
    return;
  }
  if (error is PlatformException) {
    developer.log(
      'Platform ${error.code}',
      name: loginLogName,
      stackTrace: stack,
    );
    return;
  }
  developer.log(
    error.runtimeType.toString(),
    name: loginLogName,
    stackTrace: stack,
  );
}

/// User-facing login copy. Keep API codes and platform dumps out of the UI.
String loginErrorText(Object error) {
  if (error is ApiException) {
    return switch (error.code) {
      'not_onboarded' =>
        'This Google or phone is not onboarded. Ask your society admin to add you, then try again.',
      'invalid_google_token' => _playGoogleSetupHint,
      'invalid_credentials' =>
        'Email or password is incorrect.',
      'pin_invalid' => 'That PIN is incorrect.',
      'pin_not_set' =>
        'No PIN is set for this mobile. Sign in with OTP or Google first, then set a PIN in Account.',
      'invalid_otp' || 'otp_invalid' || 'otp_expired' =>
        'That OTP is wrong or has expired. Request a new code.',
      'http_error' => _networkOrTimeout(error.message, error.statusCode),
      _ => error.statusCode == 404
          ? _unreachableServer
          : error.message.trim().isEmpty
              ? 'Sign-in failed. Try OTP or email.'
              : error.message,
    };
  }

  if (error is GoogleSignInException) {
    final message = switch (error.code) {
      GoogleSignInExceptionCode.canceled => googleCanceledMessage(error),
      _ => _playGoogleSetupHint,
    };
    return '$message\n${googleSignInDiagnostic(error)}';
  }

  if (error is PlatformException && _isGoogleDeveloperError(error)) {
    return _playGoogleSetupHint;
  }

  final raw = error.toString();
  final lower = raw.toLowerCase();
  if (_looksLikeGoogleDeveloperError(lower)) {
    return _playGoogleSetupHint;
  }
  if (lower.contains('cancelled') || lower.contains('canceled')) {
    return googleSignInDidNotComplete;
  }
  if (lower.contains('id token') || lower.contains('sha-1')) {
    return _playGoogleSetupHint;
  }
  if (lower.contains('not configured')) {
    return 'Google Sign-In is not configured in this build. Use OTP or email.';
  }
  if (lower.contains('socket') ||
      lower.contains('timed out') ||
      lower.contains('timeout') ||
      lower.contains('connection')) {
    return 'Cannot reach the server. Wait a minute if the API is waking up, then try again.';
  }
  if (_looksLikePlatformDump(raw)) {
    return 'Google sign-in failed. Try OTP or email.';
  }
  final stripped = raw.replaceFirst(RegExp(r'^[^:]+:\s*'), '').trim();
  if (stripped.isEmpty || _looksLikePlatformDump(stripped)) {
    return 'Sign-in failed. Try OTP or email.';
  }
  return stripped;
}

const googleSignInDidNotComplete =
    'Google Sign-In did not complete. Try again, or use OTP or email.';

const _playGoogleSetupHint =
    'Google Sign-In is not ready on this install (error 10). Use OTP or email.';

/// Credential Manager reports [GoogleSignInExceptionCode.canceled] for real
/// dismissals *and* SHA / OAuth misconfig. Inspect the description.
String googleCanceledMessage(GoogleSignInException error) {
  final blob = '${error.description ?? ''} ${error.details ?? ''}'.toLowerCase();
  if (blob.contains('reauth') ||
      blob.contains('[16]') ||
      blob.contains('developer') ||
      blob.contains('activity is cancelled by the user') ||
      blob.contains('activity is canceled by the user')) {
    return 'Google Sign-In is not ready on this Play install. Use OTP or email.';
  }
  return googleSignInDidNotComplete;
}

/// Safe one-line Google SDK detail for screenshots and logcat. No tokens.
String googleSignInDiagnostic(GoogleSignInException error) {
  final code = error.code.name;
  var desc = (error.description ?? '').trim();
  if (desc.startsWith('eyJ') || desc.contains('id_token')) {
    desc = '';
  }
  if (desc.length > 180) {
    desc = '${desc.substring(0, 180)}…';
  }
  if (desc.isEmpty) return 'Google [$code]';
  return 'Google [$code] $desc';
}

bool _isGoogleDeveloperError(PlatformException error) {
  final blob = '${error.code} ${error.message} ${error.details}'.toLowerCase();
  return _looksLikeGoogleDeveloperError(blob);
}

bool _looksLikeGoogleDeveloperError(String lower) {
  if (lower.contains('developer_error')) return true;
  if (lower.contains('apiexception: 10')) return true;
  if (lower.contains('api exception: 10')) return true;
  if (RegExp(r'(^|[^0-9])10:\s*(,|null|$)').hasMatch(lower)) return true;
  return lower.contains('sign_in_failed') &&
      RegExp(r'(^|[^0-9])10([^0-9]|$)').hasMatch(lower);
}

bool _looksLikePlatformDump(String text) {
  final lower = text.toLowerCase();
  return lower.contains('null, null') ||
      lower.contains('platformexception') ||
      RegExp(r'^\s*\d+:\s*,').hasMatch(text);
}

const _unreachableServer =
    'Cannot reach the SocietyHub server. Wait a minute if it is waking up, then try again. If this keeps happening, install the latest app update.';

String _networkOrTimeout(String message, int? statusCode) {
  final lower = message.toLowerCase();
  if (statusCode == 404 ||
      statusCode == 502 ||
      statusCode == 503 ||
      lower.contains('status code of 404') ||
      lower.contains('cannot post') ||
      lower.contains('cannot get')) {
    return _unreachableServer;
  }
  if (lower.contains('timed out') ||
      lower.contains('timeout') ||
      lower.contains('connection')) {
    return 'Cannot reach the server. Wait a minute if the API is waking up, then try again.';
  }
  return message.trim().isEmpty
      ? 'Network error. Check your connection and try again.'
      : message;
}
