import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/shared/complaint_ui.dart';

void main() {
  test('maps complaint types and flat labels', () {
    expect(complaintTypeIconName('lift'), 'lift');
    expect(complaintTypeIconName('parking'), 'other');
    expect(complaintFlatLabel('4B'), 'Flat 4B');
    expect(complaintFlatLabel(''), '');
  });

  test('formats ticket timestamps', () {
    expect(
      formatComplaintWhen('2025-05-20T10:15:00.000Z'),
      matches(RegExp(r'20 May 2025, \d{1,2}:\d{2} [AP]M')),
    );
    expect(
      formatComplaintWhen('2025-05-20 10:15:00.000'),
      formatComplaintWhen('2025-05-20T10:15:00.000Z'),
    );
    expect(formatComplaintWhen('not-a-date'), '');
  });
}
