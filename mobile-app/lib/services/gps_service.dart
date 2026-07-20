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
