import 'package:flutter/material.dart';

abstract final class JavawasthuPalette {
  static const deepTeal = Color(0xFF064B48);
  static const teal = Color(0xFF126B61);
  static const tealLight = Color(0xFFE5F1ED);
  static const gold = Color(0xFFC7953B);
  static const goldLight = Color(0xFFFAF1DE);
  static const ink = Color(0xFF172B2A);
  static const muted = Color(0xFF71807C);
  static const canvas = Color(0xFFF5F5F1);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceSoft = Color(0xFFF9FAF7);
  static const border = Color(0xFFE6EAE5);
  static const danger = Color(0xFFB94C43);
}

abstract final class JavawasthuTheme {
  static ThemeData get light {
    const radius = 18.0;
    final scheme = ColorScheme.fromSeed(
      seedColor: JavawasthuPalette.deepTeal,
      brightness: Brightness.light,
    ).copyWith(
      primary: JavawasthuPalette.deepTeal,
      onPrimary: Colors.white,
      secondary: JavawasthuPalette.gold,
      onSecondary: JavawasthuPalette.ink,
      surface: JavawasthuPalette.surface,
      onSurface: JavawasthuPalette.ink,
      error: JavawasthuPalette.danger,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: JavawasthuPalette.canvas,
      visualDensity: VisualDensity.standard,
      textTheme: const TextTheme(
        headlineSmall: TextStyle(
          color: JavawasthuPalette.ink,
          fontSize: 25,
          height: 1.18,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.6,
        ),
        titleLarge: TextStyle(
          color: JavawasthuPalette.ink,
          fontSize: 19,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.25,
        ),
        titleMedium: TextStyle(
          color: JavawasthuPalette.ink,
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
        bodyLarge: TextStyle(
          color: JavawasthuPalette.ink,
          fontSize: 15,
          height: 1.45,
        ),
        bodyMedium: TextStyle(
          color: JavawasthuPalette.ink,
          fontSize: 13,
          height: 1.4,
        ),
        bodySmall: TextStyle(
          color: JavawasthuPalette.muted,
          fontSize: 11,
          height: 1.35,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.1,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: JavawasthuPalette.canvas,
        foregroundColor: JavawasthuPalette.ink,
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: TextStyle(
          color: JavawasthuPalette.ink,
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: JavawasthuPalette.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: const BorderSide(color: JavawasthuPalette.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: JavawasthuPalette.surfaceSoft,
        labelStyle: const TextStyle(color: JavawasthuPalette.muted),
        hintStyle: const TextStyle(color: Color(0xFF9AA5A0)),
        prefixIconColor: JavawasthuPalette.muted,
        suffixIconColor: JavawasthuPalette.muted,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: JavawasthuPalette.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: JavawasthuPalette.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(
            color: JavawasthuPalette.teal,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: JavawasthuPalette.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(
            color: JavawasthuPalette.danger,
            width: 1.5,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: JavawasthuPalette.deepTeal,
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFD6DEDA),
          disabledForegroundColor: JavawasthuPalette.muted,
          minimumSize: const Size(0, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: JavawasthuPalette.deepTeal,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          side: const BorderSide(color: JavawasthuPalette.border),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: JavawasthuPalette.border,
        thickness: 1,
        space: 1,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: JavawasthuPalette.surface,
        indicatorColor: JavawasthuPalette.tealLight,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w800
                : FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? JavawasthuPalette.deepTeal
                : JavawasthuPalette.muted,
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: JavawasthuPalette.ink,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: JavawasthuPalette.teal,
      ),
    );
  }
}
