import 'dart:convert';
import 'dart:io';

class EncodingHelper {
  static const String _templatePrefix = "Salut maman, code course [";
  static const String _templateSuffix = "]";

  /// Encode un objet JSON en un message SMS obfusqué
  static String encode(Map<String, dynamic> jsonObject) {
    // 1. Convertir JSON en String
    String jsonString = jsonEncode(jsonObject);
    
    // 2. Compresser (Gzip)
    List<int> stringBytes = utf8.encode(jsonString);
    List<int> gzippedBytes = gzip.encode(stringBytes);
    
    // 3. Encoder en Base64
    String base64Payload = base64Encode(gzippedBytes);
    
    // 4. Insérer dans le template
    return "$_templatePrefix$base64Payload$_templateSuffix";
  }

  /// Décode un message SMS obfusqué en objet JSON
  static Map<String, dynamic>? decode(String obfuscatedMessage) {
    try {
      if (!obfuscatedMessage.startsWith(_templatePrefix) || !obfuscatedMessage.endsWith(_templateSuffix)) {
        return null;
      }

      // 1. Extraire le payload
      String base64Payload = obfuscatedMessage.substring(
        _templatePrefix.length,
        obfuscatedMessage.length - _templateSuffix.length,
      );

      // 2. Décoder Base64
      List<int> gzippedBytes = base64Decode(base64Payload);

      // 3. Décompresser (Gzip)
      List<int> stringBytes = gzip.decode(gzippedBytes);
      String jsonString = utf8.decode(stringBytes);

      // 4. Parser JSON
      return jsonDecode(jsonString);
    } catch (e) {
      print("Erreur de décodage stéganographique : $e");
      return null;
    }
  }
}
