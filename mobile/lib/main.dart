import 'dart:io';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'package:image_picker/image_picker.dart';
import 'core/database/database_service.dart';
import 'core/sync/sync_service.dart';
import 'core/sync/evidence_service.dart';
import 'core/models/report.dart';
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
        '/home': (context) => const InitializationPage(),
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

    // Logique du Code de détresse (Duress PIN) - configurable
    if (await DatabaseService.isDuressPin(password)) {
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
  String _selectedIncidentType = 'Fraude';
  final List<String> _incidentTypes = ['Fraude', 'Violence', 'Intimidation', 'Logistique', 'Autre'];
  File? _capturedImage;
  bool _isUploading = false;
  String? _uploadedProofUrl;

  /// Capture ou sélection de preuve photo
  Future<void> _captureProof({required bool fromCamera}) async {
    final picker = ImagePicker();
    final XFile? picked = await picker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1080,
      imageQuality: 80, // Compression pour économiser la bande passante
    );

    if (picked != null) {
      setState(() {
        _capturedImage = File(picked.path);
        _uploadedProofUrl = null; // Reset si nouvelle image
      });
    }
  }

  /// Upload de la preuve vers MinIO
  Future<void> _uploadProof() async {
    if (_capturedImage == null) return;
    
    setState(() => _isUploading = true);
    
    try {
      final evidenceService = EvidenceService();
      final result = await evidenceService.uploadEvidence(_capturedImage!);
      
      if (result != null) {
        setState(() {
          _uploadedProofUrl = result;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("✅ Preuve uploadée vers le stockage sécurisé"),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("⚠️ Upload échoué. La preuve sera envoyée à la prochaine sync."),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("❌ Erreur: $e"),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isUploading = false);
    }
  }

  Future<void> _saveReport() async {
    if (_reportController.text.isEmpty) return;

    // Si une image est capturée mais pas encore uploadée, tenter l'upload
    if (_capturedImage != null && _uploadedProofUrl == null) {
      await _uploadProof();
    }

    final report = Report(
      id: const Uuid().v4(),
      observerId: "obs-mobile-001", // TODO: Récupérer depuis session/auth local
      incidentType: _selectedIncidentType,
      description: _reportController.text,
      latitude: 48.8566, // Mock: Paris (devrait venir de Geolocator)
      longitude: 2.3522,
      h3Index: "", // Backend calculera
      status: "pending",
      proofUrl: _uploadedProofUrl,
      createdAt: DateTime.now(),
    );

    await DatabaseService().saveReport(report);

    _reportController.clear();
    setState(() {
      _capturedImage = null;
      _uploadedProofUrl = null;
    });
    
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
      body: SingleChildScrollView(
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
            const SizedBox(height: 16),

            // Section preuve photo
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade700),
                borderRadius: BorderRadius.circular(8),
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "📷 Preuve photo (optionnel)",
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 8),
                  
                  // Aperçu de l'image capturée
                  if (_capturedImage != null) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Stack(
                        children: [
                          Image.file(
                            _capturedImage!,
                            height: 150,
                            width: double.infinity,
                            fit: BoxFit.cover,
                          ),
                          // Badge de statut upload
                          Positioned(
                            top: 8,
                            right: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: _uploadedProofUrl != null ? Colors.green : Colors.orange,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                _uploadedProofUrl != null ? "✅ Uploadée" : "⏳ En attente",
                                style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ),
                          // Bouton supprimer
                          Positioned(
                            top: 8,
                            left: 8,
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _capturedImage = null;
                                _uploadedProofUrl = null;
                              }),
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: const BoxDecoration(
                                  color: Colors.red,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.close, size: 16, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  
                  // Boutons de capture
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _isUploading ? null : () => _captureProof(fromCamera: true),
                          icon: const Icon(Icons.camera_alt, size: 18),
                          label: const Text("Caméra"),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _isUploading ? null : () => _captureProof(fromCamera: false),
                          icon: const Icon(Icons.photo_library, size: 18),
                          label: const Text("Galerie"),
                        ),
                      ),
                    ],
                  ),
                  
                  // Indicateur de chargement upload
                  if (_isUploading) ...[
                    const SizedBox(height: 8),
                    const LinearProgressIndicator(),
                    const SizedBox(height: 4),
                    const Text(
                      "Upload de la preuve en cours...",
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _isUploading ? null : _saveReport,
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

