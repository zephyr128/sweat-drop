import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, getNumberStyle } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface WorkoutSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  sessionStats: {
    duration: number;
    drops: number;
    calories: number;
    exercisesCompleted?: number;
    planName?: string;
  };
}

export default function WorkoutSummaryModal({
  visible,
  onClose,
  sessionStats,
}: WorkoutSummaryModalProps) {
  const { branding } = useTheme();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatHours = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={80} style={StyleSheet.absoluteFill}>
        <View style={styles.container}>
          <LinearGradient
            colors={[branding.primaryLight, theme.colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modal}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.header}>
                <Ionicons name="trophy" size={48} color={branding.primary} />
                <Text style={[styles.title, { color: branding.primary }]}>
                  {sessionStats.planName ? 'Plan Completed!' : 'Workout Complete!'}
                </Text>
                {sessionStats.planName && (
                  <Text style={styles.subtitle}>{sessionStats.planName}</Text>
                )}
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="water" size={32} color={branding.primary} />
                  <Text style={[styles.statValue, getNumberStyle(32), { color: branding.primary }]}>
                    +{sessionStats.drops.toLocaleString()}
                  </Text>
                  <Text style={styles.statLabel}>Drops</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="time-outline" size={32} color={theme.colors.textSecondary} />
                  <Text style={[styles.statValue, getNumberStyle(24)]}>
                    {formatTime(sessionStats.duration)}
                  </Text>
                  <Text style={styles.statLabel}>Duration</Text>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="flame" size={32} color={theme.colors.error} />
                  <Text style={[styles.statValue, getNumberStyle(24)]}>
                    {sessionStats.calories}
                  </Text>
                  <Text style={styles.statLabel}>Calories</Text>
                </View>

                {sessionStats.exercisesCompleted !== undefined && (
                  <View style={styles.statCard}>
                    <Ionicons name="fitness-outline" size={32} color={branding.primary} />
                    <Text style={[styles.statValue, getNumberStyle(24), { color: branding.primary }]}>
                      {sessionStats.exercisesCompleted}
                    </Text>
                    <Text style={styles.statLabel}>Exercises</Text>
                  </View>
                )}
              </View>

              {/* Close Button */}
              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: branding.primary }]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={[styles.closeButtonText, { color: branding.onPrimary }]}>
                  Done
                </Text>
                <Ionicons name="checkmark" size={20} color={branding.onPrimary} />
              </TouchableOpacity>
            </ScrollView>
          </LinearGradient>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modal: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    ...theme.shadows.xl,
  },
  scrollContent: {
    gap: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    justifyContent: 'space-around',
  },
  statCard: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    minWidth: 100,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.sm,
  },
  statValue: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: '700',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing.md,
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: '700',
  },
});
