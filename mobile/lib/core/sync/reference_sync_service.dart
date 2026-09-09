import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../database/database_service.dart';
import '../models/field_reference.dart';

class ReferenceSyncResult {
  final bool synced;
  final int elections;
  final int stations;
  final int candidates;
  final String message;

  ReferenceSyncResult({
    required this.synced,
    required this.elections,
    required this.stations,
    required this.candidates,
    required this.message,
  });
}

class ReferenceSyncService {
  static final ReferenceSyncService _instance =
      ReferenceSyncService._internal();
  factory ReferenceSyncService() => _instance;
  ReferenceSyncService._internal();

  final String apiBaseUrl = 'http://10.0.2.2:8095/api/v1';

  Future<ReferenceSyncResult> syncFieldReferences() async {
    const storage = FlutterSecureStorage();
    final token = await storage.read(key: 'access_token');
    if (token == null) {
      return ReferenceSyncResult(
        synced: false,
        elections: 0,
        stations: 0,
        candidates: 0,
        message: 'Aucun token local: enrôlez l’app avant de synchroniser.',
      );
    }

    final elections = await _fetchElections(token);
    await DatabaseService().replaceElections(elections);

    var stationCount = 0;
    var candidateCount = 0;
    for (final election in elections) {
      final stations = await _fetchAssignedStations(token, election.id);
      final candidates = await _fetchCandidates(token, election.id);
      stationCount += stations.length;
      candidateCount += candidates.length;
      await DatabaseService().replacePollingStations(election.id, stations);
      await DatabaseService().replaceCandidates(election.id, candidates);
    }

    return ReferenceSyncResult(
      synced: true,
      elections: elections.length,
      stations: stationCount,
      candidates: candidateCount,
      message:
          'Référentiel mis à jour: ${elections.length} scrutin(s), $stationCount bureau(x), $candidateCount candidat(s).',
    );
  }

  Future<List<FieldElection>> _fetchElections(String token) async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl/elections'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) return [];

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final raw = (data['elections'] ?? []) as List<dynamic>;
    return raw.map((item) {
      final map = item as Map<String, dynamic>;
      return FieldElection(
        id: map['id'],
        name: map['name'] ?? '',
        status: map['status'] ?? '',
        date: map['date'] ?? '',
      );
    }).toList();
  }

  Future<List<FieldPollingStation>> _fetchAssignedStations(
    String token,
    String electionId,
  ) async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl/my-polling-stations?election_id=$electionId'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) return [];

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final raw = (data['polling_stations'] ?? []) as List<dynamic>;
    return raw.map((item) {
      final map = item as Map<String, dynamic>;
      return FieldPollingStation(
        id: map['id'],
        electionId: map['election_id'],
        code: map['code'] ?? '',
        name: map['name'] ?? '',
        registeredVoters: map['registered_voters'] ?? 0,
        locationName: map['location_name'] ?? '',
      );
    }).toList();
  }

  Future<List<FieldCandidate>> _fetchCandidates(
    String token,
    String electionId,
  ) async {
    final response = await http.get(
      Uri.parse('$apiBaseUrl/candidates?election_id=$electionId'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) return [];

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final raw = (data['candidates'] ?? []) as List<dynamic>;
    return raw.map((item) {
      final map = item as Map<String, dynamic>;
      return FieldCandidate(
        id: map['id'],
        electionId: map['election_id'],
        name: map['name'] ?? '',
        party: map['party'] ?? '',
        ballotNumber: map['ballot_number'],
      );
    }).toList();
  }
}
