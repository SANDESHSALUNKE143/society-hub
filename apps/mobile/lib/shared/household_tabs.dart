/// Same six household tabs as web Onboard / Account.
const householdTabIds = [
  'owner',
  'family',
  'parking',
  'two_wheeler',
  'four_wheeler',
  'gas',
];

const householdTabLabels = {
  'owner': 'Owner',
  'family': 'Family',
  'parking': 'Parking Details',
  'two_wheeler': 'Two-wheelers',
  'four_wheeler': 'Four-wheelers',
  'gas': 'Gas',
};

String householdSubmitLabel(String tab) {
  switch (tab) {
    case 'family':
      return 'Save household counts';
    case 'parking':
      return 'Save parking';
    case 'gas':
      return 'Save gas';
    case 'two_wheeler':
    case 'four_wheeler':
      return 'Save vehicles';
    default:
      return 'Save profile';
  }
}
