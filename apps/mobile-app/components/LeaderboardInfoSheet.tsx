import React, { useCallback, useEffect } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
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

const AnimatedSheetScrollView = Animated.ScrollView;

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'] as const;
const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'] as const;

export interface LeaderboardRewardInfo {
  id: string;
  rank_position: number;
  reward_name: string;
  reward_description: string | null;
  reward_type: string;
  value: string | null;
}

interface LeaderboardInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  rewards: LeaderboardRewardInfo[];
  currentUserRank: number | null;
  leaderScoreLabel: string | null;
  currentUserScoreLabel: string | null;
  accentColor: string;
  period?: 'weekly' | 'monthly' | 'all_time';
}

export function LeaderboardInfoSheet({
  visible,
  onClose,
  rewards,
  currentUserRank,
  leaderScoreLabel,
  currentUserScoreLabel,
  accentColor,
  period,
}: LeaderboardInfoSheetProps) {
  const { t } = useTranslation('leaderboard');
  const insets = useSafeAreaInsets();
  // Android 3-button nav often reports insets.bottom === 0; ~48dp clears the bar.
  // Blur paddingBottom is the single source for nav clearance — keep ScrollView
  // content padding modest so the CTA is not double-lifted.
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

  // Compute drops gap
  const cleanNum = (label: string | null) => {
    if (!label) return null;
    const cleaned = label.replace(/\s*💧\s*/g, '').replace(/,/g, '').trim();
    const n = parseInt(cleaned, 10);
    return isNaN(n) ? null : n;
  };

  const leaderScore = cleanNum(leaderScoreLabel);
  const userScore = cleanNum(currentUserScoreLabel);
  const dropsGap = leaderScore !== null && userScore !== null ? Math.max(0, leaderScore - userScore) : null;

  const positionMessage = (() => {
    if (currentUserRank === null) return t('infoSheetNotRanked');
    if (currentUserRank === 1) return t('infoSheetLeader');
    const gap = dropsGap !== null ? dropsGap.toLocaleString() : '?';
    return t('infoSheetDropsToFirst', { drops: gap });
  })();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Sheet — pan only on handle so ScrollView receives vertical drags on Android */}
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

              {/* Close button */}
              <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>

              <AnimatedSheetScrollView
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

                  {/* Score rule */}
                  <View style={[styles.ruleCard, { borderColor: hexToRgba(accentColor, 0.18) }]}>
                    <Ionicons name="information-circle-outline" size={18} color={accentColor} style={{ marginTop: 1 }} />
                    <Text style={styles.ruleText}>{t('infoSheetScoreRule')}</Text>
                  </View>

                  {/* Your position */}
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: accentColor }]}>{t('infoSheetYourPosition')}</Text>
                    <View style={[styles.positionCard, {
                      borderColor: currentUserRank === 1
                        ? hexToRgba('#FFD700', 0.4)
                        : hexToRgba(accentColor, 0.2),
                      backgroundColor: currentUserRank === 1
                        ? hexToRgba('#FFD700', 0.07)
                        : hexToRgba(accentColor, 0.05),
                    }]}>
                      {currentUserRank === 1 ? (
                        <Text style={styles.positionMedal}>🥇</Text>
                      ) : currentUserRank !== null ? (
                        <View style={[styles.positionRankBubble, { backgroundColor: hexToRgba(accentColor, 0.15), borderColor: hexToRgba(accentColor, 0.35) }]}>
                          <Text style={[styles.positionRankText, { color: accentColor }]}>#{currentUserRank}</Text>
                        </View>
                      ) : (
                        <Ionicons name="water-outline" size={22} color={theme.colors.textSecondary} />
                      )}
                      <Text style={[
                        styles.positionMessage,
                        currentUserRank === 1 && { color: '#FFD700' },
                      ]}>
                        {positionMessage}
                      </Text>
                    </View>
                  </View>

                  {/* Prizes */}
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: accentColor }]}>{t('infoSheetPrizesTitle')}</Text>
                    {rewards.length === 0 ? (
                      <Text style={styles.noPrizesText}>{t('infoSheetNoPrizes')}</Text>
                    ) : (
                      <View style={styles.prizesList}>
                        {rewards
                          .sort((a, b) => a.rank_position - b.rank_position)
                          .map((r) => {
                            const idx = r.rank_position - 1;
                            const medalColor = MEDAL_COLORS[idx] ?? accentColor;
                            const medalEmoji = MEDAL_EMOJIS[idx] ?? `#${r.rank_position}`;
                            return (
                              <View
                                key={r.id}
                                style={[
                                  styles.prizeCard,
                                  {
                                    borderColor: hexToRgba(medalColor, 0.35),
                                    backgroundColor: hexToRgba(medalColor, 0.06),
                                  },
                                ]}
                              >
                                {/* Left accent bar */}
                                <View style={[styles.prizeAccentBar, { backgroundColor: medalColor }]} />

                                <View style={styles.prizeCardLeft}>
                                  <Text style={styles.prizeMedalEmoji}>{medalEmoji}</Text>
                                </View>

                                <View style={styles.prizeCardBody}>
                                  <Text style={[styles.prizeRankLabel, { color: medalColor }]}>
                                    {idx < 3
                                      ? t(`rankOrdinal_${r.rank_position}` as any)
                                      : t('rankOrdinalFallback', { rank: r.rank_position })}
                                  </Text>
                                  <Text style={styles.prizeName}>{r.reward_name}</Text>
                                  {r.reward_description ? (
                                    <Text style={styles.prizeDesc}>{r.reward_description}</Text>
                                  ) : null}
                                  {r.value ? (
                                    <View style={[styles.prizeValueBadge, { borderColor: hexToRgba(medalColor, 0.4), backgroundColor: hexToRgba(medalColor, 0.1) }]}>
                                      <Text style={[styles.prizeValueText, { color: medalColor }]}>{r.value}</Text>
                                    </View>
                                  ) : null}
                                </View>

                                {/* Trophy icon accent */}
                                <View style={[styles.prizeCardIconWrap, { backgroundColor: hexToRgba(medalColor, 0.1) }]}>
                                  <Ionicons name="gift" size={20} color={medalColor} />
                                </View>
                              </View>
                            );
                          })}
                      </View>
                    )}
                  </View>

                  {/* Reset info — weekly and monthly */}
                  {period !== 'all_time' && (
                    <View style={styles.section}>
                      <Text style={[styles.sectionLabel, { color: accentColor }]}>{t('infoResetTitle')}</Text>
                      <View style={[styles.resetCard, { borderColor: hexToRgba(accentColor, 0.14) }]}>
                        {/* Weekly reset row */}
                        <View style={styles.resetRow}>
                          <View style={[styles.resetIconWrap, { backgroundColor: hexToRgba('#F5A623', 0.12) }]}>
                            <Ionicons name="calendar-outline" size={14} color="#F5A623" />
                          </View>
                          <View style={styles.resetRowText}>
                            <Text style={styles.resetRowLabel}>{t('infoResetWeeklyLabel')}</Text>
                            <Text style={styles.resetRowDesc}>{t('infoResetWeeklyDesc')}</Text>
                          </View>
                        </View>
                        <View style={styles.resetDivider} />
                        {/* Monthly reset row */}
                        <View style={styles.resetRow}>
                          <View style={[styles.resetIconWrap, { backgroundColor: hexToRgba('#94A3B8', 0.12) }]}>
                            <Ionicons name="calendar" size={14} color="#94A3B8" />
                          </View>
                          <View style={styles.resetRowText}>
                            <Text style={styles.resetRowLabel}>{t('infoResetMonthlyLabel')}</Text>
                            <Text style={styles.resetRowDesc}>{t('infoResetMonthlyDesc')}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

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
                </AnimatedSheetScrollView>
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
  /* Title */
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
  /* Rule card */
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
  /* Section */
  section: {
    gap: 10,
  },
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  /* Your position card */
  positionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  positionMedal: {
    fontSize: 28,
  },
  positionRankBubble: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  positionRankText: {
    ...fontStyles.number,
    fontSize: 16,
  },
  positionMessage: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  noPrizesText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  /* Prizes list */
  prizesList: {
    gap: 10,
  },
  prizeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 80,
  },
  prizeAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    opacity: 0.7,
  },
  prizeCardLeft: {
    paddingLeft: 14,
    paddingRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeMedalEmoji: {
    fontSize: 28,
  },
  prizeCardBody: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 8,
    gap: 3,
  },
  prizeRankLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  prizeName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.2,
  },
  prizeDesc: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
  },
  prizeValueBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  prizeValueText: {
    ...fontStyles.number,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  prizeCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  /* Reset info card */
  resetCard: {
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  resetIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  resetRowText: {
    flex: 1,
    gap: 3,
  },
  resetRowLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#fff',
    letterSpacing: 0.2,
  },
  resetRowDesc: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  resetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 14,
  },
  /* CTA */
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
