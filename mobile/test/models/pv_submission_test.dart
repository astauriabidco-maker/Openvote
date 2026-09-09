import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/models/pv_submission.dart';

void main() {
  group('PvSubmission Model Tests', () {
    final now = DateTime(2026, 9, 9, 12, 0);

    test('toMap -> fromMap préserve les résultats candidat', () {
      final pv = PvSubmission(
        id: 'pv-001',
        electionId: 'election-001',
        pollingStationId: 'station-001',
        pollingStationCode: 'BV-42',
        observerId: 'observer-001',
        registeredVoters: 400,
        votersCount: 250,
        nullVotes: 3,
        blankVotes: 2,
        disputedVotes: 1,
        pvHash: 'hash-photo',
        signedPayloadHash: 'hash-payload',
        signature: 'signature-rs',
        deviceId: 'mobile-device-001',
        notes: 'PV signé et affiché',
        status: 'pending',
        serverId: 'server-pv-001',
        statusMessage: 'Correction demandée sur les bulletins nuls',
        results: [
          PvResult(
            candidateId: 'cand-a',
            candidateName: 'Candidate A',
            votes: 100,
          ),
          PvResult(
            candidateId: 'cand-b',
            candidateName: 'Candidate B',
            votes: 144,
          ),
        ],
        createdAt: now,
        syncedAt: now.add(const Duration(minutes: 2)),
        statusUpdatedAt: now.add(const Duration(minutes: 3)),
      );

      final restored = PvSubmission.fromMap(pv.toMap());

      expect(restored.id, pv.id);
      expect(restored.pollingStationCode, 'BV-42');
      expect(restored.votersCount, 250);
      expect(restored.results, hasLength(2));
      expect(restored.results.last.candidateId, 'cand-b');
      expect(restored.results.last.votes, 144);
      expect(restored.serverId, 'server-pv-001');
      expect(restored.signature, 'signature-rs');
      expect(restored.deviceId, 'mobile-device-001');
      expect(
          restored.statusMessage, 'Correction demandée sur les bulletins nuls');
      expect(restored.syncedAt, now.add(const Duration(minutes: 2)));
      expect(restored.statusUpdatedAt, now.add(const Duration(minutes: 3)));
    });

    test('needsFieldAction détecte rejet et clarification', () {
      PvSubmission pvWithStatus(String status) {
        return PvSubmission(
          id: 'pv-$status',
          electionId: 'election-001',
          pollingStationId: 'station-001',
          pollingStationCode: 'BV-42',
          observerId: 'observer-001',
          registeredVoters: 400,
          votersCount: 250,
          nullVotes: 3,
          blankVotes: 2,
          disputedVotes: 1,
          pvHash: 'hash-photo',
          signedPayloadHash: 'hash-payload',
          notes: '',
          status: status,
          results: const [],
          createdAt: now,
        );
      }

      expect(pvWithStatus('needs_clarification').needsFieldAction, isTrue);
      expect(pvWithStatus('rejected').needsFieldAction, isTrue);
      expect(pvWithStatus('verified').needsFieldAction, isFalse);
    });
  });
}
