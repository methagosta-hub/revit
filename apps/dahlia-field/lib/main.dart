import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/offline/secure_outbox.dart';
import 'core/theme/javawasthu_theme.dart';
import 'features/field_home_page.dart';
import 'features/login_page.dart';

const String _supabaseUrl =
    String.fromEnvironment('DAHLIA_SUPABASE_URL');
const String _supabasePublishableKey =
    String.fromEnvironment('DAHLIA_SUPABASE_PUBLISHABLE_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final outbox = SecureOutbox();
  await outbox.initialize();

  final configured = _supabaseUrl.startsWith('https://') &&
      _supabasePublishableKey.startsWith('sb_publishable_');

  if (configured) {
    await Supabase.initialize(
      url: _supabaseUrl,
      publishableKey: _supabasePublishableKey,
    );
  }

  runApp(
    DahliaFieldApp(
      outbox: outbox,
      isConfigured: configured,
    ),
  );
}

class DahliaFieldApp extends StatelessWidget {
  const DahliaFieldApp({
    required this.outbox,
    required this.isConfigured,
    super.key,
  });

  final SecureOutbox outbox;
  final bool isConfigured;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Javawasthu Management',
      debugShowCheckedModeBanner: false,
      theme: JavawasthuTheme.light,
      home: isConfigured
          ? AuthGate(outbox: outbox)
          : const ConfigurationRequiredPage(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({required this.outbox, super.key});

  final SecureOutbox outbox;

  @override
  Widget build(BuildContext context) {
    final client = Supabase.instance.client;
    return StreamBuilder<AuthState>(
      stream: client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        if (client.auth.currentSession == null) {
          return const LoginPage();
        }
        return FieldHomePage(outbox: outbox);
      },
    );
  }
}

class ConfigurationRequiredPage extends StatelessWidget {
  const ConfigurationRequiredPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 68,
                        height: 68,
                        decoration: BoxDecoration(
                          color: JavawasthuPalette.goldLight,
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: const Icon(
                          Icons.apartment_rounded,
                          color: JavawasthuPalette.deepTeal,
                          size: 34,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Javawasthu Management',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Konfigurasi aplikasi belum lengkap',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        'Build APK memerlukan DAHLIA_SUPABASE_URL dan '
                        'DAHLIA_SUPABASE_PUBLISHABLE_KEY. Jangan pernah '
                        'menyimpan service_role key di dalam aplikasi.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: JavawasthuPalette.muted,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
