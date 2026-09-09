import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openvote_mobile/core/crypto/device_signature_service.dart';

void main() {
  group('DeviceSignatureService', () {
    test('signature raw ECDSA P-256 encodée en base64url', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      FlutterSecureStorage.setMockInitialValues({});

      final signature = await const DeviceSignatureService().signCanonicalPayload(
        '{"proof_manifest_version":1,"election_id":"election-001"}',
      );
      final raw = base64Url.decode(base64Url.normalize(signature));

      expect(raw, hasLength(64));
      expect(signature.contains('='), isFalse);
    });
  });
}
