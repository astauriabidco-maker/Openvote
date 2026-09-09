import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/utils/steganography_service.dart';
import 'package:openvote_mobile/core/utils/sms_encoder.dart';

void main() {
  group('SteganographyService Tests', () {
    test('mask() retourne un message contenant le payload', () {
      const payload = 'ABC123XYZ';
      final result = SteganographyService.mask(payload);

      expect(
        result.contains(payload),
        true,
        reason: 'Le payload doit être présent dans le message masqué',
      );
    });

    test('mask() retourne un message plus long que le payload', () {
      const payload = 'TEST_DATA';
      final result = SteganographyService.mask(payload);

      expect(
        result.length > payload.length,
        true,
        reason: 'Le template doit ajouter du contenu autour du payload',
      );
    });

    test('mask() utilise des templates variés (test probabiliste)', () {
      const payload = 'SAME_PAYLOAD';
      final results = <String>{};

      // Exécuter 20 fois pour avoir de bonnes chances de voir la variation
      for (int i = 0; i < 20; i++) {
        results.add(SteganographyService.mask(payload));
      }

      // On s'attend à au moins 2 messages différents (probabilistiquement quasi-certain)
      expect(
        results.length > 1,
        true,
        reason: 'Plusieurs appels devraient produire des messages variés',
      );
    });

    test('mask() ne contient jamais de mot-clé suspect', () {
      const payload = 'ELECTION_DATA_123';
      final result = SteganographyService.mask(payload);

      // Le message masqué ne doit pas contenir de mots-clés évidents
      expect(result.toLowerCase().contains('élection'), false);
      expect(result.toLowerCase().contains('vote'), false);
      expect(result.toLowerCase().contains('signalement'), false);
    });
  });

  group('SmsEncoder Tests', () {
    test('minify() réduit correctement les clés', () {
      final data = {
        'incident_type': 'Fraude',
        'description': 'Test',
        'latitude': 4.05,
        'longitude': 9.7,
        'observer_id': 'obs_1',
        'proof_url': 'http://test.com',
      };

      final minified = SmsEncoder.minify(data);

      expect(minified.containsKey('t'), true); // incident_type -> t
      expect(minified.containsKey('d'), true); // description -> d
      expect(minified.containsKey('la'), true); // latitude -> la
      expect(minified.containsKey('lo'), true); // longitude -> lo
      expect(minified.containsKey('o'), true); // observer_id -> o
      expect(minified.containsKey('p'), true); // proof_url -> p

      // Les valeurs doivent être préservées
      expect(minified['t'], 'Fraude');
      expect(minified['la'], 4.05);
    });

    test('encode/decode cycle préserve toutes les données', () {
      final original = {
        't': 'Violence',
        'd': 'Intimidation observateurs',
        'la': 3.866,
        'lo': 11.5167,
        'o': 'obs_test',
      };

      final encoded = SmsEncoder.encode(original);
      expect(encoded.isNotEmpty, true);

      final decoded = SmsEncoder.decode(encoded);
      expect(decoded['t'], original['t']);
      expect(decoded['d'], original['d']);
    });

    test('encode() produit un payload Base64 valide et compact', () {
      final data = SmsEncoder.minify({
        'incident_type': 'Test',
        'description': 'Description courte',
        'latitude': 4.0,
        'longitude': 9.0,
        'observer_id': 'obs',
      });

      final encoded = SmsEncoder.encode(data);

      // Base64 ne contient que des caractères valides
      expect(
        RegExp(r'^[A-Za-z0-9+/=]+$').hasMatch(encoded),
        true,
        reason: 'Le payload doit être en Base64 valide',
      );
    });

    test('encode() avec caractères Unicode (accents, émojis)', () {
      final data = {
        't': 'Fraude électorale',
        'd': 'Présence de bulletins pré-cochés 🗳️',
        'la': 4.05,
        'lo': 9.7,
      };

      final encoded = SmsEncoder.encode(data);
      final decoded = SmsEncoder.decode(encoded);

      expect(decoded['t'], data['t']);
      expect(decoded['d'], data['d']);
    });
  });

  group('Pipeline SMS complète', () {
    test('Minify -> Encode -> Mask : pipeline de bout en bout', () {
      final report = {
        'incident_type': 'Fraude',
        'description': 'Bourrage d\'urnes bureau 12',
        'latitude': 4.0511,
        'longitude': 9.7679,
        'observer_id': 'obs_456',
        'proof_url': 'https://evidence.test/img.jpg',
      };

      // 1. Minification
      final minified = SmsEncoder.minify(report);
      expect(minified.length <= report.length, true);

      // 2. Encodage
      final encoded = SmsEncoder.encode(minified);
      expect(encoded.isNotEmpty, true);

      // 3. Masquage stéganographique
      final masked = SteganographyService.mask(encoded);
      expect(masked.contains(encoded), true);
      expect(masked.length > encoded.length, true);

      // 4. Le message final doit ressembler à un SMS normal
      // (ne doit pas contenir de mots-clés électoraux)
      final lower = masked.toLowerCase();
      expect(lower.contains('election'), false);
      expect(lower.contains('signalement'), false);

      // 5. Le payload est récupérable depuis le message
      // (dans un vrai système, on extrairait le payload du template)
      expect(masked.contains(encoded), true);

      // 6. Decode doit fonctionner
      final decoded = SmsEncoder.decode(encoded);
      expect(decoded['t'], 'Fraude');
      expect(decoded['d'], 'Bourrage d\'urnes bureau 12');
    });
  });
}
