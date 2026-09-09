import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/models/field_reference.dart';

void main() {
  group('FieldReference Model Tests', () {
    test('FieldPollingStation round-trip conserve le bureau assigné', () {
      final station = FieldPollingStation(
        id: 'station-001',
        electionId: 'election-001',
        code: 'BV-001',
        name: 'École publique',
        registeredVoters: 420,
        locationName: 'Douala 1',
      );

      final restored = FieldPollingStation.fromMap(station.toMap());

      expect(restored.id, station.id);
      expect(restored.electionId, station.electionId);
      expect(restored.code, 'BV-001');
      expect(restored.registeredVoters, 420);
    });

    test('FieldCandidate accepte un numéro de bulletin absent', () {
      final candidate = FieldCandidate.fromMap({
        'id': 'candidate-001',
        'election_id': 'election-001',
        'name': 'Candidate A',
        'party': 'Parti A',
        'ballot_number': null,
      });

      expect(candidate.ballotNumber, isNull);
      expect(candidate.name, 'Candidate A');
    });
  });
}
