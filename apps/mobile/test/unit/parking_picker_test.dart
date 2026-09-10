import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/shared/parking_picker.dart';

ParkingSlotDto _slot({
  required String id,
  required String slotNumber,
  required String kind,
  String? flatId,
  String? wing,
  String? flatNumber,
}) {
  return ParkingSlotDto(
    id: id,
    slotNumber: slotNumber,
    kind: kind,
    flatId: flatId,
    wing: wing,
    flatNumber: flatNumber,
  );
}

void main() {
  final openFree = _slot(id: 'open-1', slotNumber: '12', kind: 'open');
  final puzzleTaken = _slot(
    id: 'puz-1',
    slotNumber: '101',
    kind: 'puzzle',
    wing: 'A',
    flatId: 'other-flat',
    flatNumber: '202',
  );
  final puzzleMine = _slot(
    id: 'puz-2',
    slotNumber: '102',
    kind: 'puzzle',
    wing: 'A',
    flatId: 'flat-1',
    flatNumber: '101',
  );

  test('hides lots already assigned to another flat', () {
    final rows = [openFree, puzzleTaken, puzzleMine];
    expect(
      assignableParkingSlots(rows, 'puzzle', 'flat-1', null).map((p) => p.id),
      ['puz-2'],
    );
    expect(
      assignableParkingSlots(rows, 'open', 'flat-1', null).map((p) => p.id),
      ['open-1'],
    );
  });

  test('prefers the kind that actually has a free lot', () {
    expect(preferredParkingKind([openFree], null, 'flat-1', null), 'open');
    expect(
      preferredParkingKind([openFree, puzzleMine], puzzleMine, 'flat-1', 'puz-2'),
      'puzzle',
    );
  });

  test('explains why Parking number is only None', () {
    expect(
      parkingNumberHint([], 'puzzle', 'flat-1', null),
      contains('Add parking lots in Manage'),
    );
    expect(
      parkingNumberHint([openFree], 'puzzle', 'flat-1', null),
      contains('Switch Parking type to Open'),
    );
    expect(
      parkingNumberHint([puzzleTaken], 'puzzle', 'flat-1', null),
      contains('assigned to other flats'),
    );
  });
}
