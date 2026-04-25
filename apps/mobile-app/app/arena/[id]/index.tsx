import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo, type ComponentProps } from 'react';
import { useLocalSearchParams} from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, getContrastColor, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
import { AvailableArena } from '@/hooks/useAvailableArenas';
import ArenaGymBreakdown from '@/components/ArenaGymBreakdown';
import { useAppModal } from '@/lib/stores/useAppModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip emoji symbols from backend score_label (e.g. "729 💧" → "729").
 * Uses \p{Emoji_Presentation} instead of \p{Emoji} because the broader
 * \p{Emoji} property also covers ASCII digits 0-9 and would strip them.
 */
function cleanScoreLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.replace(/\p{Emoji_Presentation}/gu, '').trim();
}

// ── Types ───────────────────────────────────────────────────────────────────

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

const SCORING_ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  total_drops: 'water',
  days_visited: 'calendar-outline',
  variety_score: 'barbell-outline',
  streak_days: 'flame-outline',
};

const CYAN = '#22D3EE';
const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';
const MEDAL_COLORS = [GOLD, SILVER, BRONZE] as const;

// ── Main screen ──────────────────────────────────────────────────────────────

export default function ArenaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useThrottledRouter();
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
  const [collectionGymName, setCollectionGymName] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const arenaColors = useMemo(() => {
    const primary = arena?.card_color || CYAN;
    return {
      primary,
      text: arena?.card_text_color || getContrastColor(primary),
      gradientEnd: arena?.card_gradient_end || null,
      hasBranding: !!(arena?.card_color),
    };
  }, [arena]);

  const isUpcoming = arena?.arena_status === 'upcoming';
  const isEnded = arena?.arena_status === 'ended';

  const loadArena = useCallback(async () => {
    if (!session?.user || !id) return;
    setLoading(true);

    try {
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
      if (!error && data) setMiniLeaderboard(data as LeaderboardEntry[]);
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

      // Fetch collection gym name from arena_participants
      const { data: participantData } = await supabase
        .from('arena_participants')
        .select('gym_id, gyms(name)')
        .eq('arena_id', id)
        .eq('user_id', session.user.id)
        .single();

      if (participantData?.gyms) {
        const gymsData = participantData.gyms as { name: string } | { name: string }[];
        const gymName = Array.isArray(gymsData) ? gymsData[0]?.name : gymsData?.name;
        setCollectionGymName(gymName ?? null);
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

  const canOptIn = useMemo(() => {
    if (!arena || !userProfile) return { allowed: true, reason: '' };
    const optInType = arena.opt_in_type || 'free';
    const optInValue = arena.opt_in_value || 0;
    switch (optInType) {
      case 'drops':
        return localBalance < optInValue
          ? { allowed: false, reason: t('notEnoughDrops', { needed: optInValue - localBalance }) }
          : { allowed: true, reason: '' };
      case 'streak':
        return (userProfile.streak_days || 0) < optInValue
          ? { allowed: false, reason: t('streakTooLow', { needed: optInValue - (userProfile.streak_days || 0) }) }
          : { allowed: true, reason: '' };
      case 'level':
        return (userProfile.total_drops || 0) < optInValue
          ? { allowed: false, reason: t('notEnoughReputation', { needed: optInValue - (userProfile.total_drops || 0) }) }
          : { allowed: true, reason: '' };
      default:
        return { allowed: true, reason: '' };
    }
  }, [arena, userProfile, localBalance, t]);

  const handleOptIn = async () => {
    if (!session?.user || !id) return;
    setOptInLoading(true);
    try {
      const { data, error } = await supabase.rpc('opt_into_arena', { p_arena_id: id });
      if (error) {
        showModal({ title: t('error'), body: error.message || t('failedToJoin') });
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        if (result && result.success === false && result.error_message) {
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
          await loadArena();
        }
      }
    } catch (err: any) {
      showModal({ title: t('error'), body: err?.message || t('somethingWentWrong') });
    } finally {
      setOptInLoading(false);
    }
  };

  const getDaysLeft = (endDate: string) =>
    Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const getCountdown = (startDate: string) => {
    const diffMs = new Date(startDate).getTime() - Date.now();
    if (diffMs <= 0) return { days: 0, hours: 0 };
    return {
      days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    };
  };

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

  // ── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
        <ScreenHeader title={t('title')} insetHandled />
        <View style={styles.centerContent}>
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
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('arenaNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const daysLeft = getDaysLeft(arena.end_date);
  const countdown = getCountdown(arena.start_date);
  const scoringIcon = SCORING_ICONS[arena.scoring_model] ?? 'water';
  const scoringTextKey = `scoring_${arena.scoring_model}` as const;
  const scoringText = t(scoringTextKey, { defaultValue: t('scoring_total_drops') });

  const getOptInInfo = () => {
    const optInType = arena.opt_in_type || 'free';
    const optInValue = arena.opt_in_value || 0;
    switch (optInType) {
      case 'drops':
        return {
          label: t('entryFee', { value: optInValue }),
          userValue: `${t('yourBalance')}: ${localBalance}`,
          userValueIcon: 'water' as ComponentProps<typeof Ionicons>['name'],
          meetsRequirement: localBalance >= optInValue,
        };
      case 'streak':
        return {
          label: t('requiresStreak', { value: optInValue }),
          userValue: `${t('yourStreak')}: ${userProfile?.streak_days || 0}`,
          userValueIcon: 'flame-outline' as ComponentProps<typeof Ionicons>['name'],
          meetsRequirement: (userProfile?.streak_days || 0) >= optInValue,
        };
      case 'level':
        return {
          label: t('requiresLevel', { value: optInValue }),
          userValue: `${t('yourTotalDrops')}: ${userProfile?.total_drops || 0}`,
          userValueIcon: 'star-outline' as ComponentProps<typeof Ionicons>['name'],
          meetsRequirement: (userProfile?.total_drops || 0) >= optInValue,
        };
      default:
        return {
          label: t('freeToJoin'),
          userValue: null,
          userValueIcon: null,
          meetsRequirement: true,
        };
    }
  };

  const optInInfo = getOptInInfo();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} insetHandled />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Upcoming countdown banner ─────────────────────────────────── */}
        {isUpcoming && (
          <Animated.View entering={FadeInDown.delay(50).duration(400)}>
            <View style={[
              styles.countdownCard,
              { borderColor: hexToRgba(arenaColors.primary, 0.2), backgroundColor: hexToRgba(arenaColors.primary, 0.06) },
            ]}>
              <Ionicons name="time-outline" size={22} color={arenaColors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.countdownLabel, { color: arenaColors.primary }]}>
                  {countdown.days > 30
                    ? `${t('startsOn')} ${fmtDate(arena.start_date, { month: 'long', day: 'numeric' })}`
                    : countdown.days === 0 && countdown.hours === 0
                      ? t('startingNow')
                      : `${t('startsIn')} ${t('countdownDays', { days: countdown.days, hours: countdown.hours })}`}
                </Text>
                <Text style={styles.countdownSubtext}>{t('arenaNotStarted')}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Hero card ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[
            styles.heroCard,
            arenaColors.hasBranding
              ? { borderColor: 'transparent' }
              : {
                  borderTopColor: hexToRgba(arenaColors.primary, 0.38),
                  borderLeftColor: hexToRgba(arenaColors.primary, 0.14),
                  borderRightColor: 'rgba(255,255,255,0.05)',
                  borderBottomColor: 'rgba(255,255,255,0.03)',
                },
          ]}>
            {arenaColors.hasBranding ? (
              <LinearGradient
                colors={[arenaColors.primary, arenaColors.gradientEnd || arenaColors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroBlur}
              >
                {/* Logo + info row */}
                <View style={styles.heroTop}>
                  {arena.sponsor_logo ? (
                    <Image
                      source={arena.sponsor_logo}
                      style={[styles.heroSponsorLogo, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14 }]}
                      contentFit="contain"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.heroSponsorPlaceholder, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                      <MaterialCommunityIcons name="sword-cross" size={28} color={arenaColors.text} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.heroSponsorLabel, { color: hexToRgba(arenaColors.text, 0.75) }]}>{arena.sponsor_name}</Text>
                    <Text style={[styles.heroName, { color: arenaColors.text }]}>{arena.name}</Text>
                  </View>

                  <View style={[styles.heroScoringBadge, { backgroundColor: hexToRgba(CYAN, 0.22) }]}>
                    <Ionicons name={scoringIcon} size={16} color={CYAN} />
                  </View>
                </View>

                {arena.description ? (
                  <Text style={[styles.heroDescription, { color: hexToRgba(arenaColors.text, 0.75) }]}>{arena.description}</Text>
                ) : null}

                <View style={[styles.scoringRow, { borderColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons name={scoringIcon} size={16} color={arenaColors.text} />
                  <Text style={[styles.scoringText, { color: arenaColors.text }]}>{scoringText}</Text>
                </View>

                {/* Stats row */}
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatItem}>
                    <Text style={[styles.heroStatValue, { color: arenaColors.text }]}>{arena.participant_count}</Text>
                    <Text style={[styles.heroStatLabel, { color: hexToRgba(arenaColors.text, 0.6) }]}>{t('statParticipants')}</Text>
                  </View>
                  <View style={[styles.statHairline, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                  <View style={styles.heroStatItem}>
                    {isEnded ? (
                      <>
                        <Text style={[styles.heroStatValue, { color: hexToRgba(arenaColors.text, 0.5) }]}>—</Text>
                        <Text style={[styles.heroStatLabel, { color: hexToRgba(arenaColors.text, 0.6) }]}>{t('ended')}</Text>
                      </>
                    ) : isUpcoming ? (
                      <>
                        <Text style={[styles.heroStatValue, { color: arenaColors.text }]}>{countdown.days}</Text>
                        <Text style={[styles.heroStatLabel, { color: hexToRgba(arenaColors.text, 0.6) }]}>{t('days')}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.heroStatValue, { color: daysLeft <= 3 ? theme.colors.secondary : arenaColors.text }]}>
                          {daysLeft}
                        </Text>
                        <Text style={[styles.heroStatLabel, { color: hexToRgba(arenaColors.text, 0.6) }]}>{t('statDaysLeft')}</Text>
                      </>
                    )}
                  </View>
                  {arena.user_opted_in && (arenaResult?.final_rank ?? arena.user_rank) != null && (
                    <>
                      <View style={[styles.statHairline, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                      <View style={styles.heroStatItem}>
                        <Text style={[styles.heroStatValue, { color: arenaColors.text }]}>
                          #{arenaResult?.final_rank ?? arena.user_rank}
                        </Text>
                        <Text style={[styles.heroStatLabel, { color: hexToRgba(arenaColors.text, 0.6) }]}>
                          {isEnded ? t('finalRank') : t('statYourRank')}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </LinearGradient>
            ) : (
              /* ── Glass card (no branding) ── */
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={55} tint="dark" style={styles.heroBlur}>
                <LinearGradient
                  colors={[hexToRgba(arenaColors.primary, 0.10), 'rgba(255,255,255,0.02)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {/* Logo + info row */}
                <View style={styles.heroTop}>
                  {arena.sponsor_logo ? (
                    <Image source={arena.sponsor_logo} style={styles.heroSponsorLogo} contentFit="contain" transition={200} />
                  ) : (
                    <View style={[styles.heroSponsorPlaceholder, { backgroundColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                      <MaterialCommunityIcons name="sword-cross" size={28} color={arenaColors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.heroSponsorLabel, { color: arenaColors.primary }]}>{arena.sponsor_name}</Text>
                    <Text style={styles.heroName}>{arena.name}</Text>
                  </View>
                  <View style={[styles.heroScoringBadge, { backgroundColor: hexToRgba(arenaColors.primary, 0.10) }]}>
                    <Ionicons name={scoringIcon} size={16} color={arenaColors.primary} />
                  </View>
                </View>

                {arena.description ? (
                  <Text style={styles.heroDescription}>{arena.description}</Text>
                ) : null}

                <View style={[styles.scoringRow, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                  <Ionicons name={scoringIcon} size={16} color={arenaColors.primary} />
                  <Text style={styles.scoringText}>{scoringText}</Text>
                </View>

                {/* Stats row */}
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStatItem}>
                    <Text style={[styles.heroStatValue, { color: arenaColors.primary }]}>{arena.participant_count}</Text>
                    <Text style={styles.heroStatLabel}>{t('statParticipants')}</Text>
                  </View>
                  <View style={[styles.statHairline, { backgroundColor: hexToRgba(arenaColors.primary, 0.15) }]} />
                  <View style={styles.heroStatItem}>
                    {isEnded ? (
                      <>
                        <Text style={[styles.heroStatValue, { color: theme.colors.textTertiary }]}>—</Text>
                        <Text style={styles.heroStatLabel}>{t('ended')}</Text>
                      </>
                    ) : isUpcoming ? (
                      <>
                        <Text style={[styles.heroStatValue, { color: arenaColors.primary }]}>{countdown.days}</Text>
                        <Text style={styles.heroStatLabel}>{t('days')}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.heroStatValue, daysLeft <= 3 ? { color: theme.colors.secondary } : { color: arenaColors.primary }]}>
                          {daysLeft}
                        </Text>
                        <Text style={styles.heroStatLabel}>{t('statDaysLeft')}</Text>
                      </>
                    )}
                  </View>
                  {arena.user_opted_in && (arenaResult?.final_rank ?? arena.user_rank) != null && (
                    <>
                      <View style={[styles.statHairline, { backgroundColor: hexToRgba(arenaColors.primary, 0.15) }]} />
                      <View style={styles.heroStatItem}>
                        <Text style={[styles.heroStatValue, { color: arenaColors.primary }]}>
                          #{arenaResult?.final_rank ?? arena.user_rank}
                        </Text>
                        <Text style={styles.heroStatLabel}>{isEnded ? t('finalRank') : t('statYourRank')}</Text>
                      </View>
                    </>
                  )}
                </View>
              </PlatformBlur>
            )}
          </View>
        </Animated.View>

        {/* ── Prizes card ───────────────────────────────────────────────── */}
        {!(isEnded && arenaResult) && arena.prizes && arena.prizes.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={[
              styles.card,
              {
                borderTopColor: hexToRgba(arenaColors.primary, 0.22),
                borderLeftColor: hexToRgba(arenaColors.primary, 0.10),
                borderRightColor: 'rgba(255,255,255,0.04)',
                borderBottomColor: 'rgba(255,255,255,0.02)',
              },
            ]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                <LinearGradient
                  colors={[hexToRgba(arenaColors.primary, 0.06), 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconWrap, { backgroundColor: hexToRgba(arenaColors.primary, 0.10) }]}>
                    <Ionicons name="gift-outline" size={16} color={arenaColors.primary} />
                  </View>
                  <Text style={styles.cardTitle}>{t('prizes')}</Text>
                </View>

                {arena.prizes.sort((a, b) => a.rank - b.rank).map((prize, i) => {
                  const medalColor = MEDAL_COLORS[i] ?? arenaColors.primary;
                  const isLast = i === arena.prizes.length - 1;
                  return (
                    <View
                      key={prize.rank}
                      style={[
                        styles.prizeRow,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
                      ]}
                    >
                      <View style={[styles.prizeRankBadge, { backgroundColor: hexToRgba(medalColor, 0.10) }]}>
                        <Ionicons name="gift-outline" size={12} color={hexToRgba(medalColor, 0.85)} />
                        <Text style={[styles.prizeRankNum, { color: medalColor }]}>#{prize.rank}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.prizeText}>{prize.prize}</Text>
                        {prize.value ? (
                          <Text style={[styles.prizeValue, { color: hexToRgba(arenaColors.primary, 0.65) }]}>{prize.value}</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ── ENDED RESULTS MODE ────────────────────────────────────────── */}
        {isEnded && arenaResult ? (
          <>
            {/* Ended banner */}
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <View style={[styles.endedBanner, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={styles.endedBannerBlur}>
                  <Ionicons name="flag" size={16} color={theme.colors.textTertiary} />
                  <Text style={styles.endedBannerText}>
                    {t('endedOn', { date: fmtDate(arena.end_date, { month: 'long', day: 'numeric', year: 'numeric' }) })}
                  </Text>
                </PlatformBlur>
              </View>
            </Animated.View>

            {/* Final rank + score card */}
            <Animated.View entering={FadeInDown.delay(260).duration(400)}>
              <View style={[
                styles.card,
                {
                  borderTopColor: hexToRgba(arenaColors.primary, 0.35),
                  borderLeftColor: hexToRgba(arenaColors.primary, 0.14),
                  borderRightColor: 'rgba(255,255,255,0.05)',
                  borderBottomColor: 'rgba(255,255,255,0.03)',
                },
              ]}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                  <LinearGradient
                    colors={[hexToRgba(arenaColors.primary, 0.08), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.resultRankRow}>
                    <View style={[styles.resultRankCircle, { backgroundColor: hexToRgba(arenaColors.primary, 0.12), borderColor: hexToRgba(arenaColors.primary, 0.30) }]}>
                      <Text style={[styles.resultRankNumber, getNumberStyle(30), { color: arenaColors.primary }]}>
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

                  <View style={[styles.resultScoreRow, { borderTopColor: hexToRgba(arenaColors.primary, 0.10) }]}>
                    <Text style={styles.resultScoreLabel}>{t('finalScore')}</Text>
                    <View style={styles.resultScoreValueRow}>
                      <Ionicons name={SCORING_ICONS[arena.scoring_model] ?? 'water'} size={15} color={arenaColors.primary} />
                      <Text style={[styles.resultScoreValue, getNumberStyle(17), { color: arenaColors.primary }]}>
                        {Math.round(arenaResult.final_score)}
                      </Text>
                    </View>
                  </View>
                </PlatformBlur>
              </View>
            </Animated.View>

            {/* Prize won */}
            {arenaResult.prize_description && (
              <>
                <Animated.View entering={FadeInDown.delay(320).duration(400)}>
                  <View style={[
                    styles.card,
                    { borderTopColor: hexToRgba(arenaColors.primary, 0.25), borderLeftColor: hexToRgba(arenaColors.primary, 0.10), borderRightColor: 'rgba(255,255,255,0.04)', borderBottomColor: 'rgba(255,255,255,0.02)' },
                  ]}>
                    <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                      <View style={styles.cardHeader}>
                        <View style={[styles.cardIconWrap, { backgroundColor: hexToRgba(arenaColors.primary, 0.10) }]}>
                          <Ionicons name="trophy-outline" size={16} color={arenaColors.primary} />
                        </View>
                        <Text style={styles.cardTitle}>{t('yourPrize')}</Text>
                      </View>

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
                            size={13}
                            color={arenaResult.redemption_status === 'redeemed' ? '#4ade80' : theme.colors.textTertiary}
                          />
                          <Text style={[styles.redemptionStatusText, arenaResult.redemption_status === 'redeemed' && { color: '#4ade80' }]}>
                            {arenaResult.redemption_status === 'redeemed' ? t('redeemed') : t('pendingRedemption')}
                          </Text>
                        </View>
                      )}

                      {collectionGymName && (
                        <View style={[styles.redemptionStatusRow, { marginTop: 6 }]}>
                          <Ionicons name="location-outline" size={13} color={theme.colors.textTertiary} />
                          <Text style={styles.redemptionStatusText}>
                            {t('collectAt', { gym: collectionGymName })}
                          </Text>
                        </View>
                      )}
                    </PlatformBlur>
                  </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(370).duration(400)}>
                  <TouchableOpacity
                    style={[styles.viewPrizesButton, { borderColor: hexToRgba(arenaColors.primary, 0.30) }]}
                    onPress={() => router.push('/redemptions')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="gift-outline" size={17} color={arenaColors.primary} />
                    <Text style={[styles.viewPrizesText, { color: arenaColors.primary }]}>
                      {t('viewMyPrizes')}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={hexToRgba(arenaColors.primary, 0.6)} />
                  </TouchableOpacity>
                </Animated.View>
              </>
            )}

            {/* Final leaderboard */}
            {arenaResult.top_participants && arenaResult.top_participants.length > 0 && (
              <Animated.View entering={FadeInDown.delay(380).duration(400)}>
                <View style={[
                  styles.card,
                  {
                    borderTopColor: hexToRgba(arenaColors.primary, 0.18),
                    borderLeftColor: hexToRgba(arenaColors.primary, 0.08),
                    borderRightColor: 'rgba(255,255,255,0.03)',
                    borderBottomColor: 'rgba(255,255,255,0.02)',
                  },
                ]}>
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.cardIconWrap, { backgroundColor: hexToRgba(arenaColors.primary, 0.10) }]}>
                        <Ionicons name="podium-outline" size={16} color={arenaColors.primary} />
                      </View>
                      <Text style={styles.cardTitle}>{t('leaderboard')}</Text>
                    </View>
                    {arenaResult.top_participants.map((entry, index) => {
                      const isCurrent = entry.rank === arenaResult.final_rank;
                      const medalColor = index < 3 ? MEDAL_COLORS[index] : null;
                      return (
                        <View
                          key={`${entry.rank}-${entry.username}`}
                          style={[
                            styles.lbItem,
                            index < arenaResult.top_participants.length - 1 && styles.lbItemBorder,
                            isCurrent && {
                              backgroundColor: hexToRgba(arenaColors.primary, 0.08),
                              borderLeftWidth: 3,
                              borderLeftColor: arenaColors.primary,
                            },
                          ]}
                        >
                          <Text style={[styles.lbRank, getNumberStyle(13), { color: medalColor ?? theme.colors.textSecondary }]}>
                            #{entry.rank}
                          </Text>
                          <View style={styles.lbUserInfo}>
                            <Text style={[styles.lbUsername, isCurrent && { color: arenaColors.primary }]}>
                              {entry.username}{isCurrent ? t('youSuffix') : ''}
                            </Text>
                            {entry.gym_name ? <Text style={styles.lbGymName}>{entry.gym_name}</Text> : null}
                          </View>
                          <View style={styles.scoreChip}>
                            <Text style={[styles.lbScore, { color: isCurrent ? arenaColors.primary : theme.colors.textSecondary }]}>
                              {cleanScoreLabel(entry.score_label || `${Math.round(entry.score)}`)}
                            </Text>
                            <Ionicons name="water" size={11} color={isCurrent ? arenaColors.primary : theme.colors.textSecondary} />
                          </View>
                        </View>
                      );
                    })}
                  </PlatformBlur>
                </View>
              </Animated.View>
            )}
          </>
        ) : isEnded ? (
          /* Ended, no results */
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={[styles.endedBanner, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={styles.endedBannerBlur}>
                <Ionicons name="flag" size={16} color={theme.colors.textTertiary} />
                <Text style={styles.endedBannerText}>
                  {t('endedOn', { date: fmtDate(arena.end_date, { month: 'long', day: 'numeric', year: 'numeric' }) })}
                </Text>
              </PlatformBlur>
            </View>
            <View style={styles.noResultsBox}>
              <Ionicons name="hourglass-outline" size={28} color={theme.colors.textTertiary} />
              <Text style={styles.noResultsText}>{t('noResults')}</Text>
            </View>
          </Animated.View>
        ) : !arena.user_opted_in ? (
          /* Not joined — opt-in info + join button */
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <View style={[
              styles.card,
              {
                borderTopColor: hexToRgba(arenaColors.primary, 0.22),
                borderLeftColor: hexToRgba(arenaColors.primary, 0.10),
                borderRightColor: 'rgba(255,255,255,0.04)',
                borderBottomColor: 'rgba(255,255,255,0.02)',
              },
            ]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={45} tint="dark" style={styles.cardBlur}>
                {/* Requirement pill row */}
                <View style={styles.infoPillsRow}>
                  <View style={[
                    styles.infoPill,
                    {
                      backgroundColor: hexToRgba(optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary, 0.08),
                      borderColor: hexToRgba(optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary, 0.22),
                    },
                  ]}>
                    <Ionicons
                      name={arena.opt_in_type === 'free' ? 'checkmark-circle-outline' : 'information-circle-outline'}
                      size={13}
                      color={optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary}
                    />
                    <Text style={[styles.infoPillText, { color: optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary }]}>
                      {optInInfo.label}
                    </Text>
                  </View>
                  {optInInfo.userValue && optInInfo.userValueIcon && (
                    <View style={[
                      styles.infoPill,
                      {
                        backgroundColor: hexToRgba(optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary, 0.06),
                        borderColor: hexToRgba(optInInfo.meetsRequirement ? arenaColors.primary : theme.colors.secondary, 0.15),
                      },
                    ]}>
                      <Ionicons
                        name={optInInfo.userValueIcon}
                        size={12}
                        color={optInInfo.meetsRequirement ? theme.colors.textSecondary : theme.colors.secondary}
                      />
                      <Text style={[styles.infoPillText, { color: optInInfo.meetsRequirement ? theme.colors.textSecondary : theme.colors.secondary }]}>
                        {optInInfo.userValue}
                      </Text>
                    </View>
                  )}
                </View>

                {!canOptIn.allowed && (
                  <Text style={styles.optInErrorText}>{canOptIn.reason}</Text>
                )}
              </PlatformBlur>
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
            {/* Cross-gym score breakdown */}
            {arena.gym_score_breakdown && arena.gym_score_breakdown.length > 1 && (
              <ArenaGymBreakdown
                breakdown={arena.gym_score_breakdown}
                totalScore={arena.user_score ?? 0}
                scoringModel={arena.scoring_model}
                accentColor={arenaColors.primary}
                delay={280}
              />
            )}

            {/* No sessions yet */}
            {arena.gym_score_breakdown && arena.gym_score_breakdown.length === 0 && (
              <Animated.View entering={FadeInDown.delay(280).duration(400)}>
                <View style={[styles.noSessionsBox, { borderColor: hexToRgba(arenaColors.primary, 0.12) }]}>
                  <Ionicons name="barbell-outline" size={18} color={theme.colors.textTertiary} />
                  <Text style={styles.noSessionsText}>{t('noSessionsYet')}</Text>
                </View>
              </Animated.View>
            )}

            {/* Mini leaderboard */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
              <View style={[
                styles.card,
                {
                  borderTopColor: hexToRgba(arenaColors.primary, 0.18),
                  borderLeftColor: hexToRgba(arenaColors.primary, 0.08),
                  borderRightColor: 'rgba(255,255,255,0.03)',
                  borderBottomColor: 'rgba(255,255,255,0.02)',
                },
              ]}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                  <View style={[styles.cardHeader, { marginBottom: 0 }]}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.cardIconWrap, { backgroundColor: hexToRgba(arenaColors.primary, 0.10) }]}>
                        <Ionicons name="podium-outline" size={16} color={arenaColors.primary} />
                      </View>
                      <Text style={styles.cardTitle}>{t('leaderboard')}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/arena/[id]/leaderboard', params: { id: arena.arena_id } })}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.viewAllLink, { color: arenaColors.primary }]}>{t('viewFull')}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.lbSeparator, { backgroundColor: hexToRgba(arenaColors.primary, 0.08) }]} />

                  {miniLeaderboard.length === 0 ? (
                    <View style={styles.lbEmpty}>
                      <Text style={styles.lbEmptyText}>{t('noParticipants')}</Text>
                    </View>
                  ) : (
                    miniLeaderboard.map((entry, index) => {
                      const isCurrent = isCurrentUser(entry.user_id);
                      const medalColor = index < 3 ? MEDAL_COLORS[index] : null;
                      return (
                        <View
                          key={entry.user_id}
                          style={[
                            styles.lbItem,
                            index < miniLeaderboard.length - 1 && styles.lbItemBorder,
                            isCurrent && {
                              backgroundColor: hexToRgba(arenaColors.primary, 0.08),
                              borderLeftWidth: 3,
                              borderLeftColor: arenaColors.primary,
                            },
                          ]}
                        >
                          <Text style={[styles.lbRank, getNumberStyle(13), { color: medalColor ?? theme.colors.textSecondary }]}>
                            #{entry.rank}
                          </Text>
                          <View style={styles.lbUserInfo}>
                            <Text style={[styles.lbUsername, isCurrent && { color: arenaColors.primary }]}>
                              {entry.username}{isCurrent ? t('youSuffix') : ''}
                            </Text>
                          </View>
                          <View style={styles.scoreChip}>
                            <Text style={[styles.lbScore, { color: isCurrent ? arenaColors.primary : theme.colors.textSecondary }]}>
                              {cleanScoreLabel(entry.score_label)}
                            </Text>
                            <Ionicons name="water" size={11} color={isCurrent ? arenaColors.primary : theme.colors.textSecondary} />
                          </View>
                        </View>
                      );
                    })
                  )}
                </PlatformBlur>
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
  centerContent: {
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
    gap: 12,
  },

  /* Countdown banner */
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  countdownLabel: {
    ...fontStyles.heading,
    fontSize: 17,
    letterSpacing: 0.5,
  },
  countdownSubtext: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  /* Hero card */
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  heroBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  heroSponsorLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    flexShrink: 0,
  },
  heroSponsorPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  heroSponsorLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.0,
    marginBottom: 3,
  },
  heroName: {
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  heroScoringBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  heroDescription: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
    letterSpacing: 0.2,
  },
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  scoringText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
    letterSpacing: 0.2,
    flex: 1,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  heroStatValue: {
    ...fontStyles.number,
    fontSize: 22,
  },
  heroStatLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statHairline: {
    width: 1,
    height: 28,
  },

  /* Generic card */
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  cardBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.8,
  },
  viewAllLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  lbSeparator: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 6,
    marginTop: 10,
  },

  /* Prizes */
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  prizeRankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    flexShrink: 0,
  },
  prizeRankNum: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  prizeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  prizeValue: {
    ...fontStyles.body,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.2,
  },

  /* Opt-in info pills */
  infoPillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  optInErrorText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.secondary,
    marginTop: 10,
    letterSpacing: 0.2,
  },

  /* Join button */
  joinButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
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
    fontSize: 19,
    letterSpacing: 0.5,
  },

  /* Leaderboard */
  lbEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  lbEmptyText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  lbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  lbItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  lbRank: {
    width: 36,
    fontSize: 13,
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
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  lbScore: {
    ...fontStyles.number,
    fontSize: 13,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  /* No sessions */
  noSessionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(20, 20, 30, 0.5)',
  },
  noSessionsText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },

  /* Ended results mode */
  endedBanner: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  endedBannerBlur: {
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  endedBannerText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
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
    fontSize: 17,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  resultRankOf: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  resultScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resultScoreLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  resultScoreValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  resultScoreValue: {
    letterSpacing: 0.5,
  },

  /* Prize won */
  prizeWonText: {
    ...fontStyles.heading,
    fontSize: 17,
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
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 4,
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
    fontSize: 8,
    letterSpacing: 0.3,
  },
  redemptionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  redemptionStatusText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },

  /* No results */
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

  /* View prizes button */
  viewPrizesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  viewPrizesText: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
