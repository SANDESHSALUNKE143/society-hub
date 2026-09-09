import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/core/app_version.dart';

void main() {
  test('formatInstalledVersion includes build number when present', () {
    expect(formatInstalledVersion('1.0.2', '3'), '1.0.2 (3)');
    expect(formatInstalledVersion('1.0.2', ''), '1.0.2');
    expect(formatInstalledVersion('', '3'), 'unknown');
  });
}
