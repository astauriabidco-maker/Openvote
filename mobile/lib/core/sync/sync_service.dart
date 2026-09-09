import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:workmanager/workmanager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import '../crypto/device_signature_service.dart';
import '../database/database_service.dart';
import 'evidence_service.dart';
import '../utils/sms_encoder.dart';
import '../utils/steganography_service.dart';
import '../utils/censorship_detector.dart';

// Définition de la tâche pour Workmanager
const String syncTaskName = "syncPendingReportsTask";

// Callback top-level pour Workmanager
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task == syncTaskName) {
      print("Workmanager: Lancement de la synchronisation...");
      try {
        final syncService = SyncService();
        await syncService.syncPendingReports();
        return Future.value(true);
      } catch (e) {
        print("Workmanager: Échec (Probablement DB verrouillée): $e");
        return Future.value(false);
      }
    }
    return Future.value(true);
  });
}

class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  StreamSubscription<ConnectivityResult>? _subscription;
  StreamSubscription<bool>? _censorshipSubscription;
  bool _isSyncing = false;
  int _failureCount = 0;

  // URL de l'API (À configurer via .env en prod)
  final String reportsApiUrl = 'http://10.0.2.2:8095/api/v1/reports';
  final String pvApiUrl = 'http://10.0.2.2:8095/api/v1/pv';
  final String pvUploadApiUrl = 'http://10.0.2.2:8095/api/v1/pv-photos';

  /// Initialise le service, workmanager et le détecteur de censure
  Future<void> init() async {
    // Démarrer le détecteur de censure
    CensorshipDetector().startMonitoring();

    // Écouter les changements de censure
    _censorshipSubscription = CensorshipDetector().onCensorshipChange.listen((
      isCensored,
    ) {
      if (isCensored) {
        print("SyncService: Censure détectée ! Bascule automatique vers SMS.");
        _forceSmsMode();
      } else {
        print("SyncService: Réseau normal rétabli. Reprise de la sync API.");
        syncPendingReports();
      }
    });

    // Écouteur connectivité
    _subscription = Connectivity().onConnectivityChanged.listen((
      ConnectivityResult result,
    ) {
      if (result != ConnectivityResult.none) {
        syncPendingReports();
      }
    });

    // Initialisation Workmanager
    await Workmanager().initialize(callbackDispatcher, isInDebugMode: true);

    // Enregistrement de la tâche périodique (15 min)
    await Workmanager().registerPeriodicTask(
      "1",
      syncTaskName,
      frequency: const Duration(minutes: 15),
      constraints: Constraints(networkType: NetworkType.connected),
    );
  }

  void stop() {
    _subscription?.cancel();
    _censorshipSubscription?.cancel();
    CensorshipDetector().stopMonitoring();
  }

  /// En mode censure : envoie tous les rapports en attente via SMS
  Future<void> _forceSmsMode() async {
    try {
      final db = await DatabaseService().database;
      final List<Map<String, dynamic>> pending = await db.query(
        'local_reports',
        where: 'synced_at IS NULL',
      );

      for (var reportData in pending) {
        await sendViaSmsFallBack(reportData);
      }
    } catch (e) {
      print("SyncService: Erreur mode censure : $e");
    }
  }

  /// Synchronise les rapports en attente (synced_at IS NULL)
  Future<void> syncPendingReports() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      // Vérifier d'abord si la censure est active
      if (CensorshipDetector().isCensored) {
        print("SyncService: Censure active, bascule vers SMS...");
        await _forceSmsMode();
        return;
      }

      final db = await DatabaseService().database;

      final List<Map<String, dynamic>> pending = await db.query(
        'local_reports',
        where: 'synced_at IS NULL',
      );

      if (pending.isEmpty) {
        _isSyncing = false;
        return;
      }

      print("SyncService: ${pending.length} rapports à synchroniser...");

      for (var reportData in pending) {
        final success = await _sendToApi(reportData);
        if (success) {
          _failureCount = 0;
          await db.update(
            'local_reports',
            {
              'synced_at': DateTime.now().toIso8601String(),
              'status': 'verified',
            },
            where: 'id = ?',
            whereArgs: [reportData['id']],
          );
          print("SyncService: Rapport ${reportData['id']} synchronisé.");
        } else {
          _failureCount++;
          if (_failureCount >= 3) {
            print("SyncService: 3 échecs consécutifs. Vérification censure...");

            // Vérifier si c'est de la censure
            final isCensored = await CensorshipDetector().checkCensorship();
            if (isCensored) {
              print(
                "SyncService: Censure confirmée ! Bascule SMS automatique.",
              );
            } else {
              print("SyncService: Pas de censure, bascule SMS par précaution.");
            }

            await sendViaSmsFallBack(reportData);
            _failureCount = 0;
            break;
          }
        }
      }

      await syncPendingPvSubmissions();
    } catch (e) {
      print("SyncService Erreur : $e");
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> syncPendingPvSubmissions() async {
    final pendingPvs = await DatabaseService().getPendingPvSubmissions();
    if (pendingPvs.isEmpty) return;

    const storage = FlutterSecureStorage();
    final token = await storage.read(key: 'access_token');
    await const DeviceSignatureService().registerPublicKeyIfPossible();

    for (final pv in pendingPvs) {
      var pvPhotoUrl = pv.pvPhotoUrl;
      final payload = {
        'election_id': pv.electionId,
        'polling_station_id': pv.pollingStationId,
        'registered_voters': pv.registeredVoters,
        'voters_count': pv.votersCount,
        'null_votes': pv.nullVotes,
        'blank_votes': pv.blankVotes,
        'disputed_votes': pv.disputedVotes,
        'pv_photo_url': pvPhotoUrl,
        'pv_hash': pv.pvHash,
        'signed_payload_hash': pv.signedPayloadHash,
        'signature': pv.signature,
        'proof_manifest_version': pv.proofManifestVersion,
        'client_recorded_at': pv.clientRecordedAt,
        'device_latitude': pv.deviceLatitude,
        'device_longitude': pv.deviceLongitude,
        'device_id': pv.deviceId,
        'notes': pv.notes,
        'results': pv.results
            .map(
              (result) => {
                'candidate_id': result.candidateId,
                'votes': result.votes,
              },
            )
            .toList(),
      };

      try {
        if (pv.pvPhotoPath.isNotEmpty && pvPhotoUrl.isEmpty) {
          pvPhotoUrl =
              await EvidenceService(baseUrl: pvUploadApiUrl).uploadEvidence(
            File(pv.pvPhotoPath),
          ) ??
                  '';
          if (pvPhotoUrl.isEmpty) {
            throw Exception('Upload photo PV impossible');
          }
          payload['pv_photo_url'] = pvPhotoUrl;
        }
        final response = await http.post(
          Uri.parse(pvApiUrl),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
          body: jsonEncode(payload),
        );

        if (response.statusCode == 201) {
          final now = DateTime.now();
          final body = jsonDecode(response.body) as Map<String, dynamic>;
          final serverPv = (body['pv'] ?? body) as Map<String, dynamic>;
          await DatabaseService().updatePvSubmissionStatus(
            id: pv.id,
            status: _serverStatus(serverPv) ?? 'submitted',
            serverId: serverPv['id'],
            statusMessage: _serverStatusMessage(serverPv),
            serverPayloadHash: serverPv['server_payload_hash'],
            integrityStatus: serverPv['integrity_status'],
            integrityErrorsJson: _serverIntegrityErrorsJson(serverPv),
            syncedAt: now,
            statusUpdatedAt: now,
          );
        } else {
          await DatabaseService().updatePvSubmissionStatus(
            id: pv.id,
            status: 'failed',
            statusMessage:
                'Envoi refusé par le serveur (${response.statusCode})',
          );
        }
      } catch (e) {
        await DatabaseService().updatePvSubmissionStatus(
          id: pv.id,
          status: 'failed',
          statusMessage: 'Synchronisation impossible: $e',
        );
      }
    }
  }

  Future<int> refreshPvStatuses() async {
    const storage = FlutterSecureStorage();
    final token = await storage.read(key: 'access_token');
    if (token == null) return 0;

    final localPvs = await DatabaseService().getPvSubmissions();
    if (localPvs.isEmpty) return 0;

    final elections = await DatabaseService().getCachedElections();
    var updated = 0;

    for (final election in elections) {
      try {
        final response = await http.get(
          Uri.parse('$pvApiUrl?election_id=${election.id}'),
          headers: {'Authorization': 'Bearer $token'},
        );
        if (response.statusCode != 200) continue;

        final body = jsonDecode(response.body) as Map<String, dynamic>;
        final rawPvs = (body['pv_submissions'] ?? body['pvs'] ?? []) as List;
        for (final raw in rawPvs) {
          final serverPv = raw as Map<String, dynamic>;
          final status = _serverStatus(serverPv);
          if (status == null) continue;

          for (final localPv in localPvs) {
            final sameServerId = localPv.serverId.isNotEmpty &&
                localPv.serverId == (serverPv['id'] ?? '');
            final sameStation = localPv.serverId.isEmpty &&
                localPv.electionId == election.id &&
                localPv.pollingStationId == serverPv['polling_station_id'];
            if (!sameServerId && !sameStation) continue;

            await DatabaseService().updatePvSubmissionStatus(
              id: localPv.id,
              status: status,
              serverId: serverPv['id'],
              statusMessage: _serverStatusMessage(serverPv),
              serverPayloadHash: serverPv['server_payload_hash'],
              integrityStatus: serverPv['integrity_status'],
              integrityErrorsJson: _serverIntegrityErrorsJson(serverPv),
              statusUpdatedAt: DateTime.now(),
            );
            updated++;
            break;
          }
        }
      } catch (_) {
        continue;
      }
    }

    return updated;
  }

  String? _serverStatus(Map<String, dynamic> serverPv) {
    final rawStatus = serverPv['status'] ?? serverPv['verification_status'];
    if (rawStatus is! String || rawStatus.isEmpty) return null;
    return rawStatus;
  }

  String _serverStatusMessage(Map<String, dynamic> serverPv) {
    final message = serverPv['status_message'] ??
        serverPv['review_comment'] ??
        serverPv['clarification_request'] ??
        serverPv['rejection_reason'];
    return message is String ? message : '';
  }

  String _serverIntegrityErrorsJson(Map<String, dynamic> serverPv) {
    final errors = serverPv['integrity_errors'];
    if (errors is List) return jsonEncode(errors);
    return '[]';
  }

  Future<void> sendViaSmsFallBack(Map<String, dynamic> data) async {
    try {
      // 1. Encodage et Compression
      final minified = SmsEncoder.minify(data);
      final payload = SmsEncoder.encode(minified);

      // 2. Stéganographie
      final message = SteganographyService.mask(payload);

      // 3. Récupération de la Gateway
      const storage = FlutterSecureStorage();
      String? gateway = await storage.read(key: 'sms_gateway_number');
      gateway ??= "+237600000000"; // Fallback par défaut

      // 4. Envoi via Intent
      final Uri smsUri = Uri(
        scheme: 'sms',
        path: gateway,
        queryParameters: <String, String>{'body': message},
      );

      if (await canLaunchUrl(smsUri)) {
        await launchUrl(smsUri);

        // 5. Mise à jour locale
        final db = await DatabaseService().database;
        await db.update(
          'local_reports',
          {'status': 'SENT_VIA_SMS_PENDING'},
          where: 'id = ?',
          whereArgs: [data['id']],
        );

        print("SyncService: SMS Intent lancé pour le rapport ${data['id']}");
      } else {
        print("SyncService: Impossible de lancer l'app SMS");
      }
    } catch (e) {
      print("SyncService: Erreur Fallback SMS : $e");
    }
  }

  Future<bool> _sendToApi(Map<String, dynamic> data) async {
    try {
      final payload = {
        'observer_id': data['observer_id'],
        'incident_type': data['incident_type'],
        'description': data['description'],
        'latitude': data['latitude'],
        'longitude': data['longitude'],
        'proof_url': data['proof_url'],
      };

      final storage = const FlutterSecureStorage();
      final token = await storage.read(key: 'access_token');

      final response = await http.post(
        Uri.parse(reportsApiUrl),
        headers: {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode(payload),
      );

      if (response.statusCode == 201) {
        return true;
      } else {
        print(
          "SyncService: Rejet API (${response.statusCode}) : ${response.body}",
        );
        return false;
      }
    } catch (e) {
      print("SyncService: Échec HTTP : $e");
      return false;
    }
  }
}
