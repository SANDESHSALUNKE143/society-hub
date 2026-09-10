import 'package:flutter/services.dart';

import '../api/models.dart';

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

  if (error is PlatformException && _isGoogleDeveloperError(error)) {
    return _playGoogleSetupHint;
  }

  final raw = error.toString();
  final lower = raw.toLowerCase();
  if (_looksLikeGoogleDeveloperError(lower)) {
    return _playGoogleSetupHint;
  }
  if (lower.contains('cancelled') || lower.contains('canceled')) {
    return 'Google sign-in was cancelled. Try again, or use OTP or email.';
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

const _playGoogleSetupHint =
    'Google Sign-In is not ready on this install (error 10). Use OTP or email.';

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
