import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/models/report.dart';

void main() {
  group('Report Model Tests', () {
    final now = DateTime(2026, 2, 25, 14, 30, 0);

    final reportData = {
      'id': 'test-uuid-001',
      'observer_id': 'obs-001',
      'incident_type': 'Fraude',
      'description': 'Bourrage d\'urnes au bureau 42',
      'latitude': 4.0511,
      'longitude': 9.7679,
      'h3_index': '8a2a1072b59ffff',
      'status': 'pending',
      'proof_url': null,
      'created_at': '2026-02-25T14:30:00.000',
      'synced_at': null,
    };

    test('Report.fromMap crée correctement un objet à partir d\'une map', () {
      final report = Report.fromMap(reportData);

      expect(report.id, 'test-uuid-001');
      expect(report.observerId, 'obs-001');
      expect(report.incidentType, 'Fraude');
      expect(report.description, 'Bourrage d\'urnes au bureau 42');
      expect(report.latitude, 4.0511);
      expect(report.longitude, 9.7679);
      expect(report.h3Index, '8a2a1072b59ffff');
      expect(report.status, 'pending');
      expect(report.proofUrl, null);
      expect(report.syncedAt, null);
    });

    test('Report.toMap convertit correctement un objet en map', () {
      final report = Report(
        id: 'test-uuid-002',
        observerId: 'obs-002',
        incidentType: 'Violence',
        description: 'Intimidation des électeurs',
        latitude: 4.06,
        longitude: 9.77,
        h3Index: '8a2a1072b59fff0',
        status: 'verified',
        createdAt: now,
      );

      final map = report.toMap();

      expect(map['id'], 'test-uuid-002');
      expect(map['observer_id'], 'obs-002');
      expect(map['incident_type'], 'Violence');
      expect(map['description'], 'Intimidation des électeurs');
      expect(map['latitude'], 4.06);
      expect(map['longitude'], 9.77);
      expect(map['h3_index'], '8a2a1072b59fff0');
      expect(map['status'], 'verified');
      expect(map['created_at'], now.toIso8601String());
      expect(map['synced_at'], null);
    });

    test('Report round-trip : toMap -> fromMap préserve toutes les données', () {
      final original = Report(
        id: 'roundtrip-001',
        observerId: 'obs-rt',
        incidentType: 'Logistique',
        description: 'PV manquant',
        latitude: 5.9631,
        longitude: 10.1591,
        h3Index: '8a2a1072b59aaa0',
        status: 'pending',
        proofUrl: 'https://evidence.test/img001.jpg',
        createdAt: now,
        syncedAt: now.add(const Duration(minutes: 5)),
      );

      final map = original.toMap();
      final restored = Report.fromMap(map);

      expect(restored.id, original.id);
      expect(restored.observerId, original.observerId);
      expect(restored.incidentType, original.incidentType);
      expect(restored.description, original.description);
      expect(restored.latitude, original.latitude);
      expect(restored.longitude, original.longitude);
      expect(restored.h3Index, original.h3Index);
      expect(restored.status, original.status);
      expect(restored.proofUrl, original.proofUrl);
      expect(restored.syncedAt, isNotNull);
    });

    test('Report avec caractères spéciaux dans la description', () {
      final report = Report(
        id: 'special-chars',
        observerId: 'obs-sc',
        incidentType: 'Autre',
        description: 'Présence de "faux bulletins" & menaces <graves>',
        latitude: 3.866,
        longitude: 11.5167,
        h3Index: '',
        status: 'pending',
        createdAt: now,
      );

      final map = report.toMap();
      final restored = Report.fromMap(map);

      expect(restored.description, 'Présence de "faux bulletins" & menaces <graves>');
    });

    test('Report avec proofUrl défini', () {
      final report = Report(
        id: 'proof-test',
        observerId: 'obs-proof',
        incidentType: 'Fraude',
        description: 'Avec preuve',
        latitude: 4.05,
        longitude: 9.76,
        h3Index: '',
        status: 'pending',
        proofUrl: 'minio://evidence/photo_001.jpg',
        createdAt: now,
      );

      expect(report.proofUrl, isNotNull);
      expect(report.proofUrl, contains('evidence'));
    });
  });
}
