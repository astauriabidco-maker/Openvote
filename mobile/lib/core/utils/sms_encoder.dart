import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';

class SmsEncoder {
  /// Minifie le rapport pour réduire la taille du JSON.
  /// Keys: t (type), d (description), la (latitude), lo (longitude), p (proof_url), o (observer_id)
  static Map<String, dynamic> minify(Map<String, dynamic> report) {
    return {
      't': report['incident_type'],
      'd': report['description'],
      'la': report['latitude'],
      'lo': report['longitude'],
      'p': report['proof_url'],
      'o': report['observer_id'],
    };
  }

  /// Compresse la chaîne JSON avec Gzip et encode le résultat en Base64.
  static String encode(Map<String, dynamic> minifiedReport) {
    final jsonStr = jsonEncode(minifiedReport);
    final bytes = utf8.encode(jsonStr);
    
    // Compression Gzip
    final gzipBytes = GZipEncoder().encode(bytes);
    if (gzipBytes == null) return base64Encode(bytes); // Fallback si compression échoue

    // Encodage Base64
    return base64Encode(gzipBytes);
  }

  /// Décode une chaîne Base64 compressée en Gzip vers un objet JSON.
  static Map<String, dynamic> decode(String base64Str) {
    final gzipBytes = base64Decode(base64Str);
    
    // Décompression Gzip
    final bytes = GZipDecoder().decodeBytes(gzipBytes);
    final jsonStr = utf8.decode(bytes);
    
    return jsonDecode(jsonStr);
  }
}
