import '../api/models.dart';

/// User-facing login copy. Keep API codes out of the UI.
String loginErrorText(Object error) {
  if (error is ApiException) {
    return switch (error.code) {
      'not_onboarded' =>
        'This Google or phone is not onboarded. Ask your society admin to add you, then try again.',
      'invalid_google_token' =>
        'Google could not verify this sign-in. Add the Play App Signing SHA-1 to societyhub-android, wait a few minutes, then try again. Or use OTP.',
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

  final raw = error.toString().replaceFirst(RegExp(r'^[^:]+:\s*'), '');
  final lower = raw.toLowerCase();
  if (lower.contains('cancelled')) {
    return 'Google sign-in was cancelled. Try again, or use OTP or email.';
  }
  if (lower.contains('id token') || lower.contains('sha-1')) {
    return 'Google did not return an ID token. In Play Console → App integrity, copy the App signing SHA-1 and add it to the Android OAuth client societyhub-android.';
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
  return raw.trim().isEmpty ? 'Sign-in failed. Try OTP or email.' : raw;
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
