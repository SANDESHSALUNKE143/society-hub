import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/shared/household_people.dart';

SocietyResidentDto person({
  required String userId,
  required String name,
  String? phone,
  bool isOwner = false,
}) {
  return SocietyResidentDto(
    userId: userId,
    name: name,
    email: null,
    phone: phone,
    flatId: 'f1',
    flatNumber: '101',
    wingName: 'A',
    isOwner: isOwner,
  );
}

void main() {
  test('sorts the owner first and labels roles like web', () {
    final rows = sortHouseholdPeople([
      person(userId: 'f', name: 'Kid', phone: '2'),
      person(userId: 'o', name: 'DemWer', phone: '8888888888', isOwner: true),
    ]);
    expect(rows.first.name, 'DemWer');
    expect(householdPersonRole(rows.first), 'Owner');
    expect(householdPersonRole(rows.last), 'Family');
    expect(householdOwnerLine(rows), 'DemWer · 8888888888');
    expect(householdOwnerLine([]), 'No owner yet');
  });
}
