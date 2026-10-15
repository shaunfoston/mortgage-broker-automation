import type { ExpoConfig } from 'expo/config';

/**
 * APP_VARIANT:
 *   preview    — test builds; allows http:// to a server on your own Wi-Fi (LAN testing)
 *   production — HTTPS only
 * EAS sets it per build profile (see eas.json).
 */
const variant = process.env.APP_VARIANT ?? 'preview';
const isProd = variant === 'production';

const config: ExpoConfig = {
  name: isProd ? 'Mortgage Options' : 'Mortgage Options (Test)',
  slug: 'mortgage-options',
  scheme: 'mortgageoptions',
  version: '0.4.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  backgroundColor: '#F4F6FA',
  ios: {
    bundleIdentifier: isProd ? 'uk.mortgageoptions.app' : 'uk.mortgageoptions.app.test',
    supportsTablet: true,
    infoPlist: {
      NSAppTransportSecurity: isProd ? { NSAllowsArbitraryLoads: false } : { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
      NSLocalNetworkUsageDescription: 'Connects to your Mortgage Options server on your local network during testing.',
    },
  },
  android: {
    package: isProd ? 'uk.mortgageoptions.app' : 'uk.mortgageoptions.app.test',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1F4FD8' },
    // Client data must not leave the device via Android cloud/adb backups.
    allowBackup: false,
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE'],
  },
  plugins: [
    'expo-router',
    ['expo-sqlite', { useSQLCipher: true }],
    [
      'expo-audio',
      {
        microphonePermission:
          'Mortgage Options records client meetings, with the client’s agreement, so the adviser can produce an accurate fact-find.',
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
    ['expo-local-authentication', { faceIDPermission: 'Unlock Mortgage Options with Face ID.' }],
    'expo-secure-store',
    ['expo-build-properties', { android: { usesCleartextTraffic: !isProd } }],
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
  ],
  extra: {
    variant,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
