import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { theme, fontStyles } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAvailableArenas } from '@/hooks/useAvailableArenas';
import { useSession } from '@/hooks/useSession';

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

export default function ArenasScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('arena');
  const { arenas, loading, refresh } = useAvailableArenas();

  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        refresh();
      }
    }, [session?.user, refresh])
  );

  const getDaysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={branding.primary} />
          </View>
        ) : arenas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noArenas')}</Text>
            <Text style={styles.emptySubtext}>{t('noArenasDesc')}</Text>
          </View>
        ) : (
          arenas.map((arena, index) => {
            const daysLeft = getDaysLeft(arena.end_date);
            const scoringIcon = SCORING_ICONS[arena.scoring_model] || '💧';

            return (
              <Animated.View key={arena.arena_id} entering={FadeInDown.delay(100 + index * 80).duration(400)}>
                <TouchableOpacity
                  style={[styles.arenaCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                  onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                  activeOpacity={0.8}
                >
                  <BlurView intensity={50} tint="dark" style={styles.arenaCardBlur}>
                    {/* Top row: sponsor + name + scoring */}
                    <View style={styles.arenaCardTop}>
                      {arena.sponsor_logo ? (
                        <Image source={{ uri: arena.sponsor_logo }} style={styles.sponsorLogo} resizeMode="contain" />
                      ) : (
                        <View style={[styles.sponsorLogoPlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                          <Ionicons name="trophy" size={20} color={branding.primary} />
                        </View>
                      )}
                      <View style={styles.arenaCardInfo}>
                        <Text style={styles.arenaName} numberOfLines={1}>{arena.name}</Text>
                        <Text style={[styles.sponsorLabel, { color: branding.primary }]}>{arena.sponsor_name}</Text>
                      </View>
                      <View style={styles.arenaCardMeta}>
                        <Text style={styles.scoringIcon}>{scoringIcon}</Text>
                      </View>
                    </View>

                    {/* Description */}
                    {arena.description && (
                      <Text style={styles.arenaDescription} numberOfLines={2}>
                        {arena.description}
                      </Text>
                    )}

                    {/* Bottom row: stats + rank */}
                    <View style={styles.arenaCardBottom}>
                      <View style={styles.arenaStats}>
                        <View style={styles.arenaStat}>
                          <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
                          <Text style={styles.arenaStatText}>{arena.participant_count} {t('participants').toLowerCase()}</Text>
                        </View>
                        <Text style={styles.arenaStatDot}>·</Text>
                        <View style={styles.arenaStat}>
                          <Ionicons name="time-outline" size={14} color={daysLeft <= 3 ? theme.colors.secondary : theme.colors.textSecondary} />
                          <Text style={[styles.arenaStatText, daysLeft <= 3 && { color: theme.colors.secondary }]}>
                            {daysLeft} {t('daysLeft').toLowerCase()}
                          </Text>
                        </View>
                      </View>
                      {arena.user_opted_in ? (
                        <View style={[styles.arenaRankBadge, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                          <Text style={[styles.arenaRankText, { color: branding.primary }]}>
                            #{arena.user_rank ?? '—'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.joinBadge, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                          <Ionicons name="add-circle-outline" size={14} color={branding.primary} />
                          <Text style={[styles.joinBadgeText, { color: branding.primary }]}>{t('joinArena')}</Text>
                        </View>
                      )}
                    </View>

                    {/* Prizes preview */}
                    {arena.prizes && arena.prizes.length > 0 && (
                      <View style={[styles.prizesRow, { borderTopColor: hexToRgba(branding.primary, 0.08) }]}>
                        {arena.prizes.slice(0, 3).map((prize, i) => {
                          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                          return (
                            <View key={i} style={styles.prizePill}>
                              <Text style={styles.prizeMedal}>{medal}</Text>
                              <Text style={styles.prizeText} numberOfLines={1}>{prize.prize}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </BlurView>
                </TouchableOpacity>
              </Animated.View>
            );
          })
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
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  /* Loading / Empty */
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
  emptySubtext: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  /* Arena Card */
  arenaCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  arenaCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  arenaCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sponsorLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  sponsorLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arenaCardInfo: {
    flex: 1,
  },
  arenaName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  sponsorLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  arenaCardMeta: {
    alignItems: 'center',
  },
  scoringIcon: {
    fontSize: 20,
  },
  arenaDescription: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  arenaCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arenaStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arenaStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arenaStatText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  arenaStatDot: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  arenaRankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  arenaRankText: {
    ...fontStyles.number,
    fontSize: 14,
  },
  joinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  joinBadgeText: {
    ...fontStyles.heading,
    fontSize: 14,
  },
  prizesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  prizePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  prizeMedal: {
    fontSize: 14,
  },
  prizeText: {
    ...fontStyles.bodyMedium,
    fontSize: 10,
    color: theme.colors.textSecondary,
    flex: 1,
  },
});
