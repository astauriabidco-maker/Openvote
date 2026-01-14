import 'dart:io';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as path;

class EvidenceService {
  final String baseUrl = 'http://10.0.2.2:8095/api/v1/reports';

  /// Gère l'upload complet d'une preuve vers MinIO via une URL présignée.
  Future<String?> uploadEvidence(File file) async {
    try {
      final fileName = path.basename(file.path);
      
      // 1. Demander une URL présignée au Backend
      final uploadUrlInfo = await _getGetPresignedUrl(fileName);
      if (uploadUrlInfo == null) return null;

      final uploadUrl = uploadUrlInfo['upload_url'];
      if (uploadUrl == null) return null;

      // 2. Upload direct vers MinIO via PUT
      final success = await _uploadToMinio(uploadUrl, file);
      if (success) {
        // Retourne le nom du fichier (S3 Key) pour le lier au rapport
        return fileName;
      }
      return null;
    } catch (e) {
      print("EvidenceService: Erreur d'upload : $e");
      return null;
    }
  }

  Future<Map<String, dynamic>?> _getGetPresignedUrl(String fileName) async {
    const storage = FlutterSecureStorage();
    final token = await storage.read(key: 'access_token');

    final response = await http.get(
      Uri.parse('$baseUrl/upload-url?file_name=$fileName'),
      headers: {
        if (token != null) 'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      print("EvidenceService: Échec récupération URL présignée (${response.statusCode})");
      return null;
    }
  }

  Future<bool> _uploadToMinio(String url, File file) async {
    final bytes = await file.readAsBytes();
    
    // Pour MinIO via presigned URL, on utilise souvent un PUT binaire
    final response = await http.put(
      Uri.parse(url),
      body: bytes,
      headers: {
        'Content-Type': _getContentType(file.path),
      },
    );

    if (response.statusCode == 200) {
      print("EvidenceService: Upload MinIO réussi");
      return true;
    } else {
      print("EvidenceService: Échec upload MinIO (${response.statusCode}) : ${response.body}");
      return false;
    }
  }

  String _getContentType(String filePath) {
    final ext = path.extension(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.mp4':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }
}
