import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

// ── Types ──
interface AvailableArena {
  arena_id: string;
  name: string;
  description: string | null;
  sponsor_name: string;
  sponsor_logo: string | null;
  scoring_model: string;
  start_date: string;
  end_date: string;
  participant_count: number;
  user_opted_in: boolean;
  user_rank: number | null;
  user_score: number | null;
  prizes: Array<{ rank: number; prize: string; value?: string }>;
}

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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SCORING_ICONS: Record<string, string> = {
  total_drops: '💧',
  days_visited: '📅',
  variety_score: '🏋️',
  streak_days: '🔥',
};

export default function ArenaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('arena');

  const [arena, setArena] = useState<AvailableArena | null>(null);
  const [miniLeaderboard, setMiniLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [optInLoading, setOptInLoading] = useState(false);

  const loadArena = useCallback(async () => {
    if (!session?.user || !id) return;
    setLoading(true);

    try {
      // Fetch arena details from get_available_arenas and filter
      const { data, error } = await supabase.rpc('get_available_arenas', {
        p_user_id: session.user.id,
      });

      if (error) {
        console.error('Error loading arena:', error);
        setArena(null);
      } else {
        const match = ((data as AvailableArena[]) || []).find((a) => a.arena_id === id);
        setArena(match || null);

        // If user is opted in, load mini leaderboard
        if (match?.user_opted_in) {
          await loadMiniLeaderboard();
        }
      }
    } catch (err) {
      console.error('Arena detail error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, id]);

  const loadMiniLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: 'arena',
        p_scope_id: id,
        p_period: 'all_time',
        p_limit: 10,
        p_newcomer_only: false,
      });

      if (!error && data) {
        setMiniLeaderboard(data as LeaderboardEntry[]);
      }
    } catch (err) {
      console.error('Mini leaderboard error:', err);
    }
  };

  useEffect(() => {
    loadArena();
  }, [loadArena]);

  const handleOptIn = async () => {
    if (!session?.user || !id) return;
    setOptInLoading(true);

    try {
      const { data, error } = await supabase.rpc('opt_into_arena', {
        p_arena_id: id,
      });

      if (error) {
        Alert.alert(t('error'), error.message || t('failedToJoin'));
      } else {
        // Refresh arena data
        await loadArena();
      }
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('somethingWentWrong'));
    } finally {
      setOptInLoading(false);
    }
  };

  const getDaysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!arena) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('arenaNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const daysLeft = getDaysLeft(arena.end_date);
  const scoringIcon = SCORING_ICONS[arena.scoring_model] || SCORING_ICONS.total_drops;
  const scoringTextKey = `scoring_${arena.scoring_model}` as const;
  const scoringText = t(scoringTextKey, { defaultValue: t('scoring_total_drops') });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Arena Hero */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.heroCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.heroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={styles.heroTop}>
                {arena.sponsor_logo ? (
                  <Image source={{ uri: arena.sponsor_logo }} style={styles.heroSponsorLogo} resizeMode="contain" />
                ) : (
                  <View style={[styles.heroSponsorPlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Ionicons name="trophy" size={28} color={branding.primary} />
                  </View>
                )}
                <View style={styles.heroInfo}>
                  <Text style={[styles.heroSponsor, { color: branding.primary }]}>{arena.sponsor_name}</Text>
                  <Text style={styles.heroName}>{arena.name}</Text>
                </View>
              </View>

              {arena.description && (
                <Text style={styles.heroDescription}>{arena.description}</Text>
              )}

              {/* Scoring model */}
              <View style={[styles.scoringRow, { borderColor: hexToRgba(branding.primary, 0.1) }]}>
                <Text style={styles.scoringIcon}>{scoringIcon}</Text>
                <Text style={styles.scoringText}>{scoringText}</Text>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: branding.primary }]}>{arena.participant_count}</Text>
                  <Text style={styles.statLabel}>{t('statParticipants')}</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: hexToRgba(branding.primary, 0.15) }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, daysLeft <= 3 ? { color: theme.colors.secondary } : { color: branding.primary }]}>
                    {daysLeft}
                  </Text>
                  <Text style={styles.statLabel}>{t('statDaysLeft')}</Text>
                </View>
                {arena.user_opted_in && arena.user_rank != null && (
                  <>
                    <View style={[styles.statDivider, { backgroundColor: hexToRgba(branding.primary, 0.15) }]} />
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: branding.primary }]}>#{arena.user_rank}</Text>
                      <Text style={styles.statLabel}>{t('statYourRank')}</Text>
                    </View>
                  </>
                )}
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* Prizes */}
        {arena.prizes.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <Text style={styles.sectionTitle}>{t('prizes')}</Text>
            <View style={[styles.prizesCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.prizesBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                {arena.prizes
                  .sort((a, b) => a.rank - b.rank)
                  .map((prize) => {
                    const medal = prize.rank === 1 ? '🥇' : prize.rank === 2 ? '🥈' : prize.rank === 3 ? '🥉' : `#${prize.rank}`;
                    return (
                      <View
                        key={prize.rank}
                        style={[
                          styles.prizeRow,
                          prize.rank < arena.prizes.length && styles.prizeRowBorder,
                        ]}
                      >
                        <Text style={styles.prizeMedal}>{medal}</Text>
                        <View style={styles.prizeInfo}>
                          <Text style={styles.prizeText}>{prize.prize}</Text>
                          {prize.value && <Text style={styles.prizeValue}>{prize.value}</Text>}
                        </View>
                      </View>
                    );
                  })}
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Opt-In or Mini Leaderboard */}
        {!arena.user_opted_in ? (
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <TouchableOpacity
              style={[styles.joinButton]}
              onPress={handleOptIn}
              disabled={optInLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[branding.primary, branding.primaryDark]}
                style={styles.joinButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {optInLoading ? (
                  <ActivityIndicator size="small" color={branding.onPrimary} />
                ) : (
                  <>
                    <Ionicons name="flash" size={22} color={branding.onPrimary} />
                    <Text style={[styles.joinButtonText, { color: branding.onPrimary }]}>{t('joinArena')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {/* Mini Leaderboard */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
              <View style={styles.leaderboardHeader}>
                <Text style={styles.sectionTitle}>{t('leaderboard')}</Text>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/arena/[id]/leaderboard', params: { id: arena.arena_id } })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewAllLink, { color: branding.primary }]}>{t('viewFull')}</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.lbContainer, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                <BlurView intensity={50} tint="dark" style={[styles.lbBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  {miniLeaderboard.length === 0 ? (
                    <View style={styles.lbEmpty}>
                      <Text style={styles.lbEmptyText}>{t('noParticipants')}</Text>
                    </View>
                  ) : (
                    miniLeaderboard.map((entry, index) => {
                      const isCurrent = isCurrentUser(entry.user_id);
                      const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                      return (
                        <View
                          key={entry.user_id}
                          style={[
                            styles.lbItem,
                            index < miniLeaderboard.length - 1 && styles.lbItemBorder,
                            isCurrent && { backgroundColor: hexToRgba(branding.primary, 0.08), borderLeftWidth: 3, borderLeftColor: branding.primary },
                          ]}
                        >
                          <Text style={[styles.lbRank, getNumberStyle(14)]}>
                            {medal || `#${entry.rank}`}
                          </Text>
                          <View style={styles.lbUserInfo}>
                            <Text style={[styles.lbUsername, isCurrent && { color: branding.primary }]}>
                              {entry.username}{isCurrent ? t('youSuffix') : ''}
                            </Text>
                            {entry.gym_name && (
                              <Text style={styles.lbGymName}>{entry.gym_name}</Text>
                            )}
                          </View>
                          <Text style={[styles.lbScore, { color: isCurrent ? branding.primary : theme.colors.textSecondary }]}>
                            {entry.score_label}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </BlurView>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize['2xl'],
    ...fontStyles.heading,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  headerSpacer: { width: 40 },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    letterSpacing: 0.3,
    marginBottom: 12,
    marginTop: 20,
  },

  /* Hero Card */
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  heroBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 20,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  heroSponsorLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  heroSponsorPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInfo: {
    flex: 1,
  },
  heroSponsor: {
    ...fontStyles.heading,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  heroName: {
    ...fontStyles.heading,
    fontSize: 24,
    color: theme.colors.text,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  heroDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  scoringIcon: {
    fontSize: 20,
  },
  scoringText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    ...fontStyles.number,
    fontSize: 22,
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 30,
  },

  /* Prizes */
  prizesCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  prizesBlur: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  prizeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  prizeMedal: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  prizeInfo: {
    flex: 1,
  },
  prizeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  prizeValue: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  /* Join Button */
  joinButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 24,
  },
  joinButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
  },
  joinButtonText: {
    ...fontStyles.heading,
    fontSize: 20,
    letterSpacing: 0.5,
  },

  /* Mini Leaderboard */
  leaderboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  viewAllLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  lbContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  lbBlur: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  lbEmpty: {
    padding: 24,
    alignItems: 'center',
  },
  lbEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  lbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  lbItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  lbRank: {
    ...fontStyles.number,
    width: 36,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  lbUserInfo: {
    flex: 1,
    marginLeft: 8,
  },
  lbUsername: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  lbGymName: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  lbScore: {
    ...fontStyles.number,
    fontSize: 13,
  },
});
