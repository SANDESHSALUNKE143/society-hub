import 'package:flutter/material.dart';

/// Matches `apps/client-app` Hindu / temple palette (saffron + kumkum + gold).
abstract final class AppColors {
  static const ink = Color(0xFF2A1A12);
  static const paper = Color(0xFFFFFAF4);
  static const leaf = Color(0xFFD35400);
  static const leafDark = Color(0xFF8B1E3F);
  static const mist = Color(0xFFFFF0E0);
  static const sand = Color(0xFFE8C9A0);
  static const gold = Color(0xFFC9A227);
  static const saffron = Color(0xFFE87722);
  static const alert = Color(0xFFC45C00);
  static const danger = Color(0xFFA4161A);
  static const card = Color(0xFFFFFDFB);
}

ThemeData buildAppTheme() {
  // Roboto / sans-serif only. Outfit and some OEM serif faces drop U+0020
  // on Samsung Play installs, so login copy ran together.
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: 'sans-serif',
  );

  return base.copyWith(
    scaffoldBackgroundColor: AppColors.paper,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.saffron,
      primary: AppColors.leaf,
      onPrimary: const Color(0xFFFFFDF8),
      surface: AppColors.card,
      onSurface: AppColors.ink,
      error: AppColors.danger,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.ink,
      displayColor: AppColors.leafDark,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.card.withValues(alpha: 0.9),
      foregroundColor: AppColors.leafDark,
      elevation: 0,
      titleTextStyle: displayStyle(size: 22),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.sand),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.sand),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.leaf, width: 1.5),
      ),
      labelStyle: const TextStyle(
        fontFamily: 'sans-serif',
        fontWeight: FontWeight.w600,
        fontSize: 14,
        color: AppColors.ink,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.saffron,
        foregroundColor: const Color(0xFFFFFDF8),
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(
          fontFamily: 'sans-serif',
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        side: const BorderSide(color: AppColors.sand),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.sand),
      ),
    ),
    dividerColor: AppColors.sand,
  );
}

TextStyle displayStyle({double size = 24, Color color = AppColors.leafDark}) {
  return TextStyle(
    fontSize: size,
    fontWeight: FontWeight.w700,
    color: color,
    height: 1.15,
    letterSpacing: 0,
    fontFamily: 'sans-serif',
  );
}
