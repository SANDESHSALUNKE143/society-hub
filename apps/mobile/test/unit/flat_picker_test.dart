import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/shared/flat_picker.dart';

FlatDto _f({
  required String id,
  required String number,
  String? wingName,
}) {
  return FlatDto(id: id, number: number, wingName: wingName);
}

void main() {
  test('lists unique wings and flats in the chosen wing', () {
    final flats = [
      _f(id: '2', number: '201', wingName: 'B'),
      _f(id: '1', number: '101', wingName: 'A'),
      _f(id: '3', number: '102', wingName: 'A'),
    ];
    expect(uniqueWingNames(flats), ['A', 'B']);
    expect(flatsInWing(flats, 'A').map((f) => f.number), ['101', '102']);
    expect(firstFlatIdInWing(flats, 'B'), '2');
    expect(wingForFlatId(flats, '3'), 'A');
    expect(wingLabel(''), 'No wing');
  });
}
