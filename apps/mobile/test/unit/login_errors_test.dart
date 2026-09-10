import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/auth/login_errors.dart';

void main() {
  test('maps not_onboarded to an admin instruction', () {
    expect(
      loginErrorText(
        ApiException(code: 'not_onboarded', message: 'Email is not onboarded'),
      ),
      contains('not onboarded'),
    );
  });

  test('maps invalid_google_token to OTP fallback copy', () {
    expect(
      loginErrorText(
        ApiException(code: 'invalid_google_token', message: 'Google sign-in failed'),
      ),
      contains('Use OTP'),
    );
  });

  test('maps Play Services error 10 instead of leaking 10:, null, null)', () {
    expect(
      loginErrorText(
        PlatformException(
          code: 'sign_in_failed',
          message: 'com.google.android.gms.common.api.ApiException: 10: ',
        ),
      ),
      contains('error 10'),
    );
    expect(
      loginErrorText(StateError('Exception: 10:, null, null)')),
      contains('error 10'),
    );
    expect(
      loginErrorText(StateError('Exception: 10:, null, null)')),
      isNot(contains('null, null')),
    );
  });

  test('maps invalid_credentials to a short password message', () {
    expect(
      loginErrorText(
        ApiException(
          code: 'invalid_credentials',
          message: 'Invalid email or password',
        ),
      ),
      'Email or password is incorrect.',
    );
  });

  test('maps timeouts to a cold-start hint', () {
    expect(
      loginErrorText(
        ApiException(
          code: 'http_error',
          message: 'The connection timed out',
        ),
      ),
      contains('waking up'),
    );
  });

  test('maps HTML 404 dumps to an unreachable-server hint', () {
    expect(
      loginErrorText(
        ApiException(
          code: 'http_error',
          message:
              'This exception was thrown because the response has a status code of 404',
          statusCode: 404,
        ),
      ),
      contains('Cannot reach the SocietyHub server'),
    );
  });

  test('maps a cancelled Google picker', () {
    expect(
      loginErrorText(StateError('Google sign-in was cancelled. Try again.')),
      googleSignInDidNotComplete,
    );
  });

  test('maps Credential Manager configuration errors without leaking dumps', () {
    expect(
      loginErrorText(
        const GoogleSignInException(
          code: GoogleSignInExceptionCode.clientConfigurationError,
          description: 'serverClientId must be provided on Android',
        ),
      ),
      contains('error 10'),
    );
    expect(
      loginErrorText(
        const GoogleSignInException(code: GoogleSignInExceptionCode.canceled),
      ),
      contains(googleSignInDidNotComplete),
    );
    expect(
      loginErrorText(
        const GoogleSignInException(code: GoogleSignInExceptionCode.canceled),
      ),
      contains('Google [canceled]'),
    );
    expect(
      loginErrorText(
        const GoogleSignInException(
          code: GoogleSignInExceptionCode.canceled,
          description: 'Activity is cancelled by the user.',
        ),
      ),
      contains('Play install'),
    );
    expect(
      loginErrorText(
        const GoogleSignInException(
          code: GoogleSignInExceptionCode.canceled,
          description: '[16] Account reauth failed.',
        ),
      ),
      contains('Play install'),
    );
  });

  test('appends a Google diagnostic line without leaking tokens', () {
    expect(
      googleSignInDiagnostic(
        const GoogleSignInException(
          code: GoogleSignInExceptionCode.canceled,
          description: 'Activity is cancelled by the user.',
        ),
      ),
      'Google [canceled] Activity is cancelled by the user.',
    );
    expect(
      loginErrorText(
        const GoogleSignInException(
          code: GoogleSignInExceptionCode.canceled,
          description: 'Activity is cancelled by the user.',
        ),
      ),
      contains('Google [canceled]'),
    );
    expect(
      googleSignInDiagnostic(
        const GoogleSignInException(
          code: GoogleSignInExceptionCode.canceled,
          description: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload',
        ),
      ),
      'Google [canceled]',
    );
  });
}
