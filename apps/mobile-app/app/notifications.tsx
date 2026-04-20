import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '@/components/ScreenHeader';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { theme as t, hexToRgba, fontStyles } from '@/lib/theme';
import { useNotifications, type AppNotification } from '@/hooks/useNotifications';
import { getDeepLinkFromNotification, getPushPermissionStatus, PUSH_NOTIFICATIONS_ENABLED } from '@/lib/notifications';

// ─── Icon mapping per notification type ──────────────────────────────
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_META: Record<string, { icon: IoniconsName; color: string }> = {
  session_ended:        { icon: 'fitness-outline',        color: '#00E5FF' },
  badge_earned:         { icon: 'ribbon-outline',         color: '#FFD700' },
  rank_overtaken:       { icon: 'trending-up-outline',    color: '#FF5252' },
  reward_claimed:       { icon: 'gift-outline',           color: '#00E5FF' },
  streak_reminder:      { icon: 'flame-outline',          color: '#FF9100' },
  streak_at_risk:       { icon: 'flame-outline',          color: '#FF5252' },
  weekly_results:       { icon: 'trophy-outline',         color: '#FFD700' },
  reengagement_7d:      { icon: 'heart-outline',          color: '#FF69B4' },
  reengagement_14d:     { icon: 'heart-outline',          color: '#FF69B4' },
  drops_expiry_30d:     { icon: 'time-outline',           color: '#FF9100' },
  drops_expiry_7d:      { icon: 'time-outline',           color: '#FF5252' },
  arena_prize:          { icon: 'medal-outline',          color: '#FFD700' },
  arena_ended:          { icon: 'flag-outline',           color: '#B0B0B0' },
  leaderboard_prize:    { icon: 'podium-outline',         color: '#FFD700' },
  reminder:             { icon: 'notifications-outline',  color: '#00E5FF' },
  comeback_offer:       { icon: 'star-outline',            color: '#FF9100' },
  happy_hour:           { icon: 'flash-outline',          color: '#FFD700' },
  happy_hour_reminder:  { icon: 'flash-outline',          color: '#FFD700' },
  campaign:             { icon: 'megaphone-outline',      color: '#00E5FF' },
};

const DEFAULT_META = { icon: 'notifications-outline' as IoniconsName, color: '#808080' };

function getMeta(type: string) {
  return TYPE_META[type] ?? DEFAULT_META;
}

// ─── Time helpers ────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getSectionKey(date: Date, now: Date): string {
  if (isSameDay(date, now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'yesterday';
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date >= weekAgo) return 'thisWeek';
  return 'earlier';
}

function relativeTime(iso: string, t_fn: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t_fn('justNow');
  if (mins < 60) return t_fn('minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t_fn('hoursAgo', { count: hours });
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Section builder ─────────────────────────────────────────────────

interface Section {
  key: string;
  title: string;
  data: AppNotification[];
}

function buildSections(
  items: AppNotification[],
  t_fn: (key: string) => string,
): Section[] {
  const now = new Date();
  const map = new Map<string, AppNotification[]>();

  for (const item of items) {
    const key = getSectionKey(new Date(item.created_at), now);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }

  const order = ['today', 'yesterday', 'thisWeek', 'earlier'];
  const sections: Section[] = [];
  for (const key of order) {
    const data = map.get(key);
    if (data && data.length > 0) {
      sections.push({ key, title: t_fn(key), data });
    }
  }
  return sections;
}

// ─── Component ───────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { t: tNotif } = useTranslation('notifications');
  const { branding } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useThrottledRouter();

  const {
    items,
    unreadCount,
    loading,
    error,
    refreshing,
    loadMore,
    onRefresh,
    markRead,
    markAllRead,
  } = useNotifications();

  // Permission banner state
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>('granted');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const checkPermission = useCallback(async () => {
    if (!PUSH_NOTIFICATIONS_ENABLED) return;
    const status = await getPushPermissionStatus();
    setPermissionStatus(status);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission]),
  );

  const showPermissionBanner =
    PUSH_NOTIFICATIONS_ENABLED &&
    !bannerDismissed &&
    (permissionStatus === 'denied' || permissionStatus === 'undetermined');

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Linking.openURL('app-settings:');
    } else {
      void Linking.openSettings();
    }
  }, []);

  const sections = useMemo(() => buildSections(items, tNotif), [items, tNotif]);

  const handlePress = useCallback(
    (item: AppNotification) => {
      if (!item.read_at) {
        void markRead([item.id]);
      }
      const deepLink = getDeepLinkFromNotification(
        item.data as Parameters<typeof getDeepLinkFromNotification>[0],
      );
      if (deepLink) {
        router.push(deepLink as any);
      }
    },
    [markRead, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => {
      const meta = getMeta(item.type);
      const isUnread = !item.read_at;

      return (
        <TouchableOpacity
          style={[styles.card, isUnread && styles.cardUnread]}
          activeOpacity={0.7}
          onPress={() => handlePress(item)}
        >
          {/* Unread indicator */}
          {isUnread && (
            <View style={[styles.unreadDot, { backgroundColor: branding.primary }]} />
          )}

          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: hexToRgba(meta.color, 0.12) }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardBody} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.cardTime}>
              {relativeTime(item.created_at, tNotif)}
            </Text>
          </View>

          {/* Chevron */}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={t.colors.textTertiary}
            style={styles.chevron}
          />
        </TouchableOpacity>
      );
    },
    [handlePress, branding.primary, tNotif],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    [],
  );

  const ListEmpty = useMemo(() => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: hexToRgba('#FF5252', 0.08) }]}>
            <Ionicons name="alert-circle-outline" size={48} color={hexToRgba('#FF5252', 0.5)} />
          </View>
          <Text style={styles.emptyTitle}>{tNotif('errorTitle')}</Text>
          <Text style={styles.emptyHint}>{tNotif('errorHint')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh} activeOpacity={0.7}>
            <Text style={[styles.retryButtonText, { color: branding.primary }]}>{tNotif('retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIcon, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
          <Ionicons name="notifications-off-outline" size={48} color={hexToRgba(branding.primary, 0.4)} />
        </View>
        <Text style={styles.emptyTitle}>{tNotif('empty')}</Text>
        <Text style={styles.emptyHint}>{tNotif('emptyHint')}</Text>
      </View>
    );
  }, [loading, error, branding.primary, tNotif, onRefresh]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader
        title={tNotif('title')}
        right={
          unreadCount > 0 ? (
            <TouchableOpacity
              onPress={markAllRead}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="checkmark-done-outline" size={22} color={branding.primary} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Permission denied / undetermined banner */}
      {showPermissionBanner && (
        <View style={styles.permissionBanner}>
          <Ionicons name="notifications-off-outline" size={18} color="#FF9100" style={styles.bannerIcon} />
          <Text style={styles.bannerText}>{tNotif('permissionBannerText')}</Text>
          <TouchableOpacity onPress={openSettings} activeOpacity={0.7} style={styles.bannerCta}>
            <Text style={[styles.bannerCtaText, { color: branding.primary }]}>{tNotif('permissionBannerCta')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setBannerDismissed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-outline" size={18} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </View>
      )}

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 32 },
            items.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={branding.primary}
            />
          }
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Section headers
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 13,
    letterSpacing: 2,
    color: t.colors.textTertiary,
  },

  // Notification card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  cardUnread: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: t.colors.textSecondary,
    marginBottom: 2,
  },
  cardTitleUnread: {
    ...fontStyles.bodySemiBold,
    color: t.colors.text,
  },
  cardBody: {
    ...fontStyles.body,
    fontSize: 13,
    color: t.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  cardTime: {
    ...fontStyles.body,
    fontSize: 11,
    color: t.colors.textTertiary,
  },
  chevron: {
    marginLeft: 4,
  },

  // Empty / error state
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 18,
    color: t.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyHint: {
    ...fontStyles.body,
    fontSize: 14,
    color: t.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  retryButtonText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
  },

  // Permission banner
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,145,0,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,145,0,0.2)',
    gap: 8,
  },
  bannerIcon: {
    flexShrink: 0,
  },
  bannerText: {
    ...fontStyles.body,
    fontSize: 12,
    color: t.colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },
  bannerCta: {
    flexShrink: 0,
  },
  bannerCtaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
});
