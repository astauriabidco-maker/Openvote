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

// Définition de la tâche pour Workmanager
const String syncTaskName = "syncPendingReportsTask";

// Callback top-level pour Workmanager
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    if (task == syncTaskName) {
      print("Workmanager: Lancement de la synchronisation...");
      // Note: Workmanager lance un isolate vierge. 
      // Il faut s'assurer que DatabaseService peut s'ouvrir.
      // PROBLÈME: SQLCipher a besoin du mot de passe en RAM.
      // En arrière-plan complet (kill state), le mot de passe est PERDU (Security Feature).
      // Donc la sync périodique ne peut fonctionner QUE si l'app est en mémoire ou si on a un mécanisme
      // MAIS les règles disent : "Ne JAMAIS stocker le mot de passe ... sur le disque".
      // CONSÉQUENCE : La sync background "pure" (app tuée) est impossible sans l'interaction user pour déverrouiller.
      // COMPROMIS : Le Workmanager ne fonctionnera que si le mot de passe est encore en mémoire ou accessible (ex: foreground service).
      // OU ALORS : On accepte que la sync ne se fasse qu'au lancement de l'app ou en background immédiat.
      
      // Cependant, pour respecter la demande "Worker ... périodiquement", je code la structure.
      // Si l'app est kill, DatabaseService().database throwera une exception "mot de passe requis".
      // C'est le comportement "Secure & Offline-First" attendu.
      
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
  bool _isSyncing = false;
  int _failureCount = 0;
  
  // URL de l'API (À configurer via .env en prod)
  // Pour émulateur Android utilise 10.0.2.2, pour iOS localhost
  final String apiUrl = 'http://10.0.2.2:8095/api/v1/reports'; 

  /// Initialise le service et workmanager
  Future<void> init() async {
    // Écouteur connectivité
    _subscription = Connectivity().onConnectivityChanged.listen((ConnectivityResult result) {
      if (result != ConnectivityResult.none) {
        syncPendingReports();
      }
    });

    // Initialisation Workmanager
    await Workmanager().initialize(
      callbackDispatcher,
      isInDebugMode: true, // Pour voir les logs en dev
    );

    // Enregistrement de la tâche périodique (15 min)
    await Workmanager().registerPeriodicTask(
      "1", // Unique Name
      syncTaskName,
      frequency: const Duration(minutes: 15),
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
    );
  }

  void stop() {
    _subscription?.cancel();
  }

  /// Synchronise les rapports en attente (synced_at IS NULL)
  Future<void> syncPendingReports() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      final db = await DatabaseService().database;
      
      // Sélectionner les rapports non synchronisés
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
          _failureCount = 0; // Reset on success
          // Mise à jour du timestamp synced_at
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
            print("SyncService: 3 échecs consécutifs. Bascule SMS...");
            await sendViaSmsFallBack(reportData);
            _failureCount = 0; // Reset after fallback attempt
            break; // Stop current sync batch
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
      gateway ??= "+237600000000"; // Fallback par défaut pour démo

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
      // Mapping vers le DTO attendu par le Backend
      // CreateReportRequest: observer_id, incident_type, description, latitude, longitude
      
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
      return false; // Réessaiera plus tard
    }
  }
}
