import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/auth/memberships.dart';

MembershipDto _m({
  required String tenantId,
  required String societyName,
  required String role,
}) {
  return MembershipDto(
    tenantId: tenantId,
    societyName: societyName,
    role: role,
    canUseAdminMode: role != 'resident',
  );
}

void main() {
  test('keeps one option per society and prefers chairperson', () {
    final unique = uniqueMembershipsBySociety([
      _m(tenantId: 't1', societyName: 'Keshav Heights', role: 'committee'),
      _m(tenantId: 't1', societyName: 'Keshav Heights', role: 'chairperson'),
      _m(tenantId: 't2', societyName: 'Other Society', role: 'resident'),
    ]);
    expect(unique, hasLength(2));
    expect(unique.first.tenantId, 't1');
    expect(unique.first.role, 'chairperson');
    expect(unique.last.tenantId, 't2');
  });
}
