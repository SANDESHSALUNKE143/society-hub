import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:societyhub_mobile/api/models.dart';

import '../helpers/test_harness.dart';

void main() {
  late MockApiBundle bundle;

  setUp(() {
    bundle = MockApiBundle();
  });

  group('SocietyHubApi auth', () {
    test('loginPassword returns user and tokens', () async {
      bundle.adapter.onPost(
        '/v1/auth/password/login',
        (server) => server.reply(200, loginJson(fixtureUser())),
        data: Matchers.any,
      );

      final res = await bundle.api.loginPassword('a@b.com', 'secret');
      expect(res.user.role, 'chairperson');
      expect(res.tokens.accessToken, 'access-token');
    });

    test('requestOtp surfaces optional devCode', () async {
      bundle.adapter.onPost(
        '/v1/auth/otp/request',
        (server) => server.reply(200, {'ok': true, 'devCode': '123456'}),
        data: Matchers.any,
      );

      final res = await bundle.api.requestOtp('8888888888');
      expect(res.devCode, '123456');
    });

    test('verifyOtp parses login payload', () async {
      bundle.adapter.onPost(
        '/v1/auth/otp/verify',
        (server) => server.reply(
          200,
          loginJson(fixtureUser(role: 'resident', phone: '8888888888')),
        ),
        data: Matchers.any,
      );

      final res = await bundle.api.verifyOtp('8888888888', '123456');
      expect(res.user.role, 'resident');
    });

    test('maps API error envelope to ApiException', () async {
      bundle.adapter.onPost(
        '/v1/auth/password/login',
        (server) => server.reply(401, {
          'code': 'invalid_credentials',
          'message': 'Invalid email or password',
        }),
        data: Matchers.any,
      );

      expect(
        () => bundle.api.loginPassword('a@b.com', 'bad'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'invalid_credentials')
              .having((e) => e.message, 'message', 'Invalid email or password')
              .having((e) => e.statusCode, 'status', 401),
        ),
      );
    });
  });

  group('SocietyHubApi refresh', () {
    test('refreshTokens returns new pair', () async {
      bundle.adapter.onPost(
        '/v1/auth/refresh',
        (server) => server.reply(
          200,
          tokensJson(fixtureTokens(access: 'new-a', refresh: 'new-r')),
        ),
        data: Matchers.any,
      );

      final tokens = await bundle.api.refreshTokens('old-r');
      expect(tokens.accessToken, 'new-a');
      expect(tokens.refreshToken, 'new-r');
    });

    test('clears session when authenticated call gets 401 and refresh fails', () async {
      bundle.adapter
        ..onGet(
          '/v1/auth/me',
          (server) => server.reply(401, {
            'code': 'unauthorized',
            'message': 'expired',
          }),
        )
        ..onPost(
          '/v1/auth/refresh',
          (server) => server.reply(401, {
            'code': 'unauthorized',
            'message': 'bad refresh',
          }),
          data: Matchers.any,
        );

      await expectLater(bundle.api.me(), throwsA(isA<ApiException>()));
      expect(bundle.sessionCleared, isTrue);
    });
  });

  group('SocietyHubApi complaints + onboard', () {
    test('listComplaints parses page', () async {
      bundle.adapter.onGet(
        RegExp(r'/v1/complaints.*'),
        (server) => server.reply(200, {
          'items': [
            {
              'id': 'c1',
              'ticketNumber': 'C-1',
              'title': 'Leak',
              'type': 'plumbing',
              'description': 'x',
              'status': 'open',
              'flatId': 'f1',
              'flatNumber': '101',
              'residentName': null,
              'createdAt': '2026-07-19T00:00:00.000Z',
            },
          ],
          'page': 1,
          'limit': 20,
          'total': 1,
        }),
      );

      final page = await bundle.api.listComplaints();
      expect(page.items.first.title, 'Leak');
    });

    test('onboardResident reads nested user', () async {
      bundle.adapter.onPost(
        '/v1/admin/residents',
        (server) => server.reply(200, {
          'user': userJson(
            fixtureUser(role: 'resident', name: 'New Resident', phone: '777'),
          ),
        }),
        data: Matchers.any,
      );

      final user = await bundle.api.onboardResident(
        name: 'New Resident',
        phone: '777',
        flatId: 'f1',
      );
      expect(user.name, 'New Resident');
      expect(user.role, 'resident');
    });

    test('household members list and add', () async {
      bundle.adapter
        ..onGet(
          '/v1/household/members',
          (server) => server.reply(200, [
            {
              'userId': 'u1',
              'name': 'Owner',
              'email': null,
              'phone': '9000000001',
              'flatId': 'f1',
              'flatNumber': '101',
              'wingName': 'A',
              'isOwner': true,
            },
          ]),
        )
        ..onPost(
          '/v1/household/members',
          (server) => server.reply(200, {
            'user': userJson(
              fixtureUser(role: 'resident', name: 'Kid', phone: '9000000002'),
            ),
          }),
          data: Matchers.any,
        );

      final people = await bundle.api.listHouseholdMembers();
      expect(people.first.name, 'Owner');
      final added = await bundle.api.addHouseholdMember(
        name: 'Kid',
        phone: '9000000002',
      );
      expect(added.name, 'Kid');
    });

    test('household members update and remove', () async {
      bundle.adapter
        ..onPatch(
          '/v1/household/members/u2',
          (server) => server.reply(200, {
            'user': userJson(
              fixtureUser(role: 'resident', name: 'Kid 2', phone: '9000000002'),
            ),
          }),
          data: Matchers.any,
        )
        ..onDelete(
          '/v1/household/members/u2',
          (server) => server.reply(200, {'ok': true}),
        );

      final updated = await bundle.api.updateHouseholdMember(
        userId: 'u2',
        name: 'Kid 2',
        phone: '9000000002',
      );
      expect(updated.name, 'Kid 2');
      await bundle.api.removeHouseholdMember('u2');
    });

    test('createComplaint posts body', () async {
      bundle.adapter.onPost(
        '/v1/complaints',
        (server) => server.reply(200, complaintJson(id: 'c9', title: 'Lift')),
        data: Matchers.any,
      );

      final c = await bundle.api.createComplaint(
        title: 'Lift',
        type: 'lift',
        description: 'Stuck',
      );
      expect(c.id, 'c9');
    });

    test('updateComplaintStatus sends note', () async {
      bundle.adapter.onPatch(
        '/v1/complaints/c1/status',
        (server) => server.reply(
          200,
          complaintJson(status: 'closed', closingNote: 'Fixed'),
        ),
        data: Matchers.any,
      );

      final c = await bundle.api.updateComplaintStatus(
        'c1',
        'closed',
        note: 'Fixed',
      );
      expect(c.status, 'closed');
      expect(c.closingNote, 'Fixed');
    });

    test('getProfile parses flat', () async {
      bundle.adapter.onGet(
        '/v1/profile',
        (server) => server.reply(200, profileJson()),
      );

      final profile = await bundle.api.getProfile();
      expect(profile.societyName, 'Keshav Heights');
      expect(profile.flat!.number, '101');
      expect(profile.flat!.parkingSlot, 'P-12');
    });

    test('listParkings parses inventory', () async {
      bundle.adapter.onGet(
        '/v1/admin/parkings',
        (server) => server.reply(200, [
          {
            'id': 'p1',
            'flatId': null,
            'flatNumber': null,
            'slotNumber': 'OP-1',
            'vehicleNumber': null,
            'type': 'car',
            'kind': 'open',
            'wing': null,
            'floor': null,
            'createdAt': '2026-01-01T00:00:00.000Z',
          },
        ]),
      );

      final rows = await bundle.api.listParkings();
      expect(rows, hasLength(1));
      expect(rows.first.slotNumber, 'OP-1');
      expect(rows.first.kind, 'open');
    });

    test('listTeam add update remove', () async {
      bundle.adapter
        ..onGet(
          '/v1/team',
          (server) => server.reply(200, [
            {
              'userId': 'u2',
              'name': 'Ops',
              'email': 'ops@example.com',
              'phone': null,
              'role': 'committee',
            },
          ]),
        )
        ..onPost(
          '/v1/team',
          (server) => server.reply(200, {
            'ok': true,
            'userId': 'u3',
            'role': 'secretary',
            'societyName': 'Keshav Heights',
          }),
          data: Matchers.any,
        )
        ..onPatch(
          '/v1/team/u2',
          (server) => server.reply(200, {
            'userId': 'u2',
            'name': 'Ops',
            'email': 'ops@example.com',
            'phone': '8888888888',
            'role': 'committee',
          }),
          data: Matchers.any,
        )
        ..onDelete(
          '/v1/team/u2',
          (server) => server.reply(200, {'ok': true}),
        );

      final rows = await bundle.api.listTeam();
      expect(rows.first.phone, isNull);
      expect(rows.first.displayName, 'Ops');

      final added = await bundle.api.addTeamMember(
        phone: '7777777777',
        role: 'secretary',
      );
      expect(added.userId, 'u3');
      expect(added.role, 'secretary');

      final updated = await bundle.api.updateTeamMember(
        'u2',
        phone: '8888888888',
      );
      expect(updated.phone, '8888888888');

      await bundle.api.removeTeamMember('u2');
    });

    test('listComplaints mine query is accepted', () async {
      bundle.adapter.onGet(
        RegExp(r'/v1/complaints\?page=1&limit=20&mine=1'),
        (server) => server.reply(200, {
          'items': [complaintJson()],
          'page': 1,
          'limit': 20,
          'total': 1,
        }),
      );

      final page = await bundle.api.listComplaints(mine: true);
      expect(page.items.first.queueHint, isNotNull);
    });
  });
}
