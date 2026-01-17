import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Clipboard } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useGymStore } from '@/lib/stores/useGymStore';
import { Ionicons } from '@expo/vector-icons';
import { useBranding } from '@/lib/contexts/ThemeContext';

export default function RedemptionsScreen() {
  const { session } = useSession();
  const { getActiveGymId } = useGymStore();
  const branding = useBranding();
  const activeGymId = getActiveGymId();
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadRedemptions();
    }
  }, [session, activeGymId]);

  const loadRedemptions = async () => {
    if (!session?.user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('redemptions')
        .select(`
          *,
          rewards:reward_id (id, name, reward_type, price_drops, image_url),
          gyms:gym_id (id, name)
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading redemptions:', error);
      } else {
        setRedemptions(data || []);
      }
    } catch (error) {
      console.error('Error in loadRedemptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRewardEmoji = (type: string) => {
    switch (type) {
      case 'coffee': return '☕';
      case 'protein': return '🥤';
      case 'discount': return '🎫';
      case 'merch': return '👕';
      default: return '🎁';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return theme.colors.warning || '#FF9100';
      case 'confirmed': return branding.primary;
      case 'cancelled': return theme.colors.textSecondary;
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'time-outline';
      case 'confirmed': return 'checkmark-circle';
      case 'cancelled': return 'close-circle';
      default: return 'help-circle-outline';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle}>My Redemptions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {redemptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No redemptions yet</Text>
            <Text style={styles.emptySubtext}>Redeem rewards from the store to see them here</Text>
          </View>
        ) : (
          redemptions.map((redemption) => {
            const statusColor = getStatusColor(redemption.status);
            const statusIcon = getStatusIcon(redemption.status);

            return (
              <View key={redemption.id} style={styles.redemptionCard}>
                <View style={styles.redemptionHeader}>
                  <View style={styles.redemptionIconContainer}>
                    <Text style={styles.redemptionEmoji}>
                      {getRewardEmoji(redemption.rewards?.reward_type || '')}
                    </Text>
                  </View>
                  <View style={styles.redemptionInfo}>
                    <Text style={styles.redemptionName} numberOfLines={1}>
                      {redemption.rewards?.name || 'Unknown Reward'}
                    </Text>
                    <Text style={styles.redemptionGym} numberOfLines={1}>
                      {redemption.gyms?.name || 'Unknown Gym'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: statusColor + '40', backgroundColor: statusColor + '15' }]}>
                    <Ionicons name={statusIcon as any} size={16} color={statusColor} />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {redemption.status.charAt(0).toUpperCase() + redemption.status.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.redemptionDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Redemption Code</Text>
                    <TouchableOpacity
                      style={styles.codeContainer}
                      onPress={() => {
                        if (redemption.redemption_code) {
                          Clipboard.setString(redemption.redemption_code);
                          Alert.alert('Copied!', 'Redemption code copied to clipboard');
                        }
                      }}
                      disabled={!redemption.redemption_code}
                    >
                      <Text style={[styles.redemptionCode, { color: branding.primary }]}>{redemption.redemption_code || 'N/A'}</Text>
                      {redemption.status === 'pending' && redemption.redemption_code && (
                        <Ionicons name="copy-outline" size={16} color={branding.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Drops Spent</Text>
                    <View style={styles.dropsContainer}>
                      <Ionicons name="water" size={16} color="#00E5FF" />
                      <Text style={[styles.dropsAmount, getNumberStyle(16), { color: '#00E5FF' }]}>
                        {redemption.drops_spent}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {new Date(redemption.created_at).toLocaleDateString()} {new Date(redemption.created_at).toLocaleTimeString()}
                    </Text>
                  </View>
                  {redemption.status === 'confirmed' && redemption.confirmed_at && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Confirmed</Text>
                      <Text style={styles.detailValue}>
                        {new Date(redemption.confirmed_at).toLocaleDateString()} {new Date(redemption.confirmed_at).toLocaleTimeString()}
                      </Text>
                    </View>
                  )}
                </View>

                {redemption.status === 'pending' && (
                  <View style={styles.pendingNote}>
                    <Ionicons name="information-circle-outline" size={16} color={theme.colors.warning || '#FF9100'} />
                    <Text style={styles.pendingNoteText}>
                      Show your redemption code to gym staff to claim your reward
                    </Text>
                  </View>
                )}
              </View>
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    letterSpacing: 0.5,
    pointerEvents: 'none', // Don't block touch events
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  redemptionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  redemptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  redemptionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  redemptionEmoji: {
    fontSize: 32,
  },
  redemptionInfo: {
    flex: 1,
    minWidth: 0,
  },
  redemptionName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
    marginBottom: theme.spacing.xs,
  },
  redemptionGym: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  statusText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  redemptionDetails: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  detailValue: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.3,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  redemptionCode: {
    fontSize: theme.typography.fontSize.base,
    fontFamily: 'Courier',
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 1,
  },
  dropsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dropsAmount: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  pendingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(255, 145, 0, 0.1)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 145, 0, 0.3)',
  },
  pendingNoteText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.warning || '#FF9100',
    letterSpacing: 0.3,
    lineHeight: 18,
  },
});
