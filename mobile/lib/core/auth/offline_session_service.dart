import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class OfflineSessionService {
  static const String observerIdKey = 'observer_id';
  static const String accessTokenKey = 'access_token';
  static const String deviceIdKey = 'device_id';

  final FlutterSecureStorage _storage;

  const OfflineSessionService({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  Future<String?> readObserverId() async {
    final value = await _storage.read(key: observerIdKey);
    if (value == null || value.trim().isEmpty) return null;
    return value.trim();
  }

  Future<bool> hasAccessToken() async {
    final value = await _storage.read(key: accessTokenKey);
    return value != null && value.trim().isNotEmpty;
  }

  Future<String> getOrCreateDeviceId() async {
    final current = await _storage.read(key: deviceIdKey);
    if (current != null && current.trim().isNotEmpty) return current.trim();
    final created = 'mobile-${DateTime.now().microsecondsSinceEpoch}';
    await _storage.write(key: deviceIdKey, value: created);
    return created;
  }

  Future<void> persistEnrollmentIdentity(Map<String, dynamic> data) async {
    final observerId = extractObserverId(data);
    if (observerId != null) {
      await _storage.write(key: observerIdKey, value: observerId);
    }
  }

  static String? extractObserverId(Map<String, dynamic> data) {
    final candidates = [
      data['observer_id'],
      data['user_id'],
      data['id'],
      if (data['observer'] is Map<String, dynamic>)
        (data['observer'] as Map<String, dynamic>)['id'],
      if (data['user'] is Map<String, dynamic>)
        (data['user'] as Map<String, dynamic>)['id'],
    ];

    for (final candidate in candidates) {
      if (candidate is String && candidate.trim().isNotEmpty) {
        return candidate.trim();
      }
    }
    return null;
  }
}
