import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/sync/sync_service.dart';

class EnrolmentScreen extends StatefulWidget {
  const EnrolmentScreen({super.key});

  @override
  State<EnrolmentScreen> createState() => _EnrolmentScreenState();
}

class _EnrolmentScreenState extends State<EnrolmentScreen> {
  final MobileScannerController controller = MobileScannerController();
  final storage = const FlutterSecureStorage();
  
  String? _scannedToken;
  String _pin = "";
  bool _isLoading = false;

  void _onDetect(BarcodeCapture capture) {
    if (_scannedToken != null) return;
    
    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      if (barcode.rawValue != null) {
        setState(() {
          _scannedToken = barcode.rawValue;
        });
        // Stop scanning once found
        controller.stop();
        break;
      }
    }
  }

  Future<void> _submitEnrollment() async {
    if (_scannedToken == null || _pin.length < 4) return;

    setState(() => _isLoading = true);

    try {
      // 10.0.2.2 pour émulateur Android, localhost pour iOS
      // const baseUrl = 'http://10.0.2.2:8095/api/v1'; 
      // Utilisation de l'URL definie dans SyncService pour cohérence (même si c'est privé)
      const baseUrl = 'http://10.0.2.2:8095/api/v1';

      final response = await http.post(
        Uri.parse('$baseUrl/auth/enroll'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'activation_token': _scannedToken,
          'pin': _pin,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        // Stockage sécurisé des tokens
        await storage.write(key: 'access_token', value: data['access_token']);
        await storage.write(key: 'refresh_token', value: data['refresh_token']);
        
        // Stocker le PIN user pour le Duress Code local (si besoin) ou simple login local
        // Ici on stocke juste un flag comme quoi l'app est initialisée
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('is_enrolled', true);
        await prefs.setString('user_pin', _pin); // À sécuriser mieux en prod

        if (mounted) {
           Navigator.of(context).pushReplacementNamed('/home');
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erreur: ${response.body}')),
          );
          // Restart cam
          setState(() {
             _scannedToken = null;
          });
          controller.start();
        }
      }
    } catch (e) {
      if (mounted) {
         ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erreur réseau: $e')),
         );
      }
    } finally {
      if (mounted) {
         setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_scannedToken == null) {
      // Étape 1: Scanner
      return Scaffold(
        appBar: AppBar(title: const Text('Scanner le QR d\'activation')),
        body: MobileScanner(
          controller: controller,
          onDetect: _onDetect,
        ),
      );
    } else {
      // Étape 2: Définir le PIN
      return Scaffold(
        appBar: AppBar(title: const Text('Définir votre Code PIN')),
        body: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'Token détecté !', 
                style: TextStyle(color: Colors.green, fontSize: 16, fontWeight: FontWeight.bold)
              ),
              const SizedBox(height: 20),
              const Text('Choisissez un code PIN (4-8 chiffres) pour sécuriser l\'accès local.'),
              const SizedBox(height: 20),
              TextField(
                keyboardType: TextInputType.number,
                obscureText: true,
                maxLength: 8,
                onChanged: (val) => _pin = val,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Code PIN',
                ),
              ),
              const SizedBox(height: 30),
              _isLoading 
                 ? const CircularProgressIndicator()
                 : ElevatedButton(
                    onPressed: _submitEnrollment,
                    child: const Text('Activer l\'application'),
                   )
            ],
          ),
        ),
      );
    }
  }
}
