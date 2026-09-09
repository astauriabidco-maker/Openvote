import 'dart:convert';

class PvResult {
  final String candidateId;
  final String candidateName;
  final int votes;

  PvResult({
    required this.candidateId,
    required this.candidateName,
    required this.votes,
  });

  Map<String, dynamic> toMap() {
    return {
      'candidate_id': candidateId,
      'candidate_name': candidateName,
      'votes': votes,
    };
  }

  factory PvResult.fromMap(Map<String, dynamic> map) {
    return PvResult(
      candidateId: map['candidate_id'],
      candidateName: map['candidate_name'] ?? '',
      votes: map['votes'] ?? 0,
    );
  }
}

class PvSubmission {
  final String id;
  final String electionId;
  final String pollingStationId;
  final String pollingStationCode;
  final String observerId;
  final int registeredVoters;
  final int votersCount;
  final int nullVotes;
  final int blankVotes;
  final int disputedVotes;
  final String pvPhotoPath;
  final String pvPhotoUrl;
  final String pvHash;
  final String signedPayloadHash;
  final String signature;
  final int proofManifestVersion;
  final String clientRecordedAt;
  final double deviceLatitude;
  final double deviceLongitude;
  final String deviceId;
  final String serverPayloadHash;
  final String integrityStatus;
  final List<String> integrityErrors;
  final String notes;
  final String status;
  final String serverId;
  final String statusMessage;
  final List<PvResult> results;
  final DateTime createdAt;
  final DateTime? syncedAt;
  final DateTime? statusUpdatedAt;

  PvSubmission({
    required this.id,
    required this.electionId,
    required this.pollingStationId,
    required this.pollingStationCode,
    required this.observerId,
    required this.registeredVoters,
    required this.votersCount,
    required this.nullVotes,
    required this.blankVotes,
    required this.disputedVotes,
    this.pvPhotoPath = '',
    this.pvPhotoUrl = '',
    required this.pvHash,
    required this.signedPayloadHash,
    this.signature = '',
    this.proofManifestVersion = 1,
    this.clientRecordedAt = '',
    this.deviceLatitude = 0,
    this.deviceLongitude = 0,
    this.deviceId = '',
    this.serverPayloadHash = '',
    this.integrityStatus = '',
    this.integrityErrors = const [],
    required this.notes,
    required this.status,
    this.serverId = '',
    this.statusMessage = '',
    required this.results,
    required this.createdAt,
    this.syncedAt,
    this.statusUpdatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'election_id': electionId,
      'polling_station_id': pollingStationId,
      'polling_station_code': pollingStationCode,
      'observer_id': observerId,
      'registered_voters': registeredVoters,
      'voters_count': votersCount,
      'null_votes': nullVotes,
      'blank_votes': blankVotes,
      'disputed_votes': disputedVotes,
      'pv_photo_path': pvPhotoPath,
      'pv_photo_url': pvPhotoUrl,
      'pv_hash': pvHash,
      'signed_payload_hash': signedPayloadHash,
      'signature': signature,
      'proof_manifest_version': proofManifestVersion,
      'client_recorded_at': clientRecordedAt,
      'device_latitude': deviceLatitude,
      'device_longitude': deviceLongitude,
      'device_id': deviceId,
      'server_payload_hash': serverPayloadHash,
      'integrity_status': integrityStatus,
      'integrity_errors_json': jsonEncode(integrityErrors),
      'notes': notes,
      'status': status,
      'server_id': serverId,
      'status_message': statusMessage,
      'results_json': jsonEncode(results.map((r) => r.toMap()).toList()),
      'created_at': createdAt.toIso8601String(),
      'synced_at': syncedAt?.toIso8601String(),
      'status_updated_at': statusUpdatedAt?.toIso8601String(),
    };
  }

  factory PvSubmission.fromMap(Map<String, dynamic> map) {
    final rawResults = jsonDecode(map['results_json'] ?? '[]') as List<dynamic>;
    final rawIntegrityErrors =
        jsonDecode(map['integrity_errors_json'] ?? '[]') as List<dynamic>;
    return PvSubmission(
      id: map['id'],
      electionId: map['election_id'],
      pollingStationId: map['polling_station_id'],
      pollingStationCode: map['polling_station_code'] ?? '',
      observerId: map['observer_id'],
      registeredVoters: map['registered_voters'] ?? 0,
      votersCount: map['voters_count'] ?? 0,
      nullVotes: map['null_votes'] ?? 0,
      blankVotes: map['blank_votes'] ?? 0,
      disputedVotes: map['disputed_votes'] ?? 0,
      pvPhotoPath: map['pv_photo_path'] ?? '',
      pvPhotoUrl: map['pv_photo_url'] ?? '',
      pvHash: map['pv_hash'] ?? '',
      signedPayloadHash: map['signed_payload_hash'] ?? '',
      signature: map['signature'] ?? '',
      proofManifestVersion: map['proof_manifest_version'] ?? 1,
      clientRecordedAt: map['client_recorded_at'] ?? '',
      deviceLatitude: (map['device_latitude'] ?? 0).toDouble(),
      deviceLongitude: (map['device_longitude'] ?? 0).toDouble(),
      deviceId: map['device_id'] ?? '',
      serverPayloadHash: map['server_payload_hash'] ?? '',
      integrityStatus: map['integrity_status'] ?? '',
      integrityErrors: rawIntegrityErrors.map((item) => '$item').toList(),
      notes: map['notes'] ?? '',
      status: map['status'] ?? 'pending',
      serverId: map['server_id'] ?? '',
      statusMessage: map['status_message'] ?? '',
      results: rawResults
          .map((item) => PvResult.fromMap(item as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(map['created_at']),
      syncedAt:
          map['synced_at'] != null ? DateTime.parse(map['synced_at']) : null,
      statusUpdatedAt: map['status_updated_at'] != null
          ? DateTime.parse(map['status_updated_at'])
          : null,
    );
  }

  bool get needsFieldAction {
    return status == 'needs_clarification' || status == 'rejected';
  }
}
