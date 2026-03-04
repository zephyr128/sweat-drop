import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// ── Serbian translations ──
import srCommon from '@/locales/sr/common.json';
import srOnboarding from '@/locales/sr/onboarding.json';
import srHome from '@/locales/sr/home.json';
import srProfile from '@/locales/sr/profile.json';
import srGymWelcome from '@/locales/sr/gymWelcome.json';
import srWorkout from '@/locales/sr/workout.json';
import srStore from '@/locales/sr/store.json';
import srWallet from '@/locales/sr/wallet.json';
import srLeaderboard from '@/locales/sr/leaderboard.json';
import srChallenges from '@/locales/sr/challenges.json';
import srHistory from '@/locales/sr/history.json';
import srScanner from '@/locales/sr/scanner.json';
import srArena from '@/locales/sr/arena.json';
import srTrophyRoom from '@/locales/sr/trophyRoom.json';
import srRedemptions from '@/locales/sr/redemptions.json';
import srSmartcoach from '@/locales/sr/smartcoach.json';
import srPlans from '@/locales/sr/plans.json';

// ── English translations ──
import enCommon from '@/locales/en/common.json';
import enOnboarding from '@/locales/en/onboarding.json';
import enHome from '@/locales/en/home.json';
import enProfile from '@/locales/en/profile.json';
import enGymWelcome from '@/locales/en/gymWelcome.json';
import enWorkout from '@/locales/en/workout.json';
import enStore from '@/locales/en/store.json';
import enWallet from '@/locales/en/wallet.json';
import enLeaderboard from '@/locales/en/leaderboard.json';
import enChallenges from '@/locales/en/challenges.json';
import enHistory from '@/locales/en/history.json';
import enScanner from '@/locales/en/scanner.json';
import enArena from '@/locales/en/arena.json';
import enTrophyRoom from '@/locales/en/trophyRoom.json';
import enRedemptions from '@/locales/en/redemptions.json';
import enSmartcoach from '@/locales/en/smartcoach.json';
import enPlans from '@/locales/en/plans.json';

const resources = {
  sr: {
    common: srCommon,
    onboarding: srOnboarding,
    home: srHome,
    profile: srProfile,
    gymWelcome: srGymWelcome,
    workout: srWorkout,
    store: srStore,
    wallet: srWallet,
    leaderboard: srLeaderboard,
    challenges: srChallenges,
    history: srHistory,
    scanner: srScanner,
    arena: srArena,
    trophyRoom: srTrophyRoom,
    redemptions: srRedemptions,
    smartcoach: srSmartcoach,
    plans: srPlans,
  },
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    home: enHome,
    profile: enProfile,
    gymWelcome: enGymWelcome,
    workout: enWorkout,
    store: enStore,
    wallet: enWallet,
    leaderboard: enLeaderboard,
    challenges: enChallenges,
    history: enHistory,
    scanner: enScanner,
    arena: enArena,
    trophyRoom: enTrophyRoom,
    redemptions: enRedemptions,
    smartcoach: enSmartcoach,
    plans: enPlans,
  },
};

// Detect device locale — prefer Serbian if device is sr/hr/bs/cnr
const deviceLocale = Localization.getLocales()?.[0]?.languageCode ?? 'sr';
const defaultLang = ['sr', 'hr', 'bs', 'cnr'].includes(deviceLocale) ? 'sr' : 'en';

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLang,
  fallbackLng: 'sr',
  defaultNS: 'common',
  ns: [
    'common',
    'onboarding',
    'home',
    'profile',
    'gymWelcome',
    'workout',
    'store',
    'wallet',
    'leaderboard',
    'challenges',
    'history',
    'scanner',
    'arena',
    'trophyRoom',
    'redemptions',
    'smartcoach',
    'plans',
  ],
  interpolation: {
    escapeValue: false, // React already escapes
  },
  compatibilityJSON: 'v4', // Required for i18next v23+ plural rules
});

export default i18n;
