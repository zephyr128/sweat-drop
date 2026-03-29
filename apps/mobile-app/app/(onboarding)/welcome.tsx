import { View, Text, StyleSheet, TouchableOpacity, Dimensions, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { theme } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  iconColor: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: 'water',
    title: 'Turn Sweat\nInto Rewards',
    body: 'Every rep counts. Earn drops for every workout and redeem them for real rewards at your gym.',
    iconColor: theme.colors.primary,
  },
  {
    id: '2',
    icon: 'qr-code',
    title: 'How It Works',
    body: 'Scan the QR code on any machine → Train at your pace → Earn drops automatically → Redeem for rewards.',
    iconColor: theme.colors.primary,
  },
  {
    id: '3',
    icon: 'medal',
    title: 'Now Available\nat Partner Gyms',
    body: 'SweatDrop is launching at select partner gyms. Be among the first to join the drops revolution.',
    iconColor: '#FFD700',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
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

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>

        {item.id === '2' && (
          <View style={styles.stepsRow}>
            {[
              { icon: 'qr-code' as const, label: 'Scan' },
              { icon: 'barbell' as const, label: 'Train' },
              { icon: 'water' as const, label: 'Earn' },
              { icon: 'gift' as const, label: 'Redeem' },
            ].map((step, i) => (
              <View key={step.label} style={styles.stepGroup}>
                {i > 0 && (
                  <Ionicons name="chevron-forward" size={12} color={theme.colors.textTertiary} style={styles.stepArrow} />
                )}
                <View style={styles.stepItem}>
                  <View style={styles.stepIconBox}>
                    <Ionicons name={step.icon} size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.stepLabel}>{step.label}</Text>
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

      {/* Bottom section: dots + button */}
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
          onPress={() => router.push('/(onboarding)/auth')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.primaryDark]}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.buttonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Already have an account */}
        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => router.push('/(onboarding)/auth')}
          activeOpacity={0.7}
        >
          <Text style={styles.loginLinkText}>Already have an account? <Text style={{ color: theme.colors.primary }}>Sign in</Text></Text>
        </TouchableOpacity>
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
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 36,
  },
  body: {
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
    fontSize: 10,
    fontWeight: '600',
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
    borderRadius: 9999,
    overflow: 'hidden',
    width: '100%',
    ...theme.shadows.glow,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 18,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  loginLink: {
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
});
