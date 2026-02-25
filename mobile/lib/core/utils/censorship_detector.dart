import 'dart:async';
import 'dart:io';

/// Service de détection de censure internet
/// Vérifie l'accessibilité de sites connus et de l'API backend
/// pour détecter un blocage réseau (censure, coupure ciblée)
class CensorshipDetector {
  static final CensorshipDetector _instance = CensorshipDetector._internal();
  factory CensorshipDetector() => _instance;
  CensorshipDetector._internal();

  bool _isCensored = false;
  bool get isCensored => _isCensored;

  StreamController<bool>? _controller;
  Stream<bool> get onCensorshipChange {
    _controller ??= StreamController<bool>.broadcast();
    return _controller!.stream;
  }

  Timer? _checkTimer;

  // Points de vérification : sites normalement accessibles partout
  // On évite Google/Facebook (déjà bloqués dans certains pays)
  static const List<String> _probeUrls = [
    'https://www.wikipedia.org',      // Rarement censuré
    'https://www.bbc.com',            // Service d'info international
    'https://cloudflare.com',         // Infrastructure CDN
  ];

  // URL de l'API backend (à configurer)
  String _apiBaseUrl = 'http://10.0.2.2:8095';

  void setApiUrl(String url) {
    _apiBaseUrl = url;
  }

  /// Démarre la surveillance périodique (toutes les 2 minutes)
  void startMonitoring({Duration interval = const Duration(minutes: 2)}) {
    _checkTimer?.cancel();
    _checkTimer = Timer.periodic(interval, (_) => checkCensorship());
    // Vérification initiale
    checkCensorship();
  }

  void stopMonitoring() {
    _checkTimer?.cancel();
    _checkTimer = null;
  }

  /// Effectue un diagnostic de censure complet
  /// Retourne true si la censure est détectée
  Future<bool> checkCensorship() async {
    int reachableProbes = 0;
    bool apiReachable = false;

    // 1. Tester les sites de sondage
    for (final url in _probeUrls) {
      if (await _isReachable(url)) {
        reachableProbes++;
      }
    }

    // 2. Tester l'API backend
    apiReachable = await _isReachable('$_apiBaseUrl/health');

    // 3. Analyse des résultats
    bool previousState = _isCensored;

    if (reachableProbes == 0 && !apiReachable) {
      // Aucun accès : Coupure internet totale (pas forcément censure)
      _isCensored = false; // Pas de censure, juste pas de réseau
    } else if (reachableProbes > 0 && !apiReachable) {
      // Internet fonctionne MAIS l'API est inaccessible : CENSURE probable
      _isCensored = true;
    } else if (reachableProbes == 0 && apiReachable) {
      // Cas rare : API accessible mais pas les sites publics
      _isCensored = false;
    } else {
      // Tout fonctionne normalement
      _isCensored = false;
    }

    // Notification si changement d'état
    if (_isCensored != previousState) {
      _controller?.add(_isCensored);
      if (_isCensored) {
        print("[CENSORSHIP DETECTOR] ⚠️ Censure détectée ! Bascule vers les canaux alternatifs.");
      } else {
        print("[CENSORSHIP DETECTOR] ✅ Accès réseau normal rétabli.");
      }
    }

    return _isCensored;
  }

  /// Vérifie si une URL est accessible (timeout court)
  Future<bool> _isReachable(String url) async {
    try {
      final uri = Uri.parse(url);
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 5);
      
      final request = await client.getUrl(uri);
      final response = await request.close().timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw TimeoutException('Timeout'),
      );
      
      client.close();
      return response.statusCode < 500;
    } catch (e) {
      return false;
    }
  }

  /// Retourne un diagnostic lisible
  Future<Map<String, dynamic>> getDiagnostic() async {
    final results = <String, bool>{};
    
    for (final url in _probeUrls) {
      results[url] = await _isReachable(url);
    }
    results['API Backend'] = await _isReachable('$_apiBaseUrl/health');

    return {
      'is_censored': _isCensored,
      'probe_results': results,
      'timestamp': DateTime.now().toIso8601String(),
    };
  }

  void dispose() {
    _checkTimer?.cancel();
    _controller?.close();
  }
}
