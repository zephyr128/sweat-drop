import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

let fingerprintCache: string | null = null;
let fingerprintPromise: Promise<string> | null = null;

async function buildRawFingerprintInput(): Promise<string> {
  const parts = [
    'sweatdrop-mobile',
    Platform.OS,
    String(Platform.Version ?? ''),
    Application.applicationId ?? '',
    Application.nativeApplicationVersion ?? '',
    Application.nativeBuildVersion ?? '',
    '',
    '',
    '',
    '',
    '',
    '',
    Constants.expoConfig?.slug ?? '',
    Constants.executionEnvironment ?? '',
  ];

  return parts.join('|');
}

async function computeDeviceFingerprint(): Promise<string> {
  const base = await buildRawFingerprintInput();
  let androidId = '';
  let iosVendorId = '';

  if (Platform.OS === 'android') {
    try {
      androidId = await Application.getAndroidId();
    } catch {
      androidId = '';
    }
  } else if (Platform.OS === 'ios') {
    try {
      iosVendorId = (await Application.getIosIdForVendorAsync()) ?? '';
    } catch {
      iosVendorId = '';
    }
  }

  const payload = `${base}|${androidId}|${iosVendorId}`;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
  return digest;
}

export async function getDeviceFingerprintHash(): Promise<string> {
  if (fingerprintCache) return fingerprintCache;
  if (!fingerprintPromise) {
    fingerprintPromise = computeDeviceFingerprint()
      .then((hash) => {
        fingerprintCache = hash;
        return hash;
      })
      .catch(() => {
        fingerprintCache = 'unavailable';
        return fingerprintCache;
      });
  }
  return fingerprintPromise;
}
