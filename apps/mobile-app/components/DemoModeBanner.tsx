import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { PlatformBlur } from '@/components/PlatformBlur';
import { useIsDemoUser } from '@/hooks/useIsDemoUser';
import { theme, fontStyles } from '@/lib/theme';

/** Amber accent — intentionally not gym primary cyan so demo never reads as normal UI chrome. */
const DEMO_ACCENT = '#FF9900';

/**
 * Compact badge when the signed-in user has profiles.is_demo = true.
 * Reviewers and QA see a clear demo indicator; real users never see this.
 */
export function DemoModeBanner() {
  const isDemo = useIsDemoUser();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('common');

  if (!isDemo) return null;

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 4, paddingRight: 12 }]}
      pointerEvents="none"
    >
      <Animated.View entering={FadeInDown.duration(280)}>
        <View style={styles.pillShell}>
          <PlatformBlur
            intensity={48}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
            androidColor="rgba(18, 20, 28, 0.94)"
          />
          <View style={styles.pillContent}>
            <Ionicons name="flask-outline" size={13} color={DEMO_ACCENT} />
            <Text style={styles.label} numberOfLines={1}>
              {t('demoMode')}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    alignItems: 'flex-end',
    zIndex: 900,
  },
  pillShell: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 153, 0, 0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: theme.colors.text,
    textTransform: 'uppercase',
    maxWidth: 112,
  },
});
