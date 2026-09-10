import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
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
      contains('cancelled'),
    );
  });
}
