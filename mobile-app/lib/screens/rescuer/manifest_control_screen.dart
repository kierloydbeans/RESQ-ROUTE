import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import '../../services/ble_service.dart';
import '../../models/sync_models.dart';

class ManifestControlScreen extends StatefulWidget {
  const ManifestControlScreen({super.key});

  @override
  State<ManifestControlScreen> createState() => _ManifestControlScreenState();
}

class _ManifestControlScreenState extends State<ManifestControlScreen> {
  final BLEService _bleService = BLEService();
  List<BluetoothDevice> _nearbyDevices = [];
  List<EvacueeModel> _manifest = [];
  bool _isScanning = false;

  @override
  void initState() {
    super.initState();
    _startBLEScan();
  }

  Future<void> _startBLEScan() async {
    setState(() => _isScanning = true);
    final devices = await _bleService.scanForDevices();
    setState(() {
      _nearbyDevices = devices;
      _isScanning = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Rescuer Dashboard'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'BLE Proximity'),
              Tab(text: 'Manifest'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildBLEView(),
            _buildManifestView(),
          ],
        ),
      ),
    );
  }

  Widget _buildBLEView() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Nearby Devices: ${_nearbyDevices.length}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              ElevatedButton(
                onPressed: _isScanning ? null : _startBLEScan,
                child: Text(_isScanning ? 'Scanning...' : 'Refresh'),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _nearbyDevices.length,
            itemBuilder: (context, index) {
              final device = _nearbyDevices[index];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: ListTile(
                  leading: const Icon(Icons.bluetooth),
                  title: Text(device.name.isNotEmpty ? device.name : 'Unknown Device'),
                  subtitle: Text(device.id.toString()),
                  trailing: ElevatedButton(
                    onPressed: () => _addToManifest(device),
                    child: const Text('Add'),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildManifestView() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Text(
            'Manifest: ${_manifest.length} evacuees',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ),
        Expanded(
          child: _manifest.isEmpty
              ? const Center(child: Text('No evacuees in manifest'))
              : ListView.builder(
                  itemCount: _manifest.length,
                  itemBuilder: (context, index) {
                    final evacuee = _manifest[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        leading: const Icon(Icons.person),
                        title: Text(evacuee.name),
                        subtitle: Text(
                          'QR: ${evacuee.qrCode} • '
                          '${evacuee.needsMedicalAttention ? "⚠️ Medical" : "Stable"}',
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete),
                          onPressed: () => _removeFromManifest(index),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  void _addToManifest(BluetoothDevice device) {
    final evacuee = EvacueeModel(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      name: device.name.isNotEmpty ? device.name : 'Unknown',
      qrCode: device.id.toString(),
      shelterId: 'pending',
      checkInTime: DateTime.now(),
    );
    setState(() => _manifest.add(evacuee));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${evacuee.name} added to manifest')),
    );
  }

  void _removeFromManifest(int index) {
    setState(() => _manifest.removeAt(index));
  }
}
