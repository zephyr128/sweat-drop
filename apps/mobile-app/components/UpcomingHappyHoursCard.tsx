import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlatformBlur } from '@/components/PlatformBlur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import type { HappyHourWindow } from '@/hooks/useUpcomingHappyHours';
import { formatTime as fmtTime } from '@/lib/utils/formatDate';

function formatTimeShort(iso: string): string {
  return fmtTime(iso, { hour: '2-digit', minute: '2-digit', hour12: false }) || '--:--';
}

function formatStartsIn(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes <= 0) return t('home:happyHour.liveNow');
  if (minutes < 60) return t('home:happyHour.startsInMin', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('home:happyHour.startsInHour', { count: hours });
  const days = Math.floor(hours / 24);
  return t('home:happyHour.startsInDay', { count: days });
}

interface Props {
  windows: HappyHourWindow[];
  liveWindow: HappyHourWindow | null;
}

export function UpcomingHappyHoursCard({ windows, liveWindow }: Props) {
  const { t } = useTranslation();
  const router = useThrottledRouter();

  const goToDetail = () => router.push('/happy-hours' as any);

  // Pick what to show: live window (if any) + the next upcoming one
  const displayWindows: HappyHourWindow[] = [];
  const now = new Date();

  if (liveWindow) {
    displayWindows.push(liveWindow);
  }

  for (const w of windows) {
    if (displayWindows.length >= 2) break;
    const start = new Date(w.startAt);
    const isLive = start <= now && new Date(w.endAt) > now;
    if (!isLive) {
      displayWindows.push(w);
    }
  }

  // Empty state
  if (windows.length === 0) {
    return (
      <Animated.View entering={FadeInDown.delay(220).duration(400)}>
        <TouchableOpacity
          style={[styles.card, { borderColor: 'rgba(255, 215, 0, 0.10)' }]}
          activeOpacity={0.7}
          onPress={goToDetail}
        >
          <PlatformBlur intensity={35} tint="dark" style={[styles.blur, { backgroundColor: 'rgba(30, 28, 15, 0.65)' }]} androidColor="rgba(20,18,8,0.97)">
            <View style={styles.headerRow}>
              <Ionicons name="flash-outline" size={16} color="rgba(255, 215, 0, 0.5)" />
              <Text style={styles.headerTitle}>{t('home:happyHour.title')}</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255, 215, 0, 0.35)" />
            </View>
            <Text style={styles.emptyText}>{t('home:happyHour.noUpcoming')}</Text>
          </PlatformBlur>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(220).duration(400)}>
      <TouchableOpacity
        style={[styles.card, { borderColor: liveWindow ? 'rgba(255, 215, 0, 0.35)' : 'rgba(255, 215, 0, 0.15)' }]}
        activeOpacity={0.7}
        onPress={goToDetail}
      >
        <PlatformBlur intensity={40} tint="dark" style={[styles.blur, { backgroundColor: 'rgba(30, 28, 15, 0.70)' }]} androidColor="rgba(20,18,8,0.97)">
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerEmoji}>⚡</Text>
            <Text style={styles.headerTitle}>{t('home:happyHour.title')}</Text>
            {liveWindow && (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{t('home:happyHour.live')}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color="rgba(255, 215, 0, 0.35)" />
          </View>

          {/* Rows — at most 2: live + next upcoming */}
          {displayWindows.map((w, i) => {
            const isLive = liveWindow?.ruleId === w.ruleId && new Date(w.startAt) <= now && new Date(w.endAt) > now;
            return (
              <View key={`${w.ruleId}-${w.startAt}`} style={[styles.row, i > 0 && styles.rowSeparator]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isLive && styles.rowLabelLive]} numberOfLines={1}>
                    {w.label}
                  </Text>
                  <Text style={styles.rowTime}>
                    {formatTimeShort(w.startAt)} – {formatTimeShort(w.endAt)}
                    {w.isToday && !isLive ? ` · ${t('home:happyHour.today')}` : ''}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <View style={[styles.multiplierBadge, isLive && styles.multiplierBadgeLive]}>
                    <Text style={[styles.multiplierText, getNumberStyle(14)]}>x{w.multiplier}</Text>
                  </View>
                  <Text style={[styles.startsIn, isLive && styles.startsInLive]}>
                    {formatStartsIn(w.minutesUntilStart, t)}
                  </Text>
                </View>
              </View>
            );
          })}
        </PlatformBlur>
      </TouchableOpacity>
    </Animated.View>
  );
}

const GOLD = '#FFD700';
const GOLD_DIM = 'rgba(255, 215, 0, 0.55)';

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  blur: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  headerEmoji: {
    fontSize: 16,
  },
  headerTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: GOLD,
    flex: 1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 215, 0, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  liveText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    color: '#4CAF50',
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 13,
    color: GOLD_DIM,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 215, 0, 0.08)',
  },
  rowLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 13,
    color: theme.colors.text,
  },
  rowLabelLive: {
    color: GOLD,
  },
  rowTime: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 3,
    marginLeft: 10,
  },
  multiplierBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.10)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  multiplierBadgeLive: {
    backgroundColor: 'rgba(255, 215, 0, 0.20)',
  },
  multiplierText: {
    color: GOLD,
  },
  startsIn: {
    ...fontStyles.body,
    fontSize: 11,
    color: GOLD_DIM,
  },
  startsInLive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
});
