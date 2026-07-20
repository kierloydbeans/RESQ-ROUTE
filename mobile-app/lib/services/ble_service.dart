import 'package:flutter_blue_plus/flutter_blue_plus.dart';

class BLEService {
  Future<List<BluetoothDevice>> scanForDevices({Duration timeout = const Duration(seconds: 10)}) async {
    try {
      await FlutterBluePlus.startScan(timeout: timeout);
      final subscription = FlutterBluePlus.scanResults.listen((results) {
        // Handle scan results if needed
      });
      
      await Future.delayed(timeout);
      await FlutterBluePlus.stopScan();
      await subscription.cancel();
      
      final connectedDevices = await FlutterBluePlus.connectedDevices;
      return connectedDevices;
    } catch (e) {
      print('BLE Scan Error: $e');
      return [];
    }
  }

  Future<bool> connectToDevice(BluetoothDevice device) async {
    try {
      await device.connect();
      return true;
    } catch (e) {
      print('BLE Connection Error: $e');
      return false;
    }
  }

  Future<void> disconnectDevice(BluetoothDevice device) async {
    try {
      await device.disconnect();
    } catch (e) {
      print('BLE Disconnect Error: $e');
    }
  }
}
