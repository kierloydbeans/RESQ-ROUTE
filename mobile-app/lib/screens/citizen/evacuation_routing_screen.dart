import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../services/gps_service.dart';
import '../../models/sync_models.dart';

class EvacuationRoutingScreen extends StatefulWidget {
  const EvacuationRoutingScreen({super.key});

  @override
  State<EvacuationRoutingScreen> createState() => _EvacuationRoutingScreenState();
}

class _EvacuationRoutingScreenState extends State<EvacuationRoutingScreen> {
  final GPSService _gpsService = GPSService();
  Position? _currentPosition;
  List<ShelterModel> _nearbyShelters = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initializeLocation();
  }

  Future<void> _initializeLocation() async {
    final position = await _gpsService.getCurrentPosition();
    final shelters = await _gpsService.getNearbyShelters(position);
    
    setState(() {
      _currentPosition = position;
      _nearbyShelters = shelters;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Evacuation Routing')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_currentPosition != null)
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Card(
                      child: ListTile(
                        leading: const Icon(Icons.location_on),
                        title: const Text('Current Location'),
                        subtitle: Text(
                          'Lat: ${_currentPosition!.latitude.toStringAsFixed(4)}, '
                          'Lng: ${_currentPosition!.longitude.toStringAsFixed(4)}',
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: ListView.builder(
                    itemCount: _nearbyShelters.length,
                    itemBuilder: (context, index) {
                      final shelter = _nearbyShelters[index];
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: ListTile(
                          leading: const Icon(Icons.home),
                          title: Text(shelter.name),
                          subtitle: Text(
                            'Capacity: ${shelter.currentOccupancy}/${shelter.capacity} • '
                            '${shelter.isOpen ? "Open" : "Closed"}',
                          ),
                          trailing: ElevatedButton(
                            onPressed: () => _navigateToShelter(shelter),
                            child: const Text('Navigate'),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showHazardReportDialog(),
        child: const Icon(Icons.warning),
      ),
    );
  }

  void _navigateToShelter(ShelterModel shelter) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Navigating to ${shelter.name}')),
    );
  }

  void _showHazardReportDialog() {
    showDialog(
      context: context,
      builder: (context) => const HazardReportForm(),
    );
  }
}

class HazardReportForm extends StatefulWidget {
  const HazardReportForm({super.key});

  @override
  State<HazardReportForm> createState() => _HazardReportFormState();
}

class _HazardReportFormState extends State<HazardReportForm> {
  final _formKey = GlobalKey<FormState>();
  String _hazardType = 'Structural';
  String _description = '';
  String _severity = 'Medium';

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Report Hazard'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              value: _hazardType,
              decoration: const InputDecoration(labelText: 'Hazard Type'),
              items: const [
                DropdownMenuItem(value: 'Structural', child: Text('Structural')),
                DropdownMenuItem(value: 'Flood', child: Text('Flood')),
                DropdownMenuItem(value: 'Fire', child: Text('Fire')),
                DropdownMenuItem(value: 'Debris', child: Text('Debris')),
              ],
              onChanged: (value) => setState(() => _hazardType = value!),
            ),
            TextFormField(
              decoration: const InputDecoration(labelText: 'Description'),
              onChanged: (value) => setState(() => _description = value),
              validator: (value) => value?.isEmpty ?? true ? 'Required' : null,
            ),
            DropdownButtonFormField<String>(
              value: _severity,
              decoration: const InputDecoration(labelText: 'Severity'),
              items: const [
                DropdownMenuItem(value: 'Low', child: Text('Low')),
                DropdownMenuItem(value: 'Medium', child: Text('Medium')),
                DropdownMenuItem(value: 'High', child: Text('High')),
                DropdownMenuItem(value: 'Critical', child: Text('Critical')),
              ],
              onChanged: (value) => setState(() => _severity = value!),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _submitReport,
          child: const Text('Submit'),
        ),
      ],
    );
  }

  void _submitReport() {
    if (_formKey.currentState!.validate()) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hazard report submitted')),
      );
    }
  }
}
