import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

const androidApplicationId = 'com.societyhub.societyhub_mobile';

const playStoreListingUrl =
    'https://play.google.com/store/apps/details?id=$androidApplicationId';

class InstalledAppInfo {
  const InstalledAppInfo({
    required this.versionLabel,
    required this.updateAvailable,
  });

  final String versionLabel;
  final bool updateAvailable;
}

String formatInstalledVersion(String version, String buildNumber) {
  final v = version.trim();
  final b = buildNumber.trim();
  if (v.isEmpty) return 'unknown';
  if (b.isEmpty) return v;
  return '$v ($b)';
}

abstract class AppVersionSource {
  Future<InstalledAppInfo> load();
  Future<void> startUpdate();
}

class FakeAppVersionSource implements AppVersionSource {
  const FakeAppVersionSource({
    this.versionLabel = '1.0.0 (1)',
    this.updateAvailable = false,
    this.onStartUpdate,
  });

  final String versionLabel;
  final bool updateAvailable;
  final Future<void> Function()? onStartUpdate;

  @override
  Future<InstalledAppInfo> load() async {
    return InstalledAppInfo(
      versionLabel: versionLabel,
      updateAvailable: updateAvailable,
    );
  }

  @override
  Future<void> startUpdate() async {
    await onStartUpdate?.call();
  }
}

/// Reads the installed version and Play in-app update availability (Android).
class PlayAppVersionSource implements AppVersionSource {
  const PlayAppVersionSource();

  @override
  Future<InstalledAppInfo> load() async {
    final package = await PackageInfo.fromPlatform();
    var updateAvailable = false;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        final info = await InAppUpdate.checkForUpdate();
        updateAvailable =
            info.updateAvailability == UpdateAvailability.updateAvailable;
      } catch (_) {
        updateAvailable = false;
      }
    }
    return InstalledAppInfo(
      versionLabel: formatInstalledVersion(package.version, package.buildNumber),
      updateAvailable: updateAvailable,
    );
  }

  @override
  Future<void> startUpdate() async {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      try {
        final info = await InAppUpdate.checkForUpdate();
        if (info.updateAvailability == UpdateAvailability.updateAvailable) {
          if (info.immediateUpdateAllowed) {
            await InAppUpdate.performImmediateUpdate();
            return;
          }
          if (info.flexibleUpdateAllowed) {
            await InAppUpdate.startFlexibleUpdate();
            await InAppUpdate.completeFlexibleUpdate();
            return;
          }
        }
      } catch (_) {
        // Fall through to the Play Store listing.
      }
    }
    final uri = Uri.parse(playStoreListingUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

final appVersionSourceProvider = Provider<AppVersionSource>((ref) {
  return const PlayAppVersionSource();
});

final installedAppInfoProvider = FutureProvider<InstalledAppInfo>((ref) {
  return ref.watch(appVersionSourceProvider).load();
});
