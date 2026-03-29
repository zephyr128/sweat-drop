import { View, Text, StyleSheet, TouchableOpacity, Dimensions, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles } from '@/lib/theme';
import {
  getPrivacyUrl,
  getTermsUrl,
  openLegalUrl,
} from '@/lib/legalUrls';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  bodyKey: string;
  iconColor: string;
  hasSteps?: boolean;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'water',
    titleKey: 'welcome.slide1Title',
    bodyKey: 'welcome.slide1Body',
    iconColor: theme.colors.primary,
  },
  {
    id: '2',
    icon: 'qr-code',
    titleKey: 'welcome.slide2Title',
    bodyKey: 'welcome.slide2Body',
    iconColor: theme.colors.primary,
    hasSteps: true,
  },
  {
    id: '3',
    icon: 'medal',
    titleKey: 'welcome.slide3Title',
    bodyKey: 'welcome.slide3Body',
    iconColor: '#FFD700',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation('onboarding');
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const viewabilityConfig = { viewAreaCoveragePercentThreshold: 50 };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <View style={styles.slideContent}>
        <View style={[styles.iconContainer, item.id === '3' && styles.iconContainerGold]}>
          <View style={[styles.iconGlow, { backgroundColor: item.iconColor }]} />
          <Ionicons name={item.icon} size={64} color={item.iconColor} />
        </View>

        <Text style={styles.title}>{t(item.titleKey)}</Text>
        <Text style={styles.body}>{t(item.bodyKey)}</Text>

        {item.hasSteps && (
          <View style={styles.stepsRow}>
            {[
              { icon: 'qr-code' as const, labelKey: 'welcome.stepScan' },
              { icon: 'barbell' as const, labelKey: 'welcome.stepTrain' },
              { icon: 'water' as const, labelKey: 'welcome.stepEarn' },
              { icon: 'gift' as const, labelKey: 'welcome.stepRedeem' },
            ].map((step, i) => (
              <View key={step.labelKey} style={styles.stepGroup}>
                {i > 0 && (
                  <Ionicons name="chevron-forward" size={12} color={theme.colors.textTertiary} style={styles.stepArrow} />
                )}
                <View style={styles.stepItem}>
                  <View style={styles.stepIconBox}>
                    <Ionicons name={step.icon} size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.stepLabel}>{t(step.labelKey)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={styles.flatList}
      />

      <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.bottomSection}>
        {/* Pagination dots */}
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentIndex === index
                  ? [styles.dotActive, { backgroundColor: theme.colors.primary }]
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(onboarding)/auth')}
          activeOpacity={0.8}
        >
          <View style={styles.buttonInner}>
            <Text style={styles.buttonText}>{t('welcome.startButton')}</Text>
            <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
          </View>
        </TouchableOpacity>

        {/* Legal links */}
        {getTermsUrl() || getPrivacyUrl() ? (
          <View style={styles.legalContainer}>
            <Text style={styles.legalIntro}>{t('auth.legalIntro')}</Text>
            <View style={styles.legalRow}>
              {getTermsUrl() ? (
                <TouchableOpacity
                  onPress={() => openLegalUrl(getTermsUrl())}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Text style={styles.legalLink}>{t('auth.termsLink')}</Text>
                </TouchableOpacity>
              ) : null}
              {getTermsUrl() && getPrivacyUrl() ? (
                <Text style={styles.legalSep}>{t('auth.legalSeparator')}</Text>
              ) : null}
              {getPrivacyUrl() ? (
                <TouchableOpacity
                  onPress={() => openLegalUrl(getPrivacyUrl())}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Text style={styles.legalLink}>{t('auth.privacyLink')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={styles.legalFallback}>{t('auth.footer')}</Text>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    position: 'relative',
  },
  iconContainerGold: {},
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.2,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 28,
    color: theme.colors.text,
    marginBottom: 14,
    textAlign: 'center',
    lineHeight: 36,
  },
  body: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.2,
    paddingHorizontal: 8,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    gap: 0,
  },
  stepGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepArrow: {
    marginHorizontal: 4,
    marginTop: -16,
  },
  stepItem: {
    alignItems: 'center',
    gap: 6,
  },
  stepIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bottomSection: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    gap: 16,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
  },
  dotInactive: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  button: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    width: '100%',
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  buttonText: {
    ...fontStyles.heading,
    color: '#000000',
    fontSize: 18,
  },
  legalContainer: {
    alignItems: 'center',
    gap: 4,
  },
  legalIntro: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  legalSep: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  legalLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  legalFallback: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
  },
});
