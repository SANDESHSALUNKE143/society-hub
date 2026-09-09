import 'package:flutter/foundation.dart';

/// Stable keys for widget / integration tests (mirror web data-testid where useful).
abstract final class AppKeys {
  static const loginModePassword = Key('login-mode-password');
  static const loginModeOtp = Key('login-mode-otp');
  static const loginModePin = Key('login-mode-pin');
  static const loginModeGoogle = Key('login-mode-google');
  static const loginEmail = Key('login-email');
  static const loginPassword = Key('login-password');
  static const loginPhone = Key('login-phone');
  static const loginOtpCode = Key('login-otp-code');
  static const loginPin = Key('login-pin');
  static const loginSubmit = Key('login-submit');
  static const loginError = Key('login-error');
  static const loginBusy = Key('login-busy');
  static const accountPrivacy = Key('account-privacy');

  static const modeAdmin = Key('app-mode-admin');
  static const modeResident = Key('app-mode-resident');
  static const modeToggle = Key('app-mode-toggle');

  static const complaintsSearch = Key('complaints-search');
  static const complaintsList = Key('complaints-list');
  static const complaintsEmpty = Key('complaints-empty');
  static const newComplaintLink = Key('new-complaint-link');
  static const newComplaintForm = Key('new-complaint-form');
  static const complaintCreatedBanner = Key('complaint-created-banner');
  static const complaintQueueHint = Key('complaint-queue-hint');
  static const complaintClosingNote = Key('complaint-closing-note');
  static const complaintStaffActions = Key('complaint-staff-actions');
  static const complaintStaffNote = Key('complaint-staff-note');
  static const complaintAck = Key('complaint-ack');
  static const complaintStart = Key('complaint-start');
  static const complaintResolve = Key('complaint-resolve');
  static const complaintClose = Key('complaint-close');

  static const accountFlatDetails = Key('account-flat-details');
  static const accountFlatEmpty = Key('account-flat-empty');
  static const accountSocietyName = Key('account-society-name');
  static const accountFlatNumber = Key('account-flat-number');
  static const accountEmergencyContact = Key('account-emergency-contact');
  static const accountVehicleNumber = Key('account-vehicle-number');

  static const onboardForm = Key('onboard-form');
  static const onboardName = Key('onboard-name');
  static const onboardPhone = Key('onboard-phone');
  static const onboardSubmit = Key('onboard-submit');

  static const teamPage = Key('team-page');
  static const addTeamForm = Key('add-team-form');
  static const addTeamEmail = Key('add-team-email');
  static const addTeamPhone = Key('add-team-phone');
  static const addTeamName = Key('add-team-name');
  static const addTeamSubmit = Key('add-team-submit');
  static const teamList = Key('team-list');
  static const editTeamForm = Key('edit-team-form');
  static const editTeamPhone = Key('edit-team-phone');
  static const editTeamEmail = Key('edit-team-email');
  static const editTeamSave = Key('edit-team-save');

  static Key teamEdit(String userId) => Key('team-edit-$userId');
  static Key teamRemove(String userId) => Key('team-remove-$userId');
}
