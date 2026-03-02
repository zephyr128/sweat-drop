import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useBranding } from '@/lib/hooks/useBranding';
import { theme, getNumberStyle } from '@/lib/theme';

interface LeaderboardEntry {
  user_id: string;
  username: string;
  drops: number;
}

interface LeaderboardPreviewProps {
  gymId: string | null;
  isUnlocked: boolean;
}

// Helper function to add alpha to hex color
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const RANK_ICONS = ['🥇', '🥈', '🥉'];

export const LeaderboardPreview: React.FC<LeaderboardPreviewProps> = ({ gymId, isUnlocked }) => {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const [topUsers, setTopUsers] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    if (!session?.user || !gymId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('gym_memberships')
        .select('user_id, local_drops_balance, profiles:user_id(username)')
        .eq('gym_id', gymId)
        .order('local_drops_balance', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[LeaderboardPreview] Error:', error);
        setLoading(false);
        return;
      }

      if (data) {
        const entries: LeaderboardEntry[] = data
          .map((entry: any) => ({
            user_id: entry.user_id,
            username: entry.profiles?.username || 'Unknown',
            drops: entry.local_drops_balance || 0,
          }))
          .sort((a, b) => b.drops - a.drops);

        setTopUsers(entries.slice(0, 3));

        // Find current user rank
        const userIndex = entries.findIndex((e) => e.user_id === session.user.id);
        if (userIndex !== -1) {
          setCurrentUserRank(userIndex + 1);
          if (userIndex >= 3) {
            setCurrentUserEntry(entries[userIndex]);
          }
        }
      }
    } catch (err) {
      console.error('[LeaderboardPreview] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  if (loading || topUsers.length === 0) return null;

  const isCurrentUser = (userId: string) => userId === session?.user?.id;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        <TouchableOpacity
          onPress={() => {
            if (!isUnlocked) return;
            router.push('/leaderboard');
          }}
          activeOpacity={0.7}
          disabled={!isUnlocked}
        >
          <Text style={[styles.viewAllLink, { color: branding.primary }]}>View All</Text>
        </TouchableOpacity>
      </View>

      {/* Leaderboard Card */}
      <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
        <BlurView intensity={50} tint="dark" style={styles.blurContainer}>
          {topUsers.map((entry, index) => {
            const isMe = isCurrentUser(entry.user_id);
            return (
              <View
                key={entry.user_id}
                style={[
                  styles.row,
                  isMe && { backgroundColor: hexToRgba(branding.primary, 0.12) },
                  index < topUsers.length - 1 && styles.rowBorder,
                ]}
              >
                {/* Rank */}
                <Text style={styles.rankEmoji}>{RANK_ICONS[index]}</Text>

                {/* Username */}
                <View style={styles.userInfo}>
                  <Text
                    style={[
                      styles.username,
                      isMe && { color: branding.primary, fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {entry.username}
                    {isMe && ' (You)'}
                  </Text>
                </View>

                {/* Drops */}
                <View style={styles.dropsContainer}>
                  <Ionicons name="water" size={14} color={branding.primary} />
                  <Text style={[styles.dropsText, getNumberStyle(14), { color: branding.primary }]}>
                    {entry.drops.toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Current user row if not in top 3 */}
          {currentUserRank && currentUserRank > 3 && currentUserEntry && (
            <>
              <View style={styles.separatorDots}>
                <Text style={styles.dotsText}>• • •</Text>
              </View>
              <View
                style={[
                  styles.row,
                  { backgroundColor: hexToRgba(branding.primary, 0.12) },
                ]}
              >
                <Text style={[styles.rankNumber, { color: branding.primary }]}>
                  #{currentUserRank}
                </Text>
                <View style={styles.userInfo}>
                  <Text style={[styles.username, { color: branding.primary, fontWeight: '700' }]} numberOfLines={1}>
                    {currentUserEntry.username} (You)
                  </Text>
                </View>
                <View style={styles.dropsContainer}>
                  <Ionicons name="water" size={14} color={branding.primary} />
                  <Text style={[styles.dropsText, getNumberStyle(14), { color: branding.primary }]}>
                    {currentUserEntry.drops.toLocaleString()}
                  </Text>
                </View>
              </View>
            </>
          )}
        </BlurView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  viewAllLink: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  blurContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  rankEmoji: {
    fontSize: 20,
    width: 32,
    textAlign: 'center',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
    width: 32,
    textAlign: 'center',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  dropsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dropsText: {
    letterSpacing: 0.3,
  },
  separatorDots: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  dotsText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: 4,
  },
});
