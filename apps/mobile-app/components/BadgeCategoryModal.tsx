import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { BadgeCard } from './BadgeCard';
import type { BadgeWithProgress } from '@/hooks/useAllBadges';

const TIER_RANK: Record<string, number> = {
  bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4,
};

// Type-only mirror of CategoryGroup from TrophyRoom — kept local so the
// modal can be lifted out into other surfaces (e.g. a "Badge" mini-card on
// the profile screen) without dragging TrophyRoom internals along.
export type BadgeCategoryGroup = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  badges: BadgeWithProgress[];
};

interface BadgeCategoryModalProps {
  visible: boolean;
  group: BadgeCategoryGroup | null;
  onClose: () => void;
  onBadgePress: (badge: BadgeWithProgress) => void;
}

type Chip = 'all' | 'earned' | 'locked';

export const BadgeCategoryModal: React.FC<BadgeCategoryModalProps> = ({
  visible,
  group,
  onClose,
  onBadgePress,
}) => {
  const { t } = useTranslation('trophyRoom');
  const [chip, setChip] = useState<Chip>('all');

  const sortedBadges = useMemo(() => {
    if (!group) return [];
    let list = group.badges;
    if (chip === 'earned') list = list.filter((b) => b.is_earned);
    if (chip === 'locked') list = list.filter((b) => !b.is_earned);

    const earned = list
      .filter((b) => b.is_earned)
      .sort((a, b) => (TIER_RANK[a.tier ?? ''] ?? 99) - (TIER_RANK[b.tier ?? ''] ?? 99));
    const locked = list
      .filter((b) => !b.is_earned)
      .sort((a, b) => b.progress - a.progress);
    return [...earned, ...locked];
  }, [group, chip]);

  const earnedCount = group?.badges.filter((b) => b.is_earned).length ?? 0;
  const totalCount = group?.badges.length ?? 0;

  // Reset chip filter every time we open a new category — feels less
  // surprising than carrying over the previous category's filter selection.
  React.useEffect(() => {
    if (visible) setChip('all');
  }, [visible, group?.key]);

  if (!group) return null;

  const accent = group.accent;
  const chipOptions: { key: Chip; label: string }[] = [
    { key: 'all',    label: t('chipAll') },
    { key: 'earned', label: t('chipEarned') },
    { key: 'locked', label: t('chipLocked') },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      transparent
    >
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Tinted top-of-page glow that matches the category accent — same
            visual cue you saw on the row icon, scaled up so the modal feels
            like a continuation of the row instead of a flat overlay. */}
        <View
          pointerEvents="none"
          style={[styles.accentGlow, { backgroundColor: hexToRgba(accent, 0.10) }]}
        />

        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <Animated.View entering={FadeIn.duration(220)} style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCenter} pointerEvents="none">
              <View style={[styles.headerIconBox, { backgroundColor: hexToRgba(accent, 0.14), borderColor: hexToRgba(accent, 0.3) }]}>
                <Ionicons name={group.icon} size={14} color={accent} />
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>{group.label}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(320)} style={styles.statsBanner}>
            <LinearGradient
              colors={[hexToRgba(accent, 0.14), 'rgba(255,255,255,0.03)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.statsLeft}>
              <Text style={[styles.statsCount, { color: accent }]}>
                {earnedCount}<Text style={styles.statsCountOf}> / {totalCount}</Text>
              </Text>
              <Text style={styles.statsLabel}>{t('badgesEarned')}</Text>
            </View>
            <View style={styles.statsBar}>
              <View
                style={[
                  styles.statsBarFill,
                  {
                    width: `${totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0}%`,
                    backgroundColor: accent,
                  },
                ]}
              />
            </View>
          </Animated.View>

          {/* Filter chips — All / Earned / Locked */}
          <Animated.View entering={FadeInDown.delay(140).duration(320)} style={styles.chipRow}>
            {chipOptions.map((c) => {
              const active = chip === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setChip(c.key)}
                  style={[
                    styles.chip,
                    active && { backgroundColor: hexToRgba(accent, 0.16), borderColor: hexToRgba(accent, 0.45) },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && { color: accent },
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>

          <ScrollView
            contentContainerStyle={styles.gridScroll}
            showsVerticalScrollIndicator={false}
          >
            {sortedBadges.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconBox}>
                  <Ionicons name={group.icon} size={36} color="rgba(255,255,255,0.18)" />
                </View>
                <Text style={styles.emptyTitle}>{t('noBadgesFound')}</Text>
                <Text style={styles.emptyText}>{t('noBadgesInCategory')}</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {sortedBadges.map((b) => (
                  <BadgeCard
                    key={`${b.badge_type}-${b.id}`}
                    badge={{
                      badge_id: b.id,
                      badge_name: b.name,
                      badge_description: b.description,
                      badge_image_url: b.badge_image_url,
                      earned_at: b.earned_at || '',
                      badge_type: b.badge_type,
                      gym_name: b.gym_name,
                      gym_id: b.gym_id || null,
                    }}
                    isLocked={!b.is_earned}
                    progress={b.progress}
                    onPress={() => onBadgePress(b)}
                    size="medium"
                    tier={b.tier}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  accentGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
    opacity: 0.6,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 12 : 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 17,
    color: theme.colors.text,
    letterSpacing: 0.8,
    maxWidth: 240,
  },
  headerSpacer: {
    width: 40,
  },

  /* ── Stats banner ── */
  statsBanner: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  statsLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statsCount: {
    ...fontStyles.heading,
    fontSize: 22,
    letterSpacing: 0.4,
  },
  statsCountOf: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
  },
  statsLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statsBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  statsBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  /* ── Chip row ── */
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.3,
  },

  /* ── Grid ── */
  gridScroll: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 80,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  /* ── Empty ── */
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...fontStyles.heading,
    fontSize: 16,
    color: theme.colors.text,
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 19,
  },
});
