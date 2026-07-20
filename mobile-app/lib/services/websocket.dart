import 'dart:async';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebSocketService {
  WebSocketChannel? _channel;
  final StreamController<Map<String, dynamic>> _telemetryController = StreamController.broadcast();
  bool _isConnected = false;

  Stream<Map<String, dynamic>> get telemetryStream => _telemetryController.stream;
  bool get isConnected => _isConnected;

  Future<void> connect(String url) async {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(url));
      _isConnected = true;
      
      _channel!.stream.listen(
        (data) {
          _telemetryController.add(data as Map<String, dynamic>);
        },
        onError: (error) {
          print('WebSocket Error: $error');
          _isConnected = false;
        },
        onDone: () {
          _isConnected = false;
        },
      );
    } catch (e) {
      print('WebSocket Connection Error: $e');
      _isConnected = false;
    }
  }

  void sendTelemetry(Map<String, dynamic> data) {
    if (_channel != null && _isConnected) {
      _channel!.sink.add(data);
    }
  }

  Future<void> disconnect() async {
    await _channel?.sink.close();
    _isConnected = false;
  }
}
