import React, { useCallback, useEffect } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 80;
const OPEN_CONFIG = { duration: 340, easing: Easing.out(Easing.cubic) };
const CLOSE_CONFIG = { duration: 260, easing: Easing.in(Easing.cubic) };
const SNAP_BACK = { damping: 22, stiffness: 280, mass: 0.9 };

const CYAN = '#22D3EE';
const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';

interface ArenaInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  accentColor?: string;
}

export function ArenaInfoSheet({ visible, onClose, accentColor = CYAN }: ArenaInfoSheetProps) {
  const { t } = useTranslation('arena');
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 16);

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const startY = useSharedValue(0);

  const handleClose = useCallback(() => {
    translateY.value = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
    backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      translateY.value = withTiming(0, OPEN_CONFIG);
      backdropOpacity.value = withTiming(1, OPEN_CONFIG);
    }
  }, [visible]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = startY.value + e.translationY;
      translateY.value = Math.max(0, next);
      backdropOpacity.value = interpolate(
        translateY.value,
        [0, SCREEN_HEIGHT * 0.5],
        [1, 0],
        Extrapolate.CLAMP,
      );
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 600) {
        translateY.value = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
        backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SNAP_BACK);
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  const scoringModels = [
    { icon: 'water' as const, color: accentColor, key: 'infoScoringDrops' as const },
    { icon: 'calendar-outline' as const, color: '#6366F1', key: 'infoScoringDays' as const },
    { icon: 'barbell-outline' as const, color: '#F59E0B', key: 'infoScoringVariety' as const },
    { icon: 'flame-outline' as const, color: '#F97316', key: 'infoScoringStreak' as const },
  ];

  const prizeRanks = [
    { label: t('infoRank1'), color: GOLD, emoji: '🥇' },
    { label: t('infoRank2'), color: SILVER, emoji: '🥈' },
    { label: t('infoRank3'), color: BRONZE, emoji: '🥉' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View style={[styles.sheetWrapper, sheetStyle]}>
          <View style={[styles.sheet, { borderColor: hexToRgba(accentColor, 0.25) }]}>
            <PlatformBlur
              intensity={60}
              tint="dark"
              style={[styles.blurContainer, { paddingBottom: sheetBottomPad }]}
              androidColor="rgba(12,15,24,0.98)"
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.07)', hexToRgba(accentColor, 0.04), 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <GestureDetector gesture={panGesture}>
                <View style={styles.dragHandleZone}>
                  <View style={styles.handle} />
                </View>
              </GestureDetector>

              <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>

              <ScrollView
                style={[styles.scrollArea, { maxHeight: SCREEN_HEIGHT * 0.88 - 52 - sheetBottomPad }]}
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingBottom: Platform.OS === 'android' ? 12 : 10 },
                ]}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                bounces
              >
                {/* Title */}
                <View style={styles.titleRow}>
                  <View style={[styles.titleIconWrap, { backgroundColor: hexToRgba(accentColor, 0.12) }]}>
                    <Ionicons name="trophy" size={22} color={accentColor} />
                  </View>
                  <Text style={styles.title}>{t('infoSheetTitle')}</Text>
                </View>

                {/* What are arenas */}
                <View style={[styles.ruleCard, { borderColor: hexToRgba(accentColor, 0.18) }]}>
                  <Ionicons name="information-circle-outline" size={18} color={accentColor} style={{ marginTop: 1 }} />
                  <Text style={styles.ruleText}>{t('infoSheetWhat')}</Text>
                </View>

                {/* Scoring models */}
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: accentColor }]}>{t('infoScoringTitle')}</Text>
                  <View style={[styles.scoringCard, { borderColor: hexToRgba(accentColor, 0.14) }]}>
                    {scoringModels.map((model, i) => (
                      <View key={model.key}>
                        <View style={styles.scoringRow}>
                          <View style={[styles.scoringIconWrap, { backgroundColor: hexToRgba(model.color, 0.12) }]}>
                            <Ionicons name={model.icon} size={16} color={model.color} />
                          </View>
                          <Text style={styles.scoringText}>{t(model.key)}</Text>
                        </View>
                        {i < scoringModels.length - 1 && <View style={styles.scoringDivider} />}
                      </View>
                    ))}
                  </View>
                </View>

                {/* How prizes work */}
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: accentColor }]}>{t('infoPrizesTitle')}</Text>
                  <View style={styles.prizesList}>
                    {prizeRanks.map((r) => (
                      <View
                        key={r.label}
                        style={[styles.prizeCard, {
                          borderColor: hexToRgba(r.color, 0.35),
                          backgroundColor: hexToRgba(r.color, 0.06),
                        }]}
                      >
                        <View style={[styles.prizeAccentBar, { backgroundColor: r.color }]} />
                        <Text style={styles.prizeEmoji}>{r.emoji}</Text>
                        <Text style={[styles.prizeLabel, { color: r.color }]}>{r.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.ruleCard, { borderColor: hexToRgba(accentColor, 0.12), marginTop: 0 }]}>
                    <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} style={{ marginTop: 1 }} />
                    <Text style={[styles.ruleText, { fontSize: 13 }]}>{t('infoPrizesCollect')}</Text>
                  </View>
                </View>

                {/* How to join */}
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: accentColor }]}>{t('infoJoinTitle')}</Text>
                  <View style={[styles.ruleCard, { borderColor: hexToRgba(accentColor, 0.12) }]}>
                    <Ionicons name="flash-outline" size={16} color={accentColor} style={{ marginTop: 1 }} />
                    <Text style={styles.ruleText}>{t('infoJoinHow')}</Text>
                  </View>
                </View>

                {/* CTA */}
                <Pressable
                  style={({ pressed }) => [
                    styles.closeButton,
                    { backgroundColor: pressed ? hexToRgba(accentColor, 0.8) : accentColor },
                  ]}
                  onPress={handleClose}
                >
                  <Text style={styles.closeButtonText}>{t('infoSheetClose')}</Text>
                </Pressable>
              </ScrollView>
            </PlatformBlur>
          </View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,20,0.55)',
    maxHeight: SCREEN_HEIGHT * 0.88,
  },
  blurContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(14, 14, 24, 0.9)',
    paddingTop: 12,
  },
  dragHandleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 36,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  titleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...fontStyles.heading,
    fontSize: 24,
    color: '#fff',
    letterSpacing: 0.3,
  },
  ruleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  ruleText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 21,
    letterSpacing: 0.2,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scoringCard: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  scoringIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  scoringText: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: 14,
    color: '#fff',
    letterSpacing: 0.2,
  },
  scoringDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 14,
  },
  prizesList: {
    gap: 8,
  },
  prizeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingRight: 14,
  },
  prizeAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    opacity: 0.7,
    marginRight: 12,
  },
  prizeEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  prizeLabel: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 4,
  },
  closeButtonText: {
    ...fontStyles.heading,
    fontSize: 17,
    color: '#000',
    letterSpacing: 0.3,
  },
});
