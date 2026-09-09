import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../models/pv_submission.dart';

String sha256Hex(String input) {
  return sha256.convert(utf8.encode(input)).toString();
}

Map<String, dynamic> buildPvProofManifest({
  required String electionId,
  required String pollingStationId,
  required int registeredVoters,
  required int votersCount,
  required int nullVotes,
  required int blankVotes,
  required int disputedVotes,
  required String pvHash,
  required String clientRecordedAt,
  required double deviceLatitude,
  required double deviceLongitude,
  required String deviceId,
  required List<PvResult> results,
}) {
  final canonicalResults = results
      .map((result) => {
            'candidate_id': result.candidateId,
            'votes': result.votes,
          })
      .toList()
    ..sort(
      (a, b) => (a['candidate_id'] as String).compareTo(
        b['candidate_id'] as String,
      ),
    );

  return {
    'proof_manifest_version': 1,
    'election_id': electionId,
    'polling_station_id': pollingStationId,
    'registered_voters': registeredVoters,
    'voters_count': votersCount,
    'null_votes': nullVotes,
    'blank_votes': blankVotes,
    'disputed_votes': disputedVotes,
    'pv_hash': pvHash,
    'client_recorded_at': clientRecordedAt,
    'device_latitude': deviceLatitude,
    'device_longitude': deviceLongitude,
    'device_id': deviceId,
    'results': canonicalResults,
  };
}

String hashPvProofManifest(Map<String, dynamic> manifest) {
  return sha256Hex(encodePvProofManifest(manifest));
}

String encodePvProofManifest(Map<String, dynamic> manifest) {
  return jsonEncode(manifest);
}
