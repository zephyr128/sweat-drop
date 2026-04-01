import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Clipboard } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, getContrastColor, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AvailableArena } from '@/hooks/useAvailableArenas';
import ArenaGymBreakdown from '@/components/ArenaGymBreakdown';
import { useAppModal } from '@/lib/stores/useAppModal';

// ── Types ──
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

interface ArenaResult {
  final_rank: number;
  final_score: number;
  total_participants: number;
  prize_description: string | null;
  redemption_code: string | null;
  redemption_status: string | null;
  top_participants: Array<{
    rank: number;
    username: string;
    avatar_url: string | null;
    score: number;
    score_label: string;
    gym_name: string | null;
  }>;
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
  const showModal = useAppModal((s) => s.showModal);

  const [arena, setArena] = useState<AvailableArena | null>(null);
  const [miniLeaderboard, setMiniLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [optInLoading, setOptInLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<{ streak_days: number; total_drops: number } | null>(null);
  const [localBalance, setLocalBalance] = useState(0);
  const [arenaResult, setArenaResult] = useState<ArenaResult | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Arena accent colors (custom branding or default)
  const arenaColors = useMemo(() => {
    const primary = arena?.card_color || branding.primary;
    return {
      primary,
      text: arena?.card_text_color || getContrastColor(primary),
      gradientEnd: arena?.card_gradient_end || null,
    };
  }, [arena, branding.primary]);

  const isUpcoming = arena?.arena_status === 'upcoming';
  const isEnded = arena?.arena_status === 'ended';

  const loadArena = useCallback(async () => {
    if (!session?.user || !id) return;
    setLoading(true);

    try {
      // Fetch arena details from get_available_arenas and filter
      const { data, error } = await supabase.rpc('get_available_arenas', {
        p_user_id: session.user.id,
      });

      if (error) {
        log.error('Error loading arena:', error);
        setArena(null);
      } else {
        const match = ((data as AvailableArena[]) || []).find((a) => a.arena_id === id);
        setArena(match || null);

        if (match?.arena_status === 'ended' && match.user_opted_in) {
          await loadArenaResult();
        } else if (match?.user_opted_in) {
          await loadMiniLeaderboard();
        }
      }

      // Load user profile for opt-in requirement checks
      const { data: profileData } = await supabase
        .from('profiles')
        .select('streak_days, total_drops')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setUserProfile({
          streak_days: profileData.streak_days || 0,
          total_drops: profileData.total_drops || 0,
        });
      }

      // Load local drops balance
      const { data: membershipData } = await supabase
        .from('gym_memberships')
        .select('local_drops_balance')
        .eq('user_id', session.user.id)
        .order('local_drops_balance', { ascending: false })
        .limit(1)
        .single();

      if (membershipData) {
        setLocalBalance(membershipData.local_drops_balance || 0);
      }
    } catch (err) {
      log.error('Arena detail error:', err);
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
      log.error('Mini leaderboard error:', err);
    }
  };

  const loadArenaResult = async () => {
    if (!session?.user || !id) return;
    try {
      const { data, error } = await supabase.rpc('get_user_arena_result', {
        p_arena_id: id,
        p_user_id: session.user.id,
      });

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setArenaResult({
            final_rank: row.final_rank,
            final_score: row.final_score,
            total_participants: row.total_participants,
            prize_description: row.prize_description,
            redemption_code: row.redemption_code,
            redemption_status: row.redemption_status,
            top_participants: row.top_participants || [],
          });
        }
      }
    } catch (err) {
      log.error('Arena result error:', err);
    }
  };

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  useEffect(() => {
    loadArena();
  }, [loadArena]);

  // ── Opt-in requirement check ──
  const canOptIn = useMemo(() => {
    if (!arena || !userProfile) return { allowed: true, reason: '' };
    
    const optInType = arena.opt_in_type || 'free';
    const optInValue = arena.opt_in_value || 0;

    switch (optInType) {
      case 'drops':
        if (localBalance < optInValue) {
          return { allowed: false, reason: t('notEnoughDrops', { needed: optInValue - localBalance }) };
        }
        return { allowed: true, reason: '' };
      case 'streak':
        if ((userProfile.streak_days || 0) < optInValue) {
          return { allowed: false, reason: t('streakTooLow', { needed: optInValue - (userProfile.streak_days || 0) }) };
        }
        return { allowed: true, reason: '' };
      case 'level':
        if ((userProfile.total_drops || 0) < optInValue) {
          return { allowed: false, reason: t('notEnoughReputation', { needed: optInValue - (userProfile.total_drops || 0) }) };
        }
        return { allowed: true, reason: '' };
      case 'free':
      default:
        return { allowed: true, reason: '' };
    }
  }, [arena, userProfile, localBalance, t]);

  const handleOptIn = async () => {
    if (!session?.user || !id) return;
    setOptInLoading(true);

    try {
      const { data, error } = await supabase.rpc('opt_into_arena', {
        p_arena_id: id,
      });

      if (error) {
        showModal({ title: t('error'), body: error.message || t('failedToJoin') });
      } else {
        // Check if RPC returned an error row
        const result = Array.isArray(data) ? data[0] : data;
        if (result && result.success === false && result.error_message) {
          // Parse the error message for user-friendly display
          const msg = result.error_message as string;
          if (msg.includes('Not enough drops')) {
            showModal({ title: t('error'), body: t('notEnoughDrops', { needed: arena?.opt_in_value || 0 }) });
          } else if (msg.includes('Streak too low')) {
            showModal({ title: t('error'), body: t('streakTooLow', { needed: arena?.opt_in_value || 0 }) });
          } else if (msg.includes('Not enough reputation')) {
            showModal({ title: t('error'), body: t('notEnoughReputation', { needed: arena?.opt_in_value || 0 }) });
          } else if (msg.includes('Already opted in')) {
            showModal({ title: t('error'), body: t('alreadyOptedIn') });
          } else if (msg.includes('already ended')) {
            showModal({ title: t('error'), body: t('arenaEnded') });
          } else {
            showModal({ title: t('error'), body: msg });
          }
        } else {
          // Success — refresh arena data
          await loadArena();
        }
      }
    } catch (err: any) {
      showModal({ title: t('error'), body: err?.message || t('somethingWentWrong') });
    } finally {
      setOptInLoading(false);
    }
  };

  const getDaysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const getCountdown = (startDate: string) => {
    const start = new Date(startDate);
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    if (diffMs <= 0) return { days: 0, hours: 0 };
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return { days, hours };
  };

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
        <ScreenHeader title={t('title')} insetHandled />
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
        <ScreenHeader title={t('title')} insetHandled />
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('arenaNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const daysLeft = getDaysLeft(arena.end_date);
  const countdown = getCountdown(arena.start_date);
  const scoringIcon = SCORING_ICONS[arena.scoring_model] || SCORING_ICONS.total_drops;
  const scoringTextKey = `scoring_${arena.scoring_model}` as const;
  const scoringText = t(scoringTextKey, { defaultValue: t('scoring_total_drops') });

  // Opt-in requirement info
  const getOptInInfo = () => {
    const optInType = arena.opt_in_type || 'free';
    const optInValue = arena.opt_in_value || 0;

    switch (optInType) {
      case 'drops':
        return {
          label: t('entryFee', { value: optInValue }),
          userValue: `${t('yourBalance')}: ${localBalance} 💧`,
          meetsRequirement: localBalance >= optInValue,
        };
      case 'streak':
        return {
          label: t('requiresStreak', { value: optInValue }),
          userValue: `${t('yourStreak')}: ${userProfile?.streak_days || 0} 🔥`,
          meetsRequirement: (userProfile?.streak_days || 0) >= optInValue,
        };
      case 'level':
        return {
          label: t('requiresLevel', { value: optInValue }),
          userValue: `${t('yourTotalDrops')}: ${userProfile?.total_drops || 0} ⭐`,
          meetsRequirement: (userProfile?.total_drops || 0) >= optInValue,
        };
      case 'free':
      default:
        return {
          label: t('freeToJoin'),
          userValue: null,
          meetsRequirement: true,
        };
    }
  };

  const optInInfo = getOptInInfo();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} insetHandled />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Upcoming Countdown Banner */}
        {isUpcoming && (
          <Animated.View entering={FadeInDown.delay(50).duration(400)}>
            <View style={[styles.countdownCard, { borderColor: hexToRgba(arenaColors.primary, 0.2), backgroundColor: hexToRgba(arenaColors.primary, 0.06) }]}>
              <Ionicons name="time-outline" size={22} color={arenaColors.primary} />
              <View style={styles.countdownTextContainer}>
                <Text style={[styles.countdownLabel, { color: arenaColors.primary }]}>
                  {countdown.days > 30
                    ? `${t('startsOn')} ${new Date(arena.start_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
                    : countdown.days === 0 && countdown.hours === 0
                      ? t('startingNow')
                      : `${t('startsIn')} ${t('countdownDays', { days: countdown.days, hours: countdown.hours })}`}
                </Text>
                <Text style={styles.countdownSubtext}>{t('arenaNotStarted')}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Arena Hero */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.heroCard, { borderColor: hexToRgba(arenaColors.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.heroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={styles.heroTop}>
                {arena.sponsor_logo ? (
                  <Image source={arena.sponsor_logo} style={styles.heroSponsorLogo} contentFit="contain" transition={200} />
                ) : (
                  <View style={[styles.heroSponsorPlaceholder, { backgroundColor: hexToRgba(arenaColors.primary, 0.15) }]}>
                    <Ionicons name="trophy" size={28} color={arenaColors.primary} />
                  </View>
                )}
                <View style={styles.heroInfo}>
                  <Text style={[styles.heroSponsor, { color: arenaColors.primary }]}>{arena.sponsor_name}</Text>
                  <Text style={[styles.heroName, { color: theme.colors.text }]}>{arena.name}</Text>
                </View>
              </View>

              {arena.description && (
                <Text style={styles.heroDescription}>{arena.description}</Text>
              )}

              {/* Scoring model */}
              <View style={[styles.scoringRow, { borderColor: hexToRgba(arenaColors.primary, 0.1) }]}>
                <Text style={styles.scoringIcon}>{scoringIcon}</Text>
                <Text style={styles.scoringText}>{scoringText}</Text>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: arenaColors.primary }]}>{arena.participant_count}</Text>
                  <Text style={styles.statLabel}>{t('statParticipants')}</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: hexToRgba(arenaColors.primary, 0.15) }]} />
                <View style={styles.statItem}>
                  {isEnded ? (
                    <>
                      <Text style={[styles.statValue, { color: theme.colors.textTertiary }]}>—</Text>
                      <Text style={styles.statLabel}>{t('ended')}</Text>
                    </>
                  ) : isUpcoming ? (
                    <>
                      <Text style={[styles.statValue, { color: arenaColors.primary }]}>{countdown.days}</Text>
                      <Text style={styles.statLabel}>{t('days')}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.statValue, daysLeft <= 3 ? { color: theme.colors.secondary } : { color: arenaColors.primary }]}>
                        {daysLeft}
                      </Text>
                      <Text style={styles.statLabel}>{t('statDaysLeft')}</Text>
                    </>
                  )}
                </View>
                {arena.user_opted_in && (arenaResult?.final_rank ?? arena.user_rank) != null && (
                  <>
                    <View style={[styles.statDivider, { backgroundColor: hexToRgba(arenaColors.primary, 0.15) }]} />
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: arenaColors.primary }]}>#{arenaResult?.final_rank ?? arena.user_rank}</Text>
                      <Text style={styles.statLabel}>{isEnded ? t('finalRank') : t('statYourRank')}</Text>
                    </View>
                  </>
                )}
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* Prizes (hide when full results are shown — results view has its own prize section) */}
        {!(isEnded && arenaResult) && arena.prizes && arena.prizes.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <Text style={styles.sectionTitle}>{t('prizes')}</Text>
            <View style={[styles.prizesCard, { borderColor: hexToRgba(arenaColors.primary, 0.15) }]}>
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

        {/* ─── ENDED RESULTS MODE ─── */}
        {isEnded && arenaResult ? (
          <>
            {/* Ended banner */}
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <View style={[styles.endedBanner, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                <BlurView intensity={40} tint="dark" style={[styles.endedBannerBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  <Ionicons name="flag" size={18} color={theme.colors.textTertiary} />
                  <Text style={styles.endedBannerText}>
                    {t('endedOn', { date: new Date(arena.end_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) })}
                  </Text>
                </BlurView>
              </View>
            </Animated.View>

            {/* Final rank + score card */}
            <Animated.View entering={FadeInDown.delay(260).duration(400)}>
              <View style={[styles.resultCard, { borderColor: hexToRgba(arenaColors.primary, 0.2) }]}>
                <BlurView intensity={50} tint="dark" style={[styles.resultCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  <View style={styles.resultRankRow}>
                    <View style={[styles.resultRankCircle, { backgroundColor: hexToRgba(arenaColors.primary, 0.12), borderColor: hexToRgba(arenaColors.primary, 0.3) }]}>
                      <Text style={[styles.resultRankNumber, getNumberStyle(32), { color: arenaColors.primary }]}>
                        #{arenaResult.final_rank}
                      </Text>
                    </View>
                    <View style={styles.resultRankInfo}>
                      <Text style={styles.resultRankLabel}>{t('finalRank')}</Text>
                      <Text style={styles.resultRankOf}>
                        {t('ofParticipants', { count: arenaResult.total_participants })}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.resultScoreRow, { borderTopColor: hexToRgba(arenaColors.primary, 0.1) }]}>
                    <Text style={styles.resultScoreLabel}>{t('finalScore')}</Text>
                    <Text style={[styles.resultScoreValue, getNumberStyle(18), { color: arenaColors.primary }]}>
                      {SCORING_ICONS[arena.scoring_model] || '💧'} {Math.round(arenaResult.final_score)}
                    </Text>
                  </View>
                </BlurView>
              </View>
            </Animated.View>

            {/* Prize won — only if user won a prize */}
            {arenaResult.prize_description && (
              <Animated.View entering={FadeInDown.delay(320).duration(400)}>
                <Text style={styles.sectionTitle}>🏆 {t('yourPrize')}</Text>
                <View style={[styles.prizeWonCard, { borderColor: hexToRgba(arenaColors.primary, 0.25) }]}>
                  <BlurView intensity={50} tint="dark" style={[styles.prizeWonBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    <Text style={[styles.prizeWonText, { color: arenaColors.primary }]}>
                      {arenaResult.prize_description}
                    </Text>
                    {arenaResult.redemption_code && (
                      <View style={styles.redemptionCodeRow}>
                        <View style={[styles.redemptionCodeBox, { backgroundColor: hexToRgba(arenaColors.primary, 0.08) }]}>
                          <Text style={styles.redemptionCodeLabel}>{t('redemptionCode')}</Text>
                          <Text style={[styles.redemptionCodeValue, getNumberStyle(16)]}>{arenaResult.redemption_code}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.copyButton, { backgroundColor: hexToRgba(arenaColors.primary, 0.15) }]}
                          onPress={() => handleCopyCode(arenaResult.redemption_code!)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={18} color={arenaColors.primary} />
                          {codeCopied && <Text style={[styles.copiedText, { color: arenaColors.primary }]}>{t('copied')}</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                    {arenaResult.redemption_status && (
                      <View style={styles.redemptionStatusRow}>
                        <Ionicons
                          name={arenaResult.redemption_status === 'redeemed' ? 'checkmark-circle' : 'time-outline'}
                          size={14}
                          color={arenaResult.redemption_status === 'redeemed' ? '#4ade80' : theme.colors.textTertiary}
                        />
                        <Text style={[styles.redemptionStatusText, arenaResult.redemption_status === 'redeemed' && { color: '#4ade80' }]}>
                          {arenaResult.redemption_status === 'redeemed' ? t('redeemed') : t('pendingRedemption')}
                        </Text>
                      </View>
                    )}
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* Final leaderboard (top 10) */}
            {arenaResult.top_participants && arenaResult.top_participants.length > 0 && (
              <Animated.View entering={FadeInDown.delay(380).duration(400)}>
                <Text style={styles.sectionTitle}>{t('leaderboard')}</Text>
                <View style={[styles.lbContainer, { borderColor: hexToRgba(arenaColors.primary, 0.15) }]}>
                  <BlurView intensity={50} tint="dark" style={[styles.lbBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    {arenaResult.top_participants.map((entry, index) => {
                      const isCurrent = entry.rank === arenaResult.final_rank;
                      const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                      return (
                        <View
                          key={`${entry.rank}-${entry.username}`}
                          style={[
                            styles.lbItem,
                            index < arenaResult.top_participants.length - 1 && styles.lbItemBorder,
                            isCurrent && { backgroundColor: hexToRgba(arenaColors.primary, 0.08), borderLeftWidth: 3, borderLeftColor: arenaColors.primary },
                          ]}
                        >
                          <Text style={[styles.lbRank, getNumberStyle(14)]}>
                            {medal || `#${entry.rank}`}
                          </Text>
                          <View style={styles.lbUserInfo}>
                            <Text style={[styles.lbUsername, isCurrent && { color: arenaColors.primary }]}>
                              {entry.username}{isCurrent ? t('youSuffix') : ''}
                            </Text>
                            {entry.gym_name && (
                              <Text style={styles.lbGymName}>{entry.gym_name}</Text>
                            )}
                          </View>
                          <Text style={[styles.lbScore, { color: isCurrent ? arenaColors.primary : theme.colors.textSecondary }]}>
                            {entry.score_label || `${Math.round(entry.score)}`}
                          </Text>
                        </View>
                      );
                    })}
                  </BlurView>
                </View>
              </Animated.View>
            )}
          </>
        ) : isEnded ? (
          /* Arena ended but no results yet (not participated or results not available) */
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={[styles.endedBanner, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.endedBannerBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="flag" size={18} color={theme.colors.textTertiary} />
                <Text style={styles.endedBannerText}>
                  {t('endedOn', { date: new Date(arena.end_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) })}
                </Text>
              </BlurView>
            </View>
            <View style={styles.noResultsBox}>
              <Ionicons name="hourglass-outline" size={28} color={theme.colors.textTertiary} />
              <Text style={styles.noResultsText}>{t('noResults')}</Text>
            </View>
          </Animated.View>
        ) : !arena.user_opted_in ? (
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            {/* Opt-in requirement info box */}
            <View style={[styles.optInInfoBox, { borderColor: hexToRgba(arenaColors.primary, 0.15) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.optInInfoBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <View style={styles.optInInfoRow}>
                  <Ionicons
                    name={arena.opt_in_type === 'free' ? 'checkmark-circle' : 'information-circle'}
                    size={20}
                    color={optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary}
                  />
                  <Text style={[styles.optInInfoLabel, { color: optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary }]}>
                    {optInInfo.label}
                  </Text>
                </View>
                {optInInfo.userValue && (
                  <Text style={[styles.optInInfoValue, { color: optInInfo.meetsRequirement ? theme.colors.textSecondary : theme.colors.secondary }]}>
                    {optInInfo.userValue}
                  </Text>
                )}
                {!canOptIn.allowed && (
                  <Text style={styles.optInErrorText}>{canOptIn.reason}</Text>
                )}
              </BlurView>
            </View>

            <TouchableOpacity
              style={[styles.joinButton, !canOptIn.allowed && { opacity: 0.4 }]}
              onPress={handleOptIn}
              disabled={optInLoading || !canOptIn.allowed}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[arenaColors.primary, arenaColors.gradientEnd || arenaColors.primary]}
                style={styles.joinButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {optInLoading ? (
                  <ActivityIndicator size="small" color={arenaColors.text} />
                ) : (
                  <>
                    <Ionicons name="flash" size={22} color={arenaColors.text} />
                    <Text style={[styles.joinButtonText, { color: arenaColors.text }]}>
                      {isUpcoming ? t('optInEarly') : t('joinArena')}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {/* Cross-gym score breakdown — only for opted-in multi-gym users */}
            {arena.gym_score_breakdown && arena.gym_score_breakdown.length > 1 && (
              <ArenaGymBreakdown
                breakdown={arena.gym_score_breakdown}
                totalScore={arena.user_score ?? 0}
                scoringModel={arena.scoring_model}
                accentColor={arenaColors.primary}
                delay={280}
              />
            )}

            {/* No sessions yet — opted in but 0 entries in breakdown */}
            {arena.gym_score_breakdown && arena.gym_score_breakdown.length === 0 && (
              <Animated.View entering={FadeInDown.delay(280).duration(400)}>
                <View style={[styles.noSessionsBox, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                  <Ionicons name="barbell-outline" size={20} color={theme.colors.textTertiary} />
                  <Text style={styles.noSessionsText}>{t('noSessionsYet')}</Text>
                </View>
              </Animated.View>
            )}

            {/* Mini Leaderboard */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
              <View style={styles.leaderboardHeader}>
                <Text style={styles.sectionTitle}>{t('leaderboard')}</Text>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/arena/[id]/leaderboard', params: { id: arena.arena_id } })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewAllLink, { color: arenaColors.primary }]}>{t('viewFull')}</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.lbContainer, { borderColor: hexToRgba(arenaColors.primary, 0.15) }]}>
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
                            isCurrent && { backgroundColor: hexToRgba(arenaColors.primary, 0.08), borderLeftWidth: 3, borderLeftColor: arenaColors.primary },
                          ]}
                        >
                          <Text style={[styles.lbRank, getNumberStyle(14)]}>
                            {medal || `#${entry.rank}`}
                          </Text>
                          <View style={styles.lbUserInfo}>
                            <Text style={[styles.lbUsername, isCurrent && { color: arenaColors.primary }]}>
                              {entry.username}{isCurrent ? t('youSuffix') : ''}
                            </Text>
                          </View>
                          <Text style={[styles.lbScore, { color: isCurrent ? arenaColors.primary : theme.colors.textSecondary }]}>
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

  /* Countdown Card */
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  countdownTextContainer: {
    flex: 1,
  },
  countdownLabel: {
    ...fontStyles.heading,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  countdownSubtext: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
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

  /* Opt-in info box */
  optInInfoBox: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginTop: 20,
  },
  optInInfoBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },
  optInInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optInInfoLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.3,
    flex: 1,
  },
  optInInfoValue: {
    ...fontStyles.body,
    fontSize: 13,
    marginTop: 6,
    marginLeft: 28,
    letterSpacing: 0.2,
  },
  optInErrorText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.secondary,
    marginTop: 6,
    marginLeft: 28,
    letterSpacing: 0.2,
  },

  /* Join Button */
  joinButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
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

  /* No sessions yet (opted in, zero breakdown entries) */
  noSessionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
    backgroundColor: 'rgba(20, 20, 30, 0.5)',
  },
  noSessionsText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },

  /* ── Ended results mode ── */
  endedBanner: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 16,
  },
  endedBannerBlur: {
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  endedBannerText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  resultCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  resultCardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 20,
  },
  resultRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resultRankCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultRankNumber: {
    letterSpacing: 0.5,
  },
  resultRankInfo: {
    flex: 1,
    gap: 4,
  },
  resultRankLabel: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  resultRankOf: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  resultScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resultScoreLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  resultScoreValue: {
    letterSpacing: 0.5,
  },
  /* Prize won card */
  prizeWonCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  prizeWonBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },
  prizeWonText: {
    ...fontStyles.heading,
    fontSize: 18,
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  redemptionCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  redemptionCodeBox: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
  },
  redemptionCodeLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  redemptionCodeValue: {
    color: theme.colors.text,
    letterSpacing: 2,
  },
  copyButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copiedText: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  redemptionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  redemptionStatusText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  /* No results placeholder */
  noResultsBox: {
    alignItems: 'center',
    gap: 10,
    padding: 32,
  },
  noResultsText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
});
