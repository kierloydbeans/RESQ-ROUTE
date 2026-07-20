import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'screens/citizen/evacuation_routing_screen.dart';
import 'screens/rescuer/manifest_control_screen.dart';
import 'services/websocket_service.dart';

void main() {
  runApp(const ResQRouteApp());
}

class ResQRouteApp extends StatelessWidget {
  const ResQRouteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider(create: (_) => WebSocketService()),
      ],
      child: MaterialApp(
        title: 'RESQ-Route',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.red),
          useMaterial3: true,
        ),
        home: const RoleSelectionScreen(),
      ),
    );
  }
}

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('RESQ-Route')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (context) => const EvacuationRoutingScreen()),
                );
              },
              child: const Text('Citizen Mode'),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (context) => const ManifestControlScreen()),
                );
              },
              child: const Text('Rescuer Mode'),
            ),
          ],
        ),
      ),
    );
  }
}
