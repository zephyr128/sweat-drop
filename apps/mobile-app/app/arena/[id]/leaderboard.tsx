import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, getContrastColor, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip emoji from backend score_label (e.g. "729 💧" → "729") */
function cleanScoreLabel(label: string): string {
  return label.replace(/\p{Emoji}/gu, '').trim();
}

// ── Constants ────────────────────────────────────────────────────────────────

const CYAN = '#22D3EE';
const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';
const MEDAL_COLORS = [GOLD, SILVER, BRONZE] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  score: number;
  score_label: string;
  is_newcomer: boolean;
  streak_days: number;
  gym_name: string | null;
}

interface ArenaInfo {
  id: string;
  name: string;
  sponsor_name: string;
  sponsor_logo: string | null;
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
  is_finalized: boolean;
  prizes: Array<{ rank: number; prize: string; value?: string }>;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ArenaLeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { t } = useTranslation('arena');

  const [arenaInfo, setArenaInfo] = useState<ArenaInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);

  // Same color logic as arena/[id]/index.tsx — CYAN fallback, arena branding if set
  const arenaColors = useMemo(() => {
    const primary = arenaInfo?.card_color || CYAN;
    return {
      primary,
      text: arenaInfo?.card_text_color || getContrastColor(primary),
      gradientEnd: arenaInfo?.card_gradient_end || null,
      hasBranding: !!(arenaInfo?.card_color),
    };
  }, [arenaInfo]);

  const loadData = useCallback(async () => {
    if (!session?.user || !id) return;
    setLoading(true);

    try {
      const { data: arenaData } = await supabase
        .from('sweat_arenas')
        .select('id, name, sponsor_name, sponsor_logo, card_color, card_text_color, card_gradient_end, is_finalized, prizes')
        .eq('id', id)
        .single();

      if (arenaData) setArenaInfo(arenaData as ArenaInfo);

      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: 'arena',
        p_scope_id: id,
        p_period: 'all_time',
        p_limit: 100,
        p_newcomer_only: false,
      });

      if (error) {
        log.error('Error loading arena leaderboard:', error);
        setLeaderboard([]);
      } else if (data) {
        const entries = data as LeaderboardEntry[];
        setLeaderboard(entries);
        setCurrentUserEntry(entries.find((e) => e.user_id === session.user.id) || null);
      }
    } catch (err) {
      log.error('Arena leaderboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isCurrentUser = (userId: string) => session?.user?.id === userId;
  const getPrizeForRank = (rank: number) => arenaInfo?.prizes.find((p) => p.rank === rank);
  const medalColor = (rank: number) => MEDAL_COLORS[rank - 1] ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={arenaInfo?.name || t('arenaLeaderboard')} insetHandled />

      {/* ── Arena header banner ─────────────────────────────────────────── */}
      {arenaInfo && (
        <Animated.View entering={FadeInDown.delay(50).duration(300)} style={styles.bannerWrap}>
          {arenaColors.hasBranding ? (
            <LinearGradient
              colors={[arenaColors.primary, arenaColors.gradientEnd || arenaColors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bannerGradient}
            >
              <View style={styles.bannerInner}>
                {arenaInfo.sponsor_logo ? (
                  <Image source={arenaInfo.sponsor_logo} style={[styles.bannerLogo, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 }]} contentFit="contain" transition={200} />
                ) : (
                  <View style={[styles.bannerLogoPlaceholder, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <MaterialCommunityIcons name="sword-cross" size={14} color={arenaColors.text} />
                  </View>
                )}
                <Text style={[styles.bannerSponsor, { color: hexToRgba(arenaColors.text, 0.8) }]}>
                  {t('sponsoredBy', { name: arenaInfo.sponsor_name })}
                </Text>
                {arenaInfo.is_finalized && (
                  <View style={[styles.finalizedBadge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                    <Text style={[styles.finalizedText, { color: arenaColors.text }]}>{t('ended')}</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          ) : (
            <View style={[styles.bannerGlass, { borderColor: hexToRgba(arenaColors.primary, 0.20) }]}>
              <PlatformBlur intensity={40} tint="dark" style={styles.bannerGlassBlur} androidColor="rgba(16,16,28,0.95)">
                <View style={styles.bannerInner}>
                  {arenaInfo.sponsor_logo ? (
                    <Image source={arenaInfo.sponsor_logo} style={styles.bannerLogo} contentFit="contain" transition={200} />
                  ) : (
                    <View style={[styles.bannerLogoPlaceholder, { backgroundColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                      <MaterialCommunityIcons name="sword-cross" size={14} color={arenaColors.primary} />
                    </View>
                  )}
                  <Text style={[styles.bannerSponsor, { color: arenaColors.primary }]}>
                    {t('sponsoredBy', { name: arenaInfo.sponsor_name })}
                  </Text>
                  {arenaInfo.is_finalized && (
                    <View style={[styles.finalizedBadge, { backgroundColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                      <Text style={[styles.finalizedText, { color: arenaColors.primary }]}>{t('ended')}</Text>
                    </View>
                  )}
                </View>
              </PlatformBlur>
            </View>
          )}
        </Animated.View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={arenaColors.primary} />
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noParticipants')}</Text>
          </View>
        ) : (
          <>
            {/* ── Top 3 Podium ─────────────────────────────────────────── */}
            {leaderboard.length >= 3 && (
              <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                <View style={styles.podium}>
                  {[1, 0, 2].map((podiumIdx) => {
                    const entry = leaderboard[podiumIdx];
                    if (!entry) return null;
                    const isFirst = podiumIdx === 0;
                    const prize = getPrizeForRank(entry.rank);
                    const mColor = medalColor(entry.rank) ?? arenaColors.primary;
                    const isCurrent = isCurrentUser(entry.user_id);

                    return (
                      <View key={entry.user_id} style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}>
                        {/* Avatar */}
                        <View style={[
                          styles.podiumAvatar,
                          { borderColor: mColor, borderWidth: isFirst ? 2 : 1 },
                          isCurrent && { backgroundColor: hexToRgba(mColor, 0.12) },
                        ]}>
                          {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                            <Image source={entry.avatar_url} style={styles.podiumAvatarImg} transition={200} />
                          ) : entry.avatar_url ? (
                            <Text style={[styles.podiumEmoji, isFirst && styles.podiumEmojiFirst]}>
                              {entry.avatar_url}
                            </Text>
                          ) : (
                            <Text style={[styles.podiumInitial, isFirst && styles.podiumInitialFirst, { color: mColor }]}>
                              {(entry.username || 'U').charAt(0).toUpperCase()}
                            </Text>
                          )}
                        </View>

                        {/* Medal icon */}
                        <View style={[styles.medalBadge, { backgroundColor: hexToRgba(mColor, 0.12) }]}>
                          <Ionicons name="trophy" size={isFirst ? 11 : 9} color={mColor} />
                          <Text style={[styles.medalRank, { color: mColor }]}>#{entry.rank}</Text>
                        </View>

                        <Text style={[styles.podiumName, isCurrent && { color: mColor }]} numberOfLines={1}>
                          {entry.username}
                        </Text>
                        <View style={styles.scoreChip}>
                          <Text style={[styles.podiumScore, { color: mColor }]} numberOfLines={1}>
                            {cleanScoreLabel(entry.score_label)}
                          </Text>
                          <Ionicons name="water" size={10} color={mColor} />
                        </View>
                        {prize && (
                          <Text style={styles.podiumPrize} numberOfLines={1}>
                            {prize.prize}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            {/* ── Full list ─────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(250).duration(400)}>
              <View style={[
                styles.listContainer,
                {
                  borderTopColor: hexToRgba(arenaColors.primary, 0.22),
                  borderLeftColor: hexToRgba(arenaColors.primary, 0.10),
                  borderRightColor: 'rgba(255,255,255,0.04)',
                  borderBottomColor: 'rgba(255,255,255,0.02)',
                },
              ]}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.listBlur}>
                  <LinearGradient
                    colors={[hexToRgba(arenaColors.primary, 0.06), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {leaderboard.map((entry, index) => {
                    const isCurrent = isCurrentUser(entry.user_id);
                    const mColor = medalColor(entry.rank);

                    return (
                      <TouchableOpacity
                        key={entry.user_id}
                        activeOpacity={0.7}
                        onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
                        style={[
                          styles.listItem,
                          index < leaderboard.length - 1 && styles.listItemBorder,
                          isCurrent && {
                            backgroundColor: hexToRgba(arenaColors.primary, 0.08),
                            borderLeftWidth: 3,
                            borderLeftColor: arenaColors.primary,
                          },
                        ]}
                      >
                        {/* Rank */}
                        <View style={styles.rankContainer}>
                          <Text style={[
                            styles.rankText,
                            getNumberStyle(13),
                            { color: mColor ?? theme.colors.textSecondary },
                          ]}>
                            #{entry.rank}
                          </Text>
                        </View>

                        {/* Avatar */}
                        {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                          <Image source={entry.avatar_url} style={styles.listAvatar} transition={200} />
                        ) : entry.avatar_url ? (
                          <View style={styles.listAvatarPlaceholder}>
                            <Text style={styles.listAvatarEmoji}>{entry.avatar_url}</Text>
                          </View>
                        ) : (
                          <View style={styles.listAvatarPlaceholder}>
                            <Text style={styles.listAvatarInitial}>
                              {(entry.username || 'U').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Name */}
                        <View style={styles.userInfo}>
                          <Text style={[styles.listUsername, isCurrent && { color: arenaColors.primary }]}>
                            {entry.username}{isCurrent ? t('youSuffix') : ''}
                          </Text>
                        </View>

                        {/* Score */}
                        <View style={styles.scoreChip}>
                          <Text style={[styles.scoreLabel, getNumberStyle(13), { color: isCurrent ? arenaColors.primary : theme.colors.textSecondary }]}>
                            {cleanScoreLabel(entry.score_label)}
                          </Text>
                          <Ionicons name="water" size={11} color={isCurrent ? arenaColors.primary : theme.colors.textSecondary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </PlatformBlur>
              </View>
            </Animated.View>

            {/* ── Sticky footer (current user outside top 50) ─────────── */}
            {currentUserEntry && currentUserEntry.rank > 50 && (
              <Animated.View entering={FadeInDown.delay(350).duration(400)}>
                <View style={[
                  styles.stickyFooter,
                  {
                    borderTopColor: hexToRgba(arenaColors.primary, 0.35),
                    borderLeftColor: hexToRgba(arenaColors.primary, 0.15),
                    borderRightColor: 'rgba(255,255,255,0.04)',
                    borderBottomColor: 'rgba(255,255,255,0.02)',
                  },
                ]}>
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.stickyFooterBlur}>
                    <LinearGradient
                      colors={[hexToRgba(arenaColors.primary, 0.10), 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <Text style={[styles.stickyRank, getNumberStyle(16), { color: arenaColors.primary }]}>
                      #{currentUserEntry.rank}
                    </Text>
                    <Text style={styles.stickyName}>{currentUserEntry.username}</Text>
                    <View style={styles.scoreChip}>
                      <Text style={[styles.scoreLabel, getNumberStyle(13), { color: arenaColors.primary }]}>
                        {cleanScoreLabel(currentUserEntry.score_label)}
                      </Text>
                      <Ionicons name="water" size={11} color={arenaColors.primary} />
                    </View>
                  </PlatformBlur>
                </View>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  /* Banner */
  bannerWrap: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  bannerGradient: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  bannerGlass: {
    borderRadius: 14,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  bannerGlassBlur: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,16,28,0.82)',
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerLogo: {
    width: 22,
    height: 22,
    borderRadius: 6,
    flexShrink: 0,
  },
  bannerLogoPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bannerSponsor: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
    flex: 1,
  },
  finalizedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  finalizedText: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 0.8,
  },

  scrollView: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  loadingContainer: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
  },

  /* Podium */
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: theme.spacing.lg,
  },
  podiumItemFirst: { paddingTop: 0 },
  podiumAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  podiumAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  podiumEmoji: { fontSize: 20 },
  podiumEmojiFirst: { fontSize: 26 },
  podiumInitial: {
    ...fontStyles.heading,
    fontSize: 20,
  },
  podiumInitialFirst: {
    fontSize: 26,
  },
  medalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 2,
  },
  medalRank: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  podiumName: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: theme.colors.text,
    textAlign: 'center',
    maxWidth: 84,
  },
  podiumScore: {
    ...fontStyles.number,
    fontSize: 12,
  },
  podiumPrize: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    maxWidth: 84,
    marginTop: 1,
  },

  /* List */
  listContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  listBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,16,28,0.82)',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  listItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rankContainer: {
    width: 36,
    alignItems: 'center',
  },
  rankText: {
    color: theme.colors.textSecondary,
  },
  listAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: 6,
  },
  listAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarEmoji: { fontSize: 16 },
  listAvatarInitial: {
    ...fontStyles.heading,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  userInfo: {
    flex: 1,
    marginLeft: 8,
  },
  listUsername: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  scoreLabel: {
    color: theme.colors.textSecondary,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  /* Sticky footer */
  stickyFooter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: theme.spacing.md,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  stickyFooterBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,16,28,0.82)',
  },
  stickyRank: {
    width: 50,
  },
  stickyName: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
  },
});
