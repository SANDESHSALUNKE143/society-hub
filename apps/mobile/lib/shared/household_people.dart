import 'package:flutter/material.dart';

import '../api/models.dart';
import '../core/theme.dart';

String householdPersonRole(SocietyResidentDto person) =>
    person.isOwner ? 'Owner' : 'Family';

List<SocietyResidentDto> sortHouseholdPeople(
  List<SocietyResidentDto> people,
) {
  return [...people]..sort((a, b) => (b.isOwner ? 1 : 0) - (a.isOwner ? 1 : 0));
}

String householdOwnerLine(List<SocietyResidentDto> people) {
  SocietyResidentDto? owner;
  for (final person in people) {
    if (person.isOwner) {
      owner = person;
      break;
    }
  }
  if (owner == null) return 'No owner yet';
  final phone = owner.phone?.trim();
  return phone == null || phone.isEmpty
      ? owner.displayName
      : '${owner.displayName} · $phone';
}

class HouseholdPeopleList extends StatelessWidget {
  const HouseholdPeopleList({
    super.key,
    required this.people,
    this.canEdit = false,
    this.busy = false,
    this.onAdd,
    this.onEdit,
    this.onDelete,
  });

  final List<SocietyResidentDto> people;
  final bool canEdit;
  final bool busy;
  final VoidCallback? onAdd;
  final void Function(SocietyResidentDto person)? onEdit;
  final void Function(SocietyResidentDto person)? onDelete;

  @override
  Widget build(BuildContext context) {
    final rows = sortHouseholdPeople(people);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Owner · ${householdOwnerLine(people)}',
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Expanded(
              child: Text(
                'People in this flat',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            if (canEdit)
              TextButton(
                onPressed: busy ? null : onAdd,
                child: const Text('Add family member'),
              )
            else
              const Flexible(
                child: Text(
                  'Only the flat owner can add or remove family members.',
                  style: TextStyle(color: Colors.black54, fontSize: 12),
                  textAlign: TextAlign.end,
                ),
              ),
          ],
        ),
        if (rows.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 4, bottom: 8),
            child: Text('None yet', style: TextStyle(color: Colors.black54)),
          )
        else
          for (final person in rows)
            Card(
              color: person.isOwner ? AppColors.mist : Colors.white,
              margin: const EdgeInsets.only(top: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            person.displayName,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text(
                          householdPersonRole(person),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.leafDark,
                          ),
                        ),
                      ],
                    ),
                    if (person.phone != null && person.phone!.isNotEmpty)
                      Text(person.phone!),
                    if (person.email != null && person.email!.isNotEmpty)
                      Text(
                        person.email!,
                        style: const TextStyle(color: Colors.black54),
                      ),
                    if (canEdit && !person.isOwner) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          TextButton(
                            onPressed: busy ? null : () => onEdit?.call(person),
                            child: const Text('Edit'),
                          ),
                          TextButton(
                            onPressed: busy ? null : () => onDelete?.call(person),
                            child: const Text(
                              'Delete',
                              style: TextStyle(color: AppColors.danger),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
      ],
    );
  }
}
