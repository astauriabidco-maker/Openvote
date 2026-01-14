import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'core/database/database_service.dart';
import 'core/sync/sync_service.dart';
import 'core/models/report.dart'; // Import du modèle Report
import 'features/camouflage/presentation/calculator_screen.dart';

import 'package:shared_preferences/shared_preferences.dart';
import 'features/auth/presentation/enrolment_screen.dart';

void main() {
  runApp(const OpenvoteApp());
}

class OpenvoteApp extends StatefulWidget {
  const OpenvoteApp({super.key});

  @override
  State<OpenvoteApp> createState() => _OpenvoteAppState();
}

class _OpenvoteAppState extends State<OpenvoteApp> {
  bool? _isEnrolled;

  @override
  void initState() {
    super.initState();
    _checkEnrolment();
  }

  Future<void> _checkEnrolment() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _isEnrolled = prefs.getBool('is_enrolled') ?? false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isEnrolled == null) {
      return const MaterialApp(home: Scaffold(body: Center(child: CircularProgressIndicator())));
    }

    return MaterialApp(
      title: 'Openvote',
      theme: ThemeData(
        brightness: Brightness.dark,
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      routes: {
        '/home': (context) => const InitializationPage(), // Après enrolment, on va vers init DB (ou login PIN)
      },
      home: _isEnrolled!
          ? Builder(
              builder: (context) => CalculatorScreen(
                onUnlock: () {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (context) => const InitializationPage()),
                  );
                },
              ),
            )
          : const EnrolmentScreen(),
    );
  }
}

class InitializationPage extends StatefulWidget {
  const InitializationPage({super.key});

  @override
  State<InitializationPage> createState() => _InitializationPageState();
}

class _InitializationPageState extends State<InitializationPage> {
  final TextEditingController _passwordController = TextEditingController();
  bool _isInitialized = false;
  String _status = "Base de données verrouillée";

  Future<void> _initializeDB() async {
    final password = _passwordController.text;

    // Logique du Code de détresse (Duress PIN)
    if (password == '0000') {
      await DatabaseService().emergencyWipe();
      setState(() {
        _status = "DONNÉES EFFACÉES (Code de détresse activé)";
        _passwordController.clear();
      });
      return;
    }

    try {
      await DatabaseService().openEncryptedDatabase(password);
      // Lancer le service de synchronisation et le worker
      await SyncService().init();
      
      setState(() {
        _isInitialized = true;
        _status = "Base de données ouverte et SyncService démarré !";
      });
      
      // Naviguer vers la page d'accueil après un court délai
      Future.delayed(const Duration(seconds: 1), () {
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (context) => const HomePage()),
          );
        }
      });
    } catch (e) {
      setState(() {
        _status = "Erreur : Mot de passe incorrect ou échec d'ouverture.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Openvote - Sécurité Mobile")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.lock, size: 64, color: Colors.blue),
            const SizedBox(height: 24),
            Text(_status, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            if (!_isInitialized) ...[
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(
                  labelText: "Mot de passe de la base",
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _initializeDB,
                child: const Text("Déverrouiller"),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final TextEditingController _reportController = TextEditingController();
  String _selectedIncidentType = 'Fraude'; // Valeur par défaut
  final List<String> _incidentTypes = ['Fraude', 'Violence', 'Intimidation', 'Logistique', 'Autre'];

  Future<void> _saveReport() async {
    if (_reportController.text.isEmpty) return;

    final report = Report(
      id: const Uuid().v4(),
      observerId: "obs-mobile-001", // TODO: Récupérer depuis session/auth local
      incidentType: _selectedIncidentType,
      description: _reportController.text,
      latitude: 48.8566, // Mock: Paris (devrait venir de Geolocator)
      longitude: 2.3522,
      h3Index: "", // Backend calculera ou on le fait ici si on a la lib
      status: "pending",
      createdAt: DateTime.now(),
    );

    await DatabaseService().saveReport(report);

    _reportController.clear();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Signalement sauvegardé localement (Offline-First)")),
      );
    }

    // Déclencher manuellement une tentative de synchro
    SyncService().syncPendingReports();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Openvote - Signalements")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              value: _selectedIncidentType,
              decoration: const InputDecoration(labelText: "Type d'incident"),
              items: _incidentTypes.map((String type) {
                return DropdownMenuItem<String>(
                  value: type,
                  child: Text(type),
                );
              }).toList(),
              onChanged: (String? newValue) {
                setState(() {
                  _selectedIncidentType = newValue!;
                });
              },
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _reportController,
              decoration: const InputDecoration(
                labelText: "Description de l'incident",
                hintText: "Décrivez ce que vous observez...",
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _saveReport,
              icon: const Icon(Icons.send),
              label: const Text("Envoyer (Offline-First)"),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.all(16),
                backgroundColor: Colors.blueAccent,
                foregroundColor: Colors.white,
              ),
            ),
            const Divider(height: 40),
            const Text(
              "Les rapports sont chiffrés et stockés localement en priorité. La synchronisation se fait automatiquement.",
              style: TextStyle(color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class OpenvoteApp extends StatelessWidget {
  const OpenvoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Openvote',
      theme: ThemeData(
        brightness: Brightness.dark,
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      home: Builder(
        builder: (context) => CalculatorScreen(
          onUnlock: () {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (context) => const InitializationPage()),
            );
          },
        ),
      ),
    );
  }
}

class InitializationPage extends StatefulWidget {
  const InitializationPage({super.key});

  @override
  State<InitializationPage> createState() => _InitializationPageState();
}

class _InitializationPageState extends State<InitializationPage> {
  final TextEditingController _passwordController = TextEditingController();
  bool _isInitialized = false;
  String _status = "Base de données verrouillée";

  Future<void> _initializeDB() async {
    final password = _passwordController.text;

    // Logique du Code de détresse (Duress PIN)
    if (password == '0000') {
      await DatabaseService().emergencyWipe();
      setState(() {
        _status = "DONNÉES EFFACÉES (Code de détresse activé)";
        _passwordController.clear();
      });
      return;
    }

    try {
      await DatabaseService().openEncryptedDatabase(password);
      // Lancer le service de synchronisation et le worker
      await SyncService().init();
      
      setState(() {
        _isInitialized = true;
        _status = "Base de données ouverte et SyncService démarré !";
      });
      
      // Naviguer vers la page d'accueil après un court délai
      Future.delayed(const Duration(seconds: 1), () {
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (context) => const HomePage()),
          );
        }
      });
    } catch (e) {
      setState(() {
        _status = "Erreur : Mot de passe incorrect ou échec d'ouverture.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Openvote - Sécurité Mobile")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.lock, size: 64, color: Colors.blue),
            const SizedBox(height: 24),
            Text(_status, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            if (!_isInitialized) ...[
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(
                  labelText: "Mot de passe de la base",
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _initializeDB,
                child: const Text("Déverrouiller"),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final TextEditingController _reportController = TextEditingController();

  Future<void> _saveReport() async {
    if (_reportController.text.isEmpty) return;

    final db = await DatabaseService().database;
    final reportId = const Uuid().v4();
    
    await db.insert('pending_reports', {
      'id': reportId,
      'content': _reportController.text,
      'latitude': 48.8566, // Exemple: Paris
      'longitude': 2.3522,
      'h3_index': '8a2a1072b59ffff',
      'report_hash': 'sha256-placeholder',
      'created_at': DateTime.now().toIso8601String(),
    });

    _reportController.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Signalement sauvegardé localement (Offline-First)")),
    );

    // Déclencher manuellement une tentative de synchro
    SyncService().syncPendingReports();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Openvote - Signalements")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            TextField(
              controller: _reportController,
              decoration: const InputDecoration(
                labelText: "Contenu du signalement",
                hintText: "Décrivez l'incident...",
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _saveReport,
              icon: const Icon(Icons.send),
              label: const Text("Envoyer"),
            ),
            const Divider(height: 40),
            const Text("Les rapports sont stockés localement et synchronisés dès qu'une connexion est détectée."),
          ],
        ),
      ),
    );
  }
}
