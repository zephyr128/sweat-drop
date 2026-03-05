import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { getNumberStyle, fontStyles } from '@/lib/theme';

/* ── Types ────────────────────────────────────────── */
interface QuickStatsRowProps {
  streak: number;
  todayDrops: number;
  lastWorkout: {
    durationSeconds: number;
    dropsEarned: number;
    endedAt: string;
  } | null;
  brandPrimary: string;
}

/* ── Helpers ──────────────────────────────────────── */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return `${m}min`;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Component ────────────────────────────────────── */
export const QuickStatsRow: React.FC<QuickStatsRowProps> = ({
  streak,
  todayDrops,
  lastWorkout,
  brandPrimary,
}) => {
  // Decide what to show for the "last workout" pill
  const lastLabel = lastWorkout
    ? formatDuration(lastWorkout.durationSeconds)
    : '—';
  const lastSublabel = lastWorkout ? timeAgo(lastWorkout.endedAt) : 'No workouts';

  const streakActive = streak > 0;

  return (
    <View style={styles.row}>
      {/* 🔥 Streak */}
      <View style={styles.pillWrapper}>
        <BlurView intensity={50} tint="dark" style={styles.pill}>
          <View style={[styles.pillIconBg, { backgroundColor: streakActive ? hexToRgba('#FF6B35', 0.2) : hexToRgba(brandPrimary, 0.1) }]}>
            <Ionicons
              name="flame"
              size={16}
              color={streakActive ? '#FF6B35' : '#808080'}
            />
          </View>
          <View style={styles.pillTextCol}>
            <Text style={[styles.pillValue, getNumberStyle(18), streakActive && { color: '#FF6B35' }]}>
              {streak}
            </Text>
            <Text style={styles.pillLabel}>Streak</Text>
          </View>
        </BlurView>
      </View>

      {/* 💧 Today's drops */}
      <View style={styles.pillWrapper}>
        <BlurView intensity={50} tint="dark" style={styles.pill}>
          <View style={[styles.pillIconBg, { backgroundColor: hexToRgba(brandPrimary, 0.15) }]}>
            <Ionicons name="water" size={16} color={brandPrimary} />
          </View>
          <View style={styles.pillTextCol}>
            <Text style={[styles.pillValue, getNumberStyle(18), { color: brandPrimary }]}>
              {todayDrops}
            </Text>
            <Text style={styles.pillLabel}>Today</Text>
          </View>
        </BlurView>
      </View>

      {/* ⏱ Last workout */}
      <View style={styles.pillWrapper}>
        <BlurView intensity={50} tint="dark" style={styles.pill}>
          <View style={[styles.pillIconBg, { backgroundColor: hexToRgba(brandPrimary, 0.1) }]}>
            <Ionicons name="time-outline" size={16} color="#B0B0B0" />
          </View>
          <View style={styles.pillTextCol}>
            <Text style={[styles.pillValue, getNumberStyle(16)]}>
              {lastLabel}
            </Text>
            <Text style={styles.pillLabel} numberOfLines={1}>
              {lastSublabel}
            </Text>
          </View>
        </BlurView>
      </View>
    </View>
  );
};

/* ── Styles ───────────────────────────────────────── */
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  pillWrapper: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  pillIconBg: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillTextCol: {
    flex: 1,
    minWidth: 0,
  },
  pillValue: {
    color: '#FFFFFF',
    lineHeight: 20,
  },
  pillLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 10,
    color: '#808080',
    letterSpacing: 0.3,
    marginTop: 1,
  },
});
