import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/utils/sms_encoder.dart';
import 'package:openvote_mobile/core/utils/steganography_service.dart';

void main() {
  group('SMS Fallback Tests', () {
    final testReport = {
      'incident_type': 'Fraude électorale',
      'description': 'Bourrage d\'urnes constaté au bureau 12.',
      'latitude': 4.05,
      'longitude': 9.7,
      'proof_url': 'http://secure-storage.internal/proof123',
      'observer_id': 'obs_456',
    };

    test('SmsEncoder: Minification should reduce map keys', () {
      final minified = SmsEncoder.minify(testReport);
      expect(minified.containsKey('t'), true);
      expect(minified.containsKey('d'), true);
      expect(minified.containsKey('la'), true);
      expect(minified.containsKey('lo'), true);
      expect(minified['t'], 'Fraude électorale');
    });

    test('SmsEncoder: Full cycle (Encode/Decode) should preserve data', () {
      final minified = SmsEncoder.minify(testReport);
      final encoded = SmsEncoder.encode(minified);
      
      print('Encoded Payload (Base64+Gzip): $encoded');
      expect(encoded.isNotEmpty, true);

      final decoded = SmsEncoder.decode(encoded);
      expect(decoded['t'], testReport['incident_type']);
      expect(decoded['d'], testReport['description']);
    });

    test('SteganographyService: Mask should contain payload', () {
      const payload = "H4sIAAAAAAAA/zI0MDAwAQA";
      final masked = SteganographyService.mask(payload);
      
      print('Masked Message: $masked');
      expect(masked.contains(payload), true);
      expect(masked.length > payload.length, true);
    });
  });
}
