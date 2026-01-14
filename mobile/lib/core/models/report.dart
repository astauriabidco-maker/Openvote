class Report {
  final String id;
  final String observerId;
  final String incidentType;
  final String description;
  final double latitude;
  final double longitude;
  final String h3Index;
  final String status;
  final String? proofUrl;
  final DateTime createdAt;
  final DateTime? syncedAt;

  Report({
    required this.id,
    required this.observerId,
    required this.incidentType,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.h3Index,
    required this.status,
    this.proofUrl,
    required this.createdAt,
    this.syncedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'observer_id': observerId,
      'incident_type': incidentType,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'h3_index': h3Index,
      'status': status,
      'proof_url': proofUrl,
      'created_at': createdAt.toIso8601String(),
      'synced_at': syncedAt?.toIso8601String(),
    };
  }

  factory Report.fromMap(Map<String, dynamic> map) {
    return Report(
      id: map['id'],
      observerId: map['observer_id'],
      incidentType: map['incident_type'],
      description: map['description'],
      latitude: map['latitude'],
      longitude: map['longitude'],
      h3Index: map['h3_index'],
      status: map['status'],
      proofUrl: map['proof_url'],
      createdAt: DateTime.parse(map['created_at']),
      syncedAt: map['synced_at'] != null ? DateTime.parse(map['synced_at']) : null,
    );
  }
}
