import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Clipboard } from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useGymStore } from '@/lib/stores/useGymStore';
import { Ionicons } from '@expo/vector-icons';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

const STATUS_CONFIG: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap; bgAlpha: number }> = {
  pending: { color: '#fbbf24', icon: 'time-outline', bgAlpha: 0.1 },
  confirmed: { color: '#4ade80', icon: 'checkmark-circle', bgAlpha: 0.1 },
  cancelled: { color: '#f87171', icon: 'close-circle', bgAlpha: 0.08 },
};

export default function RedemptionsScreen() {
  const { t } = useTranslation('redemptions');
  const showModal = useAppModal((s) => s.showModal);
  const insets = useSafeAreaInsets();
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
        log.error('Error loading redemptions:', error);
      } else {
        setRedemptions(data || []);
      }
    } catch (error) {
      log.error('Error in loadRedemptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRedemptionName = (redemption: any) => {
    if (redemption.source_type === 'leaderboard_prize') {
      return redemption.description || t('leaderboardPrize');
    }
    if (redemption.source_type === 'arena_prize') {
      return redemption.description || t('arenaPrize');
    }
    return redemption.rewards?.name || t('unknownReward');
  };

  const getRewardIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'coffee': return 'cafe-outline';
      case 'protein': return 'nutrition-outline';
      case 'discount': return 'pricetag-outline';
      case 'merch': return 'shirt-outline';
      default: return 'gift-outline';
    }
  };

  const getSourceIcon = (sourceType: string): string | null => {
    if (sourceType === 'leaderboard_prize') return '🏆';
    if (sourceType === 'arena_prize') return '⚔️';
    return null;
  };

  const copyCode = (code: string) => {
    Clipboard.setString(code);
    showModal({ title: t('copied'), body: t('codeCopied') });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {redemptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noRedemptions')}</Text>
            <Text style={styles.emptySubtext}>{t('noRedemptionsDesc')}</Text>
          </View>
        ) : (
          redemptions.map((redemption, index) => {
            const status = STATUS_CONFIG[redemption.status] || STATUS_CONFIG.cancelled;
            const rewardType = redemption.rewards?.reward_type || '';
            const imageUrl = redemption.rewards?.image_url;
            const sourceIcon = getSourceIcon(redemption.source_type);
            const isPending = redemption.status === 'pending';

            return (
              <Animated.View key={redemption.id} entering={FadeInDown.delay(80 + index * 60).duration(400)}>
                <View style={[styles.card, {
                  borderTopColor: hexToRgba(status.color, 0.30),
                  borderLeftColor: hexToRgba(status.color, 0.12),
                  borderRightColor: 'rgba(255,255,255,0.04)',
                  borderBottomColor: 'rgba(255,255,255,0.03)',
                }]}>
                  <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                    <LinearGradient
                      colors={[hexToRgba(status.color, 0.07), 'rgba(255,255,255,0.02)', 'transparent']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <View style={styles.cardRow}>
                      {/* Image / Icon */}
                      {imageUrl ? (
                        <Image
                          source={imageUrl}
                          style={[styles.itemImage, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <View style={[styles.itemIconBox, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                          {sourceIcon ? (
                            <Text style={styles.sourceEmoji}>{sourceIcon}</Text>
                          ) : (
                            <Ionicons name={getRewardIcon(rewardType)} size={24} color={branding.primary} />
                          )}
                        </View>
                      )}

                      {/* Info */}
                      <View style={styles.cardInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>{getRedemptionName(redemption)}</Text>
                        <Text style={styles.itemGym} numberOfLines={1}>
                          {redemption.gyms?.name || t('unknownGym')}
                        </Text>
                        <Text style={styles.itemDate}>
                          {new Date(redemption.created_at).toLocaleDateString(
                            i18n.language === 'sr' ? 'sr-RS' : 'en-US',
                            { day: 'numeric', month: 'short', year: 'numeric' }
                          )}
                        </Text>
                      </View>

                      {/* Status Badge */}
                      <View style={[styles.statusPill, { backgroundColor: status.color + '18' }]}>
                        <Ionicons name={status.icon} size={14} color={status.color} />
                        <Text style={[styles.statusLabel, { color: status.color }]}>
                          {t(redemption.status)}
                        </Text>
                      </View>
                    </View>

                    {/* Code + Details (only for pending) */}
                    {isPending && redemption.redemption_code && (
                      <View style={styles.codeSection}>
                        <View style={[styles.codeBanner, { backgroundColor: hexToRgba(status.color, 0.06), borderColor: hexToRgba(status.color, 0.15) }]}>
                          <View style={styles.codeLeft}>
                            <Text style={styles.codeLabel}>{t('code')}</Text>
                            <Text style={[styles.codeText, getNumberStyle(20), { color: branding.primary }]}>
                              {redemption.redemption_code}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[styles.copyBtn, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}
                            onPress={() => copyCode(redemption.redemption_code)}
                          >
                            <Ionicons name="copy-outline" size={16} color={branding.primary} />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.hintRow}>
                          <Ionicons name="information-circle-outline" size={14} color={status.color} />
                          <Text style={[styles.hintText, { color: status.color }]}>
                            {t('showCodeToStaff')}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Drops spent row */}
                    {redemption.drops_spent > 0 && (
                      <View style={styles.dropsRow}>
                        <Ionicons name="water" size={14} color={branding.primary} />
                        <Text style={[styles.dropsText, getNumberStyle(13), { color: branding.primary }]}>
                          {redemption.drops_spent} drops
                        </Text>
                      </View>
                    )}
                  </BlurView>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.heading,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  card: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  cardBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  itemIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceEmoji: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  itemGym: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  itemDate: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  codeSection: {
    marginTop: 12,
    gap: 8,
  },
  codeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  codeLeft: {
    gap: 2,
  },
  codeLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  codeText: {
    ...fontStyles.number,
    letterSpacing: 4,
  },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  hintText: {
    ...fontStyles.body,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  dropsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  dropsText: {
    ...fontStyles.number,
  },
});
