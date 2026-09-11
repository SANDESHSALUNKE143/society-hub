import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/api/society_hub_api.dart';
import 'package:societyhub_mobile/auth/session.dart';
import 'package:societyhub_mobile/config/api_config.dart';
import 'package:societyhub_mobile/core/app_version.dart';

const testApiBase = 'http://api.test';

UserDto fixtureUser({
  String id = 'u1',
  String role = 'chairperson',
  String? name = 'Demo Chair',
  String? phone = '9999999999',
  String? flatNumber,
  String tenantId = 't1',
}) {
  return UserDto(
    id: id,
    phone: phone,
    email: 'demo@example.com',
    name: name,
    username: null,
    role: role,
    tenantId: tenantId,
    flatId: flatNumber == null ? null : 'f1',
    flatNumber: flatNumber,
    hasPin: false,
  );
}

AuthTokens fixtureTokens({
  String access = 'access-token',
  String refresh = 'refresh-token',
}) {
  return AuthTokens(
    accessToken: access,
    refreshToken: refresh,
    expiresIn: 900,
  );
}

Map<String, dynamic> userJson(UserDto u) => u.toJson();

Map<String, dynamic> tokensJson([AuthTokens? t]) {
  final tokens = t ?? fixtureTokens();
  return {
    'accessToken': tokens.accessToken,
    'refreshToken': tokens.refreshToken,
    'expiresIn': tokens.expiresIn,
  };
}

Map<String, dynamic> loginJson(UserDto user, {AuthTokens? tokens}) => {
      'user': userJson(user),
      'tokens': tokensJson(tokens),
    };

ComplaintDto fixtureComplaint({
  String id = 'c1',
  String title = 'Leak',
  String status = 'open',
  String flatNumber = '101',
  String? queueHint,
  int? queuePosition,
  String? closingNote,
}) {
  return ComplaintDto(
    id: id,
    ticketNumber: 'C-1',
    title: title,
    type: 'plumbing',
    description: 'Kitchen drip',
    status: status,
    flatId: 'f1',
    flatNumber: flatNumber,
    residentName: 'Resident',
    createdAt: '2026-07-19T00:00:00.000Z',
    queueHint: queueHint,
    queuePosition: queuePosition,
    closingNote: closingNote,
  );
}

Map<String, dynamic> complaintJson({
  String id = 'c1',
  String title = 'Leak',
  String status = 'open',
  String flatNumber = '101',
  String? queueHint = 'You are #1 in the open queue',
  int? queuePosition = 1,
  String? closingNote,
  List<Map<String, dynamic>> attachments = const [],
  List<Map<String, dynamic>> statusEvents = const [],
  List<Map<String, dynamic>> comments = const [],
}) {
  return {
    'id': id,
    'ticketNumber': 'C-1',
    'title': title,
    'type': 'plumbing',
    'typeOtherText': null,
    'description': 'Kitchen drip',
    'status': status,
    'flatId': 'f1',
    'flatNumber': flatNumber,
    'residentName': 'Resident',
    'createdAt': '2026-07-19T00:00:00.000Z',
    'queuePosition': queuePosition,
    'openAheadCount': queuePosition == null ? null : queuePosition - 1,
    'queueHint': queueHint,
    'attachments': attachments,
    'statusEvents': statusEvents,
    'comments': comments,
    'closingNote': closingNote,
  };
}

Map<String, dynamic> profileJson({
  String societyName = 'Keshav Heights',
  bool withFlat = true,
}) {
  return {
    'userId': 'u1',
    'emergencyContact': 'Mom 999',
    'vehicleNumber': 'MH12AB1234',
    'societyName': societyName,
    'flat': withFlat
        ? {
            'id': 'f1',
            'number': '101',
            'wingName': 'A',
            'buildingName': 'Tower 1',
            'floor': 1,
            'parkingSlot': 'P-12',
            'pngGasConnection': true,
            'adultCount': 2,
            'childCount': 1,
            'seniorCitizenCount': 1,
            'twoWheelerCount': 0,
            'fourWheelerCount': 1,
            'isOwner': true,
          }
        : null,
    'vehicles': withFlat
        ? [
            {
              'kind': 'four_wheeler',
              'registrationNumber': 'MH12AB1234',
              'parkingPurchased': false,
              'parkingSlot': null,
            },
          ]
        : [],
  };
}

class MockApiBundle {
  MockApiBundle() {
    dio = Dio(BaseOptions(baseUrl: testApiBase));
    adapter = DioAdapter(dio: dio);
    String? access = 'access-token';
    String? refresh = 'refresh-token';
    api = SocietyHubApi(
      config: const ApiConfig(baseUrl: testApiBase, env: 'dev'),
      dio: dio,
      getAccessToken: () => access,
      getRefreshToken: () => refresh,
      onTokens: (t) {
        access = t.accessToken;
        refresh = t.refreshToken;
      },
      onSessionInvalid: () {
        access = null;
        refresh = null;
        sessionCleared = true;
      },
    );
  }

  late final Dio dio;
  late final DioAdapter adapter;
  late final SocietyHubApi api;
  bool sessionCleared = false;
}

List<Override> testSessionOverrides({
  UserDto? user,
  AppMode mode = AppMode.admin,
  SocietyHubApi? api,
  ApiConfig config = const ApiConfig(baseUrl: testApiBase, env: 'dev'),
  AppVersionSource versionSource = const FakeAppVersionSource(),
}) {
  FlutterSecureStorage.setMockInitialValues({});
  return <Override>[
    skipSessionRestoreProvider.overrideWithValue(true),
    secureStorageProvider.overrideWithValue(const FlutterSecureStorage()),
    apiConfigProvider.overrideWithValue(config),
    appVersionSourceProvider.overrideWithValue(versionSource),
  ];
}

Future<ProviderContainer> createSeededContainer({
  required UserDto user,
  AppMode mode = AppMode.admin,
  SocietyHubApi? api,
}) async {
  final container = ProviderContainer(overrides: testSessionOverrides());
  addTearDown(container.dispose);
  final session = container.read(sessionProvider.notifier);
  if (api != null) {
    session.replaceApiForTest(api);
  }
  await session.setSession(user, fixtureTokens());
  session.setMode(mode);
  return container;
}

Widget wrapForWidgetTest({
  required Widget child,
  List<Override> overrides = const [],
  AppVersionSource versionSource = const FakeAppVersionSource(),
}) {
  return ProviderScope(
    overrides: [
      ...testSessionOverrides(versionSource: versionSource),
      ...overrides,
    ],
    child: MaterialApp(
      theme: ThemeData(useMaterial3: true),
      home: child,
    ),
  );
}
