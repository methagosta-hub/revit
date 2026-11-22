import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/offline/secure_outbox.dart';
import 'features/field_home_page.dart';
import 'features/login_page.dart';

const String _supabaseUrl =
    String.fromEnvironment('DAHLIA_SUPABASE_URL');
const String _supabaseAnonKey =
    String.fromEnvironment('DAHLIA_SUPABASE_ANON_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final outbox = SecureOutbox();
  await outbox.initialize();

  final configured = _supabaseUrl.startsWith('https://') &&
      _supabaseAnonKey.isNotEmpty;

  if (configured) {
    await Supabase.initialize(
      url: _supabaseUrl,
      anonKey: _supabaseAnonKey,
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
    const primary = Color(0xFF244C45);
    return MaterialApp(
      title: 'Dahlia Field',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primary,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF5F7F6),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFF5F7F6),
          foregroundColor: Color(0xFF18352F),
          centerTitle: false,
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0xFFE5ECE9)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF8FAF9),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFDCE5E1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFDCE5E1)),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 13,
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
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
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.settings_suggest_outlined, size: 54),
                SizedBox(height: 18),
                Text(
                  'Konfigurasi Dahlia Field belum lengkap',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 10),
                Text(
                  'Build APK perlu DAHLIA_SUPABASE_URL dan '
                  'DAHLIA_SUPABASE_ANON_KEY (publishable key). '
                  'Jangan gunakan service_role key di aplikasi.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
