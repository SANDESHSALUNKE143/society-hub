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

  test('maps invalid_google_token to a SHA-1 hint', () {
    expect(
      loginErrorText(
        ApiException(code: 'invalid_google_token', message: 'Google sign-in failed'),
      ),
      contains('SHA-1'),
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

  test('maps a cancelled Google picker', () {
    expect(
      loginErrorText(StateError('Google sign-in was cancelled. Try again.')),
      contains('cancelled'),
    );
  });
}
