import 'package:flutter_test/flutter_test.dart';
import 'package:societyhub_mobile/api/models.dart';
import 'package:societyhub_mobile/shared/widgets.dart';

import '../helpers/test_harness.dart';

void main() {
  group('UserDto', () {
    test('round-trips json', () {
      final user = fixtureUser(flatNumber: '101');
      final again = UserDto.fromJson(user.toJson());
      expect(again.id, user.id);
      expect(again.role, 'chairperson');
      expect(again.flatNumber, '101');
    });
  });

  group('LoginResult', () {
    test('parses tokens and memberships', () {
      final result = LoginResult.fromJson({
        ...loginJson(fixtureUser()),
        'memberships': [
          {
            'tenantId': 't1',
            'societyName': 'Keshav Heights',
            'role': 'chairperson',
            'canUseAdminMode': true,
          },
        ],
      });
      expect(result.tokens.accessToken, 'access-token');
      expect(result.memberships, hasLength(1));
      expect(result.memberships!.first.societyName, 'Keshav Heights');
      expect(result.memberships!.first.canUseAdminMode, isTrue);
    });
  });

  group('PaginatedComplaints', () {
    test('parses items list with queue fields', () {
      final page = PaginatedComplaints.fromJson({
        'items': [
          {
            'id': 'c1',
            'ticketNumber': 'C-1',
            'title': 'Gate',
            'type': 'security',
            'description': 'Issue',
            'status': 'open',
            'flatId': 'f1',
            'flatNumber': '101',
            'residentName': null,
            'createdAt': '2026-07-19T00:00:00.000Z',
            'queuePosition': 2,
            'openAheadCount': 1,
            'queueHint': '1 open ahead of you',
            'attachments': [
              {
                'id': 'a1',
                'contentKind': 'image',
                'contentType': 'image/jpeg',
                'url': '/v1/files/a1',
                'byteSize': 1024,
              },
            ],
            'statusEvents': [
              {
                'id': 'e1',
                'fromStatus': null,
                'toStatus': 'open',
                'note': null,
                'actorName': 'You',
                'createdAt': '2026-07-19T00:00:00.000Z',
              },
            ],
            'closingNote': null,
          },
        ],
        'page': 1,
        'limit': 20,
        'total': 1,
      });
      expect(page.items, hasLength(1));
      expect(page.items.first.title, 'Gate');
      expect(page.items.first.queuePosition, 2);
      expect(page.items.first.attachments, hasLength(1));
      expect(page.items.first.statusEvents.first.toStatus, 'open');
      expect(page.total, 1);
    });
  });

  group('ResidentProfileDto', () {
    test('parses flat details', () {
      final profile = ResidentProfileDto.fromJson({
        'userId': 'u1',
        'emergencyContact': 'Mom',
        'vehicleNumber': 'MH12',
        'societyName': 'Keshav Heights',
        'flat': {
          'id': 'f1',
          'number': '101',
          'wingName': 'A',
          'buildingName': 'Tower 1',
          'floor': 1,
          'parkingSlot': 'P-1',
          'isOwner': true,
          'pngGasConnection': true,
          'adultCount': 2,
          'twoWheelerCount': 1,
          'fourWheelerCount': 0,
        },
        'vehicles': [
          {
            'kind': 'two_wheeler',
            'registrationNumber': 'MH12TW0001',
            'parkingPurchased': false,
            'parkingSlot': null,
          },
        ],
      });
      expect(profile.societyName, 'Keshav Heights');
      expect(profile.flat!.label, 'A-101');
      expect(profile.flat!.floor, 1);
      expect(profile.flat!.isOwner, isTrue);
      expect(profile.flat!.twoWheelerCount, 1);
      expect(profile.vehicles, hasLength(1));
      expect(profile.vehicles.first.kind, 'two_wheeler');
    });
  });

  group('complaint labels', () {
    test('maps status and type', () {
      expect(complaintStatusLabel('assigned'), 'Acknowledged');
      expect(complaintStatusLabel('open'), 'In queue');
      expect(complaintTypeLabel('other', other: 'Pest'), 'Pest');
      expect(complaintTypeLabel('lift'), 'Lift');
    });
  });

  group('FlatDto', () {
    test('label includes wing when present', () {
      expect(
        FlatDto.fromJson({
          'id': 'f1',
          'number': '101',
          'wingName': 'A',
          'twoWheelerCount': 2,
          'fourWheelerCount': 1,
        }).label,
        'A-101',
      );
      expect(
        FlatDto.fromJson({
          'id': 'f1',
          'number': '101',
          'wingName': 'A',
          'twoWheelerCount': 2,
        }).twoWheelerCount,
        2,
      );
      expect(
        FlatDto.fromJson({
          'id': 'f1',
          'number': '101',
          'wingName': 'A',
          'adultCount': 2,
          'childCount': 1,
          'seniorCitizenCount': 1,
        }).adultCount,
        2,
      );
      expect(
        FlatDto.fromJson({
          'id': 'f2',
          'number': '202',
          'wingName': null,
        }).label,
        '202',
      );
    });
  });

  group('TeamMemberDto', () {
    test('parses contact fields and displayName fallback', () {
      final member = TeamMemberDto.fromJson({
        'userId': 'u2',
        'name': null,
        'email': 'ops@example.com',
        'phone': '8888888888',
        'role': 'secretary',
      });
      expect(member.displayName, 'ops@example.com');
      expect(member.phone, '8888888888');
      expect(member.role, 'secretary');
    });
  });

  group('DashboardStatsDto', () {
    test('defaults missing numbers to zero', () {
      final stats = DashboardStatsDto.fromJson({});
      expect(stats.openComplaints, 0);
      expect(stats.duesOutstandingPaise, 0);
    });
  });

  group('formatRupees', () {
    test('formats paise as rupees', () {
      expect(formatRupees(500000), '₹5000');
      expect(formatRupees(0), '₹0');
    });
  });

  group('ApiException', () {
    test('toString is message', () {
      expect(
        ApiException(code: 'x', message: 'Nope').toString(),
        'Nope',
      );
    });
  });
}
