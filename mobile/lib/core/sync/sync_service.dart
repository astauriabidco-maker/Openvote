import 'dart:async';
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:workmanager/workmanager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import '../database/database_service.dart';
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
  final String apiUrl = 'http://10.0.2.2:8095/api/v1/reports'; 

  /// Initialise le service, workmanager et le détecteur de censure
  Future<void> init() async {
    // Démarrer le détecteur de censure
    CensorshipDetector().startMonitoring();

    // Écouter les changements de censure
    _censorshipSubscription = CensorshipDetector().onCensorshipChange.listen((isCensored) {
      if (isCensored) {
        print("SyncService: Censure détectée ! Bascule automatique vers SMS.");
        _forceSmsMode();
      } else {
        print("SyncService: Réseau normal rétabli. Reprise de la sync API.");
        syncPendingReports();
      }
    });

    // Écouteur connectivité
    _subscription = Connectivity().onConnectivityChanged.listen((ConnectivityResult result) {
      if (result != ConnectivityResult.none) {
        syncPendingReports();
      }
    });

    // Initialisation Workmanager
    await Workmanager().initialize(
      callbackDispatcher,
      isInDebugMode: true,
    );

    // Enregistrement de la tâche périodique (15 min)
    await Workmanager().registerPeriodicTask(
      "1",
      syncTaskName,
      frequency: const Duration(minutes: 15),
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
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
            {'synced_at': DateTime.now().toIso8601String(), 'status': 'verified'},
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
              print("SyncService: Censure confirmée ! Bascule SMS automatique.");
            } else {
              print("SyncService: Pas de censure, bascule SMS par précaution.");
            }
            
            await sendViaSmsFallBack(reportData);
            _failureCount = 0;
            break;
          }
        }
      }
    } catch (e) {
      print("SyncService Erreur : $e");
    } finally {
      _isSyncing = false;
    }
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
        queryParameters: <String, String>{
          'body': message,
        },
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
        Uri.parse(apiUrl),
        headers: {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode(payload),
      );

      if (response.statusCode == 201) {
        return true;
      } else {
        print("SyncService: Rejet API (${response.statusCode}) : ${response.body}");
        return false;
      }
    } catch (e) {
      print("SyncService: Échec HTTP : $e");
      return false;
    }
  }
}
