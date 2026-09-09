import '../api/models.dart';

String wingKey(FlatDto flat) => (flat.wingName ?? '').trim();

const unnamedWingToken = '__unnamed__';

String toWingSelectValue(String wing) =>
    wing.isEmpty ? unnamedWingToken : wing;

String fromWingSelectValue(String value) =>
    value == unnamedWingToken ? '' : value;

String wingLabel(String wing) => wing.isEmpty ? 'No wing' : wing;

List<String> uniqueWingNames(List<FlatDto> flats) {
  final seen = <String>{};
  final names = <String>[];
  for (final flat in flats) {
    final key = wingKey(flat);
    if (seen.add(key)) names.add(key);
  }
  names.sort();
  return names;
}

List<FlatDto> flatsInWing(List<FlatDto> flats, String wing) {
  final rows = flats.where((flat) => wingKey(flat) == wing).toList()
    ..sort((a, b) => a.number.compareTo(b.number));
  return rows;
}

String? firstFlatIdInWing(List<FlatDto> flats, String wing) {
  final rows = flatsInWing(flats, wing);
  if (rows.isEmpty) return null;
  return rows.first.id;
}

String wingForFlatId(List<FlatDto> flats, String? flatId) {
  for (final flat in flats) {
    if (flat.id == flatId) return wingKey(flat);
  }
  final names = uniqueWingNames(flats);
  return names.isEmpty ? '' : names.first;
}
