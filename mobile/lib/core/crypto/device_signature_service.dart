import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:pointycastle/export.dart';

import '../auth/offline_session_service.dart';

class DeviceSignatureService {
  static const _privateDKey = 'device_ecdsa_p256_private_d';
  static const _publicJwkKey = 'device_ecdsa_p256_public_jwk';
  static const _algorithm = 'ECDSA_P256_SHA256';
  static const _apiBaseUrl = 'http://10.0.2.2:8095/api/v1';

  final FlutterSecureStorage _storage;
  final OfflineSessionService _session;

  const DeviceSignatureService({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
    OfflineSessionService session = const OfflineSessionService(),
  })  : _storage = storage,
        _session = session;

  Future<String> signCanonicalPayload(String canonicalPayload) async {
    final keyPair = await _getOrCreateKeyPair();
    final signer = Signer('SHA-256/ECDSA')
      ..init(
        true,
        ParametersWithRandom(
          PrivateKeyParameter<ECPrivateKey>(keyPair.privateKey),
          _secureRandom(),
        ),
      );
    final signature = signer.generateSignature(
      Uint8List.fromList(utf8.encode(canonicalPayload)),
    ) as ECSignature;
    return _base64UrlNoPad(
      Uint8List.fromList([
        ..._leftPad32(signature.r),
        ..._leftPad32(signature.s),
      ]),
    );
  }

  Future<void> registerPublicKeyIfPossible() async {
    final token = await _storage.read(key: OfflineSessionService.accessTokenKey);
    if (token == null || token.trim().isEmpty) return;

    final deviceId = await _session.getOrCreateDeviceId();
    final keyPair = await _getOrCreateKeyPair();
    await http.post(
      Uri.parse('$_apiBaseUrl/device-keys'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'device_id': deviceId,
        'algorithm': _algorithm,
        'public_key_jwk': keyPair.publicJwk,
      }),
    );
  }

  Future<_DeviceKeyPair> _getOrCreateKeyPair() async {
    final storedD = await _storage.read(key: _privateDKey);
    final storedJwk = await _storage.read(key: _publicJwkKey);
    final domain = ECDomainParameters('secp256r1');

    if (storedD != null && storedJwk != null) {
      final d = BigInt.parse(storedD, radix: 16);
      final q = domain.G * d;
      return _DeviceKeyPair(
        privateKey: ECPrivateKey(d, domain),
        publicKey: ECPublicKey(q, domain),
        publicJwk: jsonDecode(storedJwk) as Map<String, dynamic>,
      );
    }

    final generator = ECKeyGenerator()
      ..init(ParametersWithRandom(
        ECKeyGeneratorParameters(domain),
        _secureRandom(),
      ));
    final pair = generator.generateKeyPair();
    final privateKey = pair.privateKey as ECPrivateKey;
    final publicKey = pair.publicKey as ECPublicKey;
    final publicJwk = _toJwk(publicKey);

    await _storage.write(
      key: _privateDKey,
      value: privateKey.d!.toRadixString(16),
    );
    await _storage.write(key: _publicJwkKey, value: jsonEncode(publicJwk));

    return _DeviceKeyPair(
      privateKey: privateKey,
      publicKey: publicKey,
      publicJwk: publicJwk,
    );
  }

  SecureRandom _secureRandom() {
    final random = Random.secure();
    final seed = Uint8List.fromList(
      List<int>.generate(32, (_) => random.nextInt(256)),
    );
    return FortunaRandom()..seed(KeyParameter(seed));
  }

  Map<String, dynamic> _toJwk(ECPublicKey key) {
    final point = key.Q!;
    return {
      'kty': 'EC',
      'crv': 'P-256',
      'x': _base64UrlNoPad(_leftPad32(point.x!.toBigInteger()!)),
      'y': _base64UrlNoPad(_leftPad32(point.y!.toBigInteger()!)),
      'key_ops': ['verify'],
      'ext': true,
    };
  }

  Uint8List _leftPad32(BigInt value) {
    final raw = _bigIntBytes(value);
    final out = Uint8List(32);
    out.setRange(32 - raw.length, 32, raw);
    return out;
  }

  Uint8List _bigIntBytes(BigInt value) {
    var hex = value.toRadixString(16);
    if (hex.length.isOdd) hex = '0$hex';
    final out = Uint8List(hex.length ~/ 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return out;
  }

  String _base64UrlNoPad(Uint8List bytes) {
    return base64UrlEncode(bytes).replaceAll('=', '');
  }
}

class _DeviceKeyPair {
  final ECPrivateKey privateKey;
  final ECPublicKey publicKey;
  final Map<String, dynamic> publicJwk;

  const _DeviceKeyPair({
    required this.privateKey,
    required this.publicKey,
    required this.publicJwk,
  });
}
