import '../api/models.dart';

bool isParkingAssignable(
  ParkingSlotDto slot,
  String? flatId,
  String? currentSlotId,
) {
  if (slot.flatId == null || slot.flatId!.isEmpty) return true;
  if (slot.flatId == flatId) return true;
  if (currentSlotId != null &&
      currentSlotId.isNotEmpty &&
      slot.id == currentSlotId) {
    return true;
  }
  return false;
}

List<ParkingSlotDto> parkingSlotsOfKind(
  List<ParkingSlotDto> slots,
  String kind,
) {
  return slots.where((slot) => slot.kind == kind).toList();
}

List<ParkingSlotDto> assignableParkingSlots(
  List<ParkingSlotDto> slots,
  String kind,
  String? flatId,
  String? currentSlotId,
) {
  return parkingSlotsOfKind(slots, kind)
      .where((slot) => isParkingAssignable(slot, flatId, currentSlotId))
      .toList();
}

List<ParkingSlotDto> otherAssignedParkingSlots(
  List<ParkingSlotDto> slots,
  String kind,
  String? flatId,
  String? currentSlotId,
) {
  return parkingSlotsOfKind(slots, kind)
      .where((slot) => !isParkingAssignable(slot, flatId, currentSlotId))
      .toList();
}

String preferredParkingKind(
  List<ParkingSlotDto> slots,
  ParkingSlotDto? assigned,
  String? flatId,
  String? currentSlotId,
) {
  if (assigned != null) return assigned.kind;
  if (assignableParkingSlots(slots, 'puzzle', flatId, currentSlotId)
      .isNotEmpty) {
    return 'puzzle';
  }
  if (assignableParkingSlots(slots, 'open', flatId, currentSlotId).isNotEmpty) {
    return 'open';
  }
  return 'puzzle';
}

String? parkingNumberHint(
  List<ParkingSlotDto> slots,
  String kind,
  String? flatId,
  String? currentSlotId,
) {
  if (slots.isEmpty) {
    return 'Add parking lots in Manage first, then pick a number here.';
  }
  if (assignableParkingSlots(slots, kind, flatId, currentSlotId).isNotEmpty) {
    return null;
  }
  final otherKind = kind == 'puzzle' ? 'open' : 'puzzle';
  final otherFree =
      assignableParkingSlots(slots, otherKind, flatId, currentSlotId).length;
  final takenHere =
      otherAssignedParkingSlots(slots, kind, flatId, currentSlotId).length;
  final kindLabel = kind == 'puzzle' ? 'Puzzle' : 'Open';
  final otherLabel = otherKind == 'puzzle' ? 'Puzzle' : 'Open';
  if (takenHere > 0 && otherFree > 0) {
    return 'All $kindLabel lots are assigned to other flats. Switch to $otherLabel to see free lots, or clear a lot in Manage.';
  }
  if (takenHere > 0) {
    return 'All $kindLabel lots are assigned to other flats. Clear a lot in Manage to assign it here.';
  }
  if (otherFree > 0) {
    return 'No $kindLabel lots yet. Switch Parking type to $otherLabel to see the lots added in Manage.';
  }
  if (parkingSlotsOfKind(slots, otherKind).isNotEmpty) {
    return 'No free $kindLabel lots. Switch Parking type to see $otherLabel lots.';
  }
  return 'No parking lots match this type. Add them in Manage.';
}
