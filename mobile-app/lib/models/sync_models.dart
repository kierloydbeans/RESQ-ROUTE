class EvacueeModel {
  final String id;
  final String name;
  final String qrCode;
  final String shelterId;
  final DateTime checkInTime;
  final bool needsMedicalAttention;

  EvacueeModel({
    required this.id,
    required this.name,
    required this.qrCode,
    required this.shelterId,
    required this.checkInTime,
    this.needsMedicalAttention = false,
  });

  factory EvacueeModel.fromJson(Map<String, dynamic> json) {
    return EvacueeModel(
      id: json['id'],
      name: json['name'],
      qrCode: json['qr_code'],
      shelterId: json['shelter_id'],
      checkInTime: DateTime.parse(json['check_in_time']),
      needsMedicalAttention: json['needs_medical_attention'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'qr_code': qrCode,
      'shelter_id': shelterId,
      'check_in_time': checkInTime.toIso8601String(),
      'needs_medical_attention': needsMedicalAttention,
    };
  }
}

class ShelterModel {
  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final int capacity;
  final int currentOccupancy;
  final bool isOpen;

  ShelterModel({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.capacity,
    required this.currentOccupancy,
    this.isOpen = true,
  });

  factory ShelterModel.fromJson(Map<String, dynamic> json) {
    return ShelterModel(
      id: json['id'],
      name: json['name'],
      latitude: json['latitude'],
      longitude: json['longitude'],
      capacity: json['capacity'],
      currentOccupancy: json['current_occupancy'],
      isOpen: json['is_open'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'latitude': latitude,
      'longitude': longitude,
      'capacity': capacity,
      'current_occupancy': currentOccupancy,
      'is_open': isOpen,
    };
  }
}

class HazardReportModel {
  final String id;
  final String type;
  final String description;
  final double latitude;
  final double longitude;
  final String severity;
  final DateTime reportedAt;
  final bool isResolved;

  HazardReportModel({
    required this.id,
    required this.type,
    required this.description,
    required this.latitude,
    required this.longitude,
    required this.severity,
    required this.reportedAt,
    this.isResolved = false,
  });

  factory HazardReportModel.fromJson(Map<String, dynamic> json) {
    return HazardReportModel(
      id: json['id'],
      type: json['type'],
      description: json['description'],
      latitude: json['latitude'],
      longitude: json['longitude'],
      severity: json['severity'],
      reportedAt: DateTime.parse(json['reported_at']),
      isResolved: json['is_resolved'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'description': description,
      'latitude': latitude,
      'longitude': longitude,
      'severity': severity,
      'reported_at': reportedAt.toIso8601String(),
      'is_resolved': isResolved,
    };
  }
}
