import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/shared/household_tabs.dart';

void main() {
  test('uses the same six tabs as Onboard resident', () {
    expect(householdTabIds, [
      'owner',
      'family',
      'parking',
      'two_wheeler',
      'four_wheeler',
      'gas',
    ]);
    expect(householdTabLabels['owner'], 'Owner');
    expect(householdSubmitLabel('family'), 'Save household counts');
    expect(householdSubmitLabel('owner'), 'Save profile');
  });
}
