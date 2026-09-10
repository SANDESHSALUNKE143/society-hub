import '../api/models.dart';

const _rolePreference = [
  'superadmin',
  'chairperson',
  'admin',
  'secretary',
  'treasurer',
  'cashier',
  'committee',
  'resident',
  'tenant',
];

int _roleRank(String role) {
  final normalized = role == 'admin' ? 'chairperson' : role;
  final index = _rolePreference.indexOf(normalized);
  return index == -1 ? _rolePreference.length : index;
}

/// Choose-society lists one option per society; Admin | Resident switches in-app.
List<MembershipDto> uniqueMembershipsBySociety(List<MembershipDto> rows) {
  final best = <String, MembershipDto>{};
  for (final row in rows) {
    final prev = best[row.tenantId];
    if (prev == null || _roleRank(row.role) < _roleRank(prev.role)) {
      best[row.tenantId] = row;
    }
  }
  return best.values.toList();
}
