import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/auth/offline_session_service.dart';

void main() {
  group('OfflineSessionService', () {
    test('extractObserverId lit observer_id direct', () {
      final observerId = OfflineSessionService.extractObserverId({
        'observer_id': ' observer-001 ',
      });

      expect(observerId, 'observer-001');
    });

    test('extractObserverId lit user.id quand disponible', () {
      final observerId = OfflineSessionService.extractObserverId({
        'user': {'id': 'user-123'},
      });

      expect(observerId, 'user-123');
    });

    test('extractObserverId retourne null sans identité exploitable', () {
      final observerId = OfflineSessionService.extractObserverId({
        'access_token': 'token-only',
      });

      expect(observerId, isNull);
    });
  });
}
