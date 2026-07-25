import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import '../models/sync_models.dart';

class GPSService {
  Future<Position> getCurrentPosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw Exception('Location services are disabled.');
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw Exception('Location permissions are denied');
      }
    }

    if (permission == LocationPermission.deniedForever) {
      throw Exception('Location permissions are permanently denied');
    }

    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );
  }

  Future<void> sendLocationToBackend({required double latitude, required double longitude, String? deviceId, double? accuracy}) async {
    final uri = Uri.parse('https://resq-route.onrender.com/api/v1/gps');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': accuracy,
        'device_id': deviceId ?? 'mobile-device',
      }),
    );

    if (response.statusCode >= 400) {
      throw Exception('Failed to send GPS update: ${response.body}');
    }
  }

  Future<List<ShelterModel>> getNearbyShelters(Position position) async {
    // Mock data - replace with actual API call
    return [
      ShelterModel(
        id: '1',
        name: 'Caloocan City Hall Shelter',
        latitude: 14.65,
        longitude: 120.98,
        capacity: 500,
        currentOccupancy: 350,
      ),
      ShelterModel(
        id: '2',
        name: 'Bagong Silang Evacuation Center',
        latitude: 14.66,
        longitude: 120.99,
        capacity: 1000,
        currentOccupancy: 600,
      ),
      ShelterModel(
        id: '3',
        name: 'Tala High School Shelter',
        latitude: 14.64,
        longitude: 120.97,
        capacity: 300,
        currentOccupancy: 200,
      ),
    ];
  }

  double calculateDistance(double startLat, double startLng, double endLat, double endLng) {
    return Geolocator.distanceBetween(startLat, startLng, endLat, endLng);
  }
}
