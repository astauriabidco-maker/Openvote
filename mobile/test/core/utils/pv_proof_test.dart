import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/models/pv_submission.dart';
import 'package:openvote_mobile/core/utils/pv_proof.dart';

void main() {
  group('PV proof manifest', () {
    test('hash canonique stable même si les résultats arrivent désordonnés',
        () {
      final a = buildPvProofManifest(
        electionId: 'election-001',
        pollingStationId: 'station-001',
        registeredVoters: 100,
        votersCount: 90,
        nullVotes: 1,
        blankVotes: 2,
        disputedVotes: 3,
        pvHash: 'photo-hash',
        clientRecordedAt: '2026-09-09T18:30:00Z',
        deviceLatitude: 3.8667,
        deviceLongitude: 11.5167,
        deviceId: 'mobile-device-001',
        results: [
          PvResult(candidateId: 'cand-b', candidateName: 'B', votes: 40),
          PvResult(candidateId: 'cand-a', candidateName: 'A', votes: 44),
        ],
      );
      final b = buildPvProofManifest(
        electionId: 'election-001',
        pollingStationId: 'station-001',
        registeredVoters: 100,
        votersCount: 90,
        nullVotes: 1,
        blankVotes: 2,
        disputedVotes: 3,
        pvHash: 'photo-hash',
        clientRecordedAt: '2026-09-09T18:30:00Z',
        deviceLatitude: 3.8667,
        deviceLongitude: 11.5167,
        deviceId: 'mobile-device-001',
        results: [
          PvResult(candidateId: 'cand-a', candidateName: 'A', votes: 44),
          PvResult(candidateId: 'cand-b', candidateName: 'B', votes: 40),
        ],
      );

      expect(hashPvProofManifest(a), hashPvProofManifest(b));
    });

    test('hash change si un chiffre du PV change', () {
      final manifest = buildPvProofManifest(
        electionId: 'election-001',
        pollingStationId: 'station-001',
        registeredVoters: 100,
        votersCount: 90,
        nullVotes: 1,
        blankVotes: 2,
        disputedVotes: 3,
        pvHash: 'photo-hash',
        clientRecordedAt: '2026-09-09T18:30:00Z',
        deviceLatitude: 3.8667,
        deviceLongitude: 11.5167,
        deviceId: 'mobile-device-001',
        results: [
          PvResult(candidateId: 'cand-a', candidateName: 'A', votes: 44),
        ],
      );
      final changed = Map<String, dynamic>.from(manifest)
        ..['voters_count'] = 91;

      expect(
          hashPvProofManifest(manifest), isNot(hashPvProofManifest(changed)));
    });
  });
}
