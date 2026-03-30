import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, fontStyles, getNumberStyle, hexToRgba} from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useUpcomingHappyHours, type HappyHourWindow } from '@/hooks/useUpcomingHappyHours';
import BackButton from '@/components/BackButton';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { log } from '@/lib/logger';

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

function formatDateLabel(iso: string, isToday: boolean, t: (k: string) => string): string {
  if (isToday) return t('happyHours:today');
  try {
    const d = new Date(iso);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return t('happyHours:tomorrow');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatStartsIn(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes <= 0) return t('happyHours:liveNow');
  if (minutes < 60) return t('happyHours:startsInMin', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('happyHours:startsInHour', { count: hours });
  const days = Math.floor(hours / 24);
  return t('happyHours:startsInDay', { count: days });
}

const GOLD = '#FFD700';
const GOLD_DIM = 'rgba(255, 215, 0, 0.55)';
const GLASS_BG = 'rgba(18, 18, 28, 0.80)';

const OFFSET_OPTIONS = [30, 10, 0] as const;

export default function HappyHoursScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('happyHours');
  const { getActiveGymId, activeGym } = useGymStore();
  const activeGymId = getActiveGymId();

  const { windows, liveWindow, loading } = useUpcomingHappyHours(activeGymId, 10);

  // Reminder preferences
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderOffset, setReminderOffset] = useState(30);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const loadPrefs = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('happy_hour_reminders_enabled, happy_hour_reminder_offset_min')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setRemindersEnabled(data.happy_hour_reminders_enabled ?? true);
        setReminderOffset(data.happy_hour_reminder_offset_min ?? 30);
      }
    } catch {
      // non-critical
    } finally {
      setPrefsLoaded(true);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const savePref = useCallback(async (enabled: boolean, offsetMin: number) => {
    try {
      const { error } = await supabase.rpc('set_happy_hour_reminder_pref', {
        p_enabled: enabled,
        p_offset_min: offsetMin,
      });
      if (error) log.warn('[HappyHours] save pref error:', error.message);
    } catch (err) {
      log.warn('[HappyHours] save pref error:', err);
    }
  }, []);

  const now = new Date();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
        style={styles.gradient}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Explanation card */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <View style={[styles.explainCard, { borderColor: hexToRgba('#FFD700', 0.18) }]}>
              <BlurView intensity={50} tint="dark" style={styles.explainBlur}>
                <View style={styles.explainIconWrap}>
                  <Ionicons name="flash" size={22} color={GOLD} />
                </View>
                <Text style={styles.explainTitle}>{t('whatIsTitle')}</Text>
                <Text style={styles.explainBody}>{t('whatIsBody')}</Text>
              </BlurView>
            </View>
          </Animated.View>

          {/* Live now hero */}
          {liveWindow && (
            <Animated.View entering={FadeInDown.delay(150).duration(400)}>
              <View style={[styles.liveCard, { borderColor: hexToRgba('#FFD700', 0.35) }]}>
                <BlurView intensity={50} tint="dark" style={styles.liveBlur}>
                  <View style={styles.liveHeader}>
                    <View style={styles.livePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.livePillText}>{t('liveNow')}</Text>
                    </View>
                    <Text style={[styles.liveMultiplier, getNumberStyle(28)]}>x{liveWindow.multiplier}</Text>
                  </View>
                  <Text style={styles.liveLabel}>{liveWindow.label}</Text>
                  <Text style={styles.liveTime}>
                    {formatTimeShort(liveWindow.startAt)} – {formatTimeShort(liveWindow.endAt)}
                  </Text>
                </BlurView>
              </View>
            </Animated.View>
          )}

          {/* Schedule list */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <Text style={styles.sectionTitle}>{t('scheduleTitle')}</Text>
            {loading && windows.length === 0 ? (
              <ActivityIndicator color={branding.primary} style={{ marginTop: 24 }} />
            ) : windows.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                <BlurView intensity={50} tint="dark" style={styles.emptyBlur}>
                  <Ionicons name="flash-off-outline" size={28} color="rgba(255, 215, 0, 0.3)" />
                  <Text style={styles.emptyText}>{t('noUpcoming')}</Text>
                </BlurView>
              </View>
            ) : (
              <View style={[styles.listCard, { borderColor: hexToRgba('#FFD700', 0.15) }]}>
                <BlurView intensity={50} tint="dark" style={styles.listBlur}>
                  {windows.map((w, i) => {
                    const isLive = new Date(w.startAt) <= now && new Date(w.endAt) > now;
                    return (
                      <View key={`${w.ruleId}-${w.startAt}`} style={[styles.listRow, i > 0 && styles.listRowSep]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.listLabel, isLive && { color: GOLD }]} numberOfLines={1}>
                            {w.label}
                          </Text>
                          <Text style={styles.listMeta}>
                            {formatDateLabel(w.startAt, w.isToday, t)} · {formatTimeShort(w.startAt)} – {formatTimeShort(w.endAt)}
                          </Text>
                        </View>
                        <View style={styles.listRight}>
                          <View style={[styles.listBadge, isLive && { backgroundColor: 'rgba(255, 215, 0, 0.20)' }]}>
                            <Text style={[styles.listBadgeText, getNumberStyle(13)]}>x{w.multiplier}</Text>
                          </View>
                          <Text style={[styles.listStartsIn, isLive && { color: '#4CAF50', fontWeight: '600' }]}>
                            {formatStartsIn(w.minutesUntilStart, t)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </BlurView>
              </View>
            )}
          </Animated.View>

          {/* Reminder settings */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <Text style={styles.sectionTitle}>{t('remindersTitle')}</Text>
            <View style={[styles.settingsCard, { borderColor: 'rgba(255,255,255,0.10)' }]}>
              <BlurView intensity={50} tint="dark" style={styles.settingsBlur}>
                {/* Toggle */}
                <View style={styles.settingsRow}>
                  <View style={[styles.settingsIcon, { backgroundColor: 'rgba(255, 215, 0, 0.10)' }]}>
                    <Ionicons name="notifications-outline" size={18} color="#FFD700" />
                  </View>
                  <Text style={styles.settingsLabel}>{t('remindersToggle')}</Text>
                  <Switch
                    value={remindersEnabled}
                    onValueChange={(val) => {
                      setRemindersEnabled(val);
                      savePref(val, reminderOffset);
                    }}
                    trackColor={{ false: 'rgba(255,255,255,0.08)', true: hexToRgba(branding.primary, 0.4) }}
                    thumbColor={remindersEnabled ? branding.primary : 'rgba(255,255,255,0.3)'}
                  />
                </View>

                {/* Offset selector */}
                {remindersEnabled && (
                  <>
                    <View style={styles.settingsDivider} />
                    <View style={styles.settingsRow}>
                      <View style={[styles.settingsIcon, { backgroundColor: 'rgba(255, 215, 0, 0.10)' }]}>
                        <Ionicons name="time-outline" size={18} color="#FFD700" />
                      </View>
                      <Text style={[styles.settingsLabel, { flex: 1 }]}>{t('remindWhen')}</Text>
                    </View>
                    <View style={styles.offsetRow}>
                      {OFFSET_OPTIONS.map((offset) => (
                        <TouchableOpacity
                          key={offset}
                          style={[
                            styles.offsetBtn,
                            reminderOffset === offset && [styles.offsetBtnActive, { borderColor: '#FFD700' }],
                          ]}
                          activeOpacity={0.7}
                          onPress={() => {
                            setReminderOffset(offset);
                            savePref(remindersEnabled, offset);
                          }}
                        >
                          <Text style={[styles.offsetBtnText, reminderOffset === offset && { color: '#FFD700' }]}>
                            {offset === 0 ? t('atStart') : t('minBefore', { count: offset })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </BlurView>
            </View>
          </Animated.View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Explanation
  explainCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  explainBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 18,
    alignItems: 'center',
    backgroundColor: GLASS_BG,
  },
  explainIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,215,0,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  explainTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: GOLD,
    textAlign: 'center',
    marginBottom: 6,
  },
  explainBody: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Live card
  liveCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  liveBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
    backgroundColor: GLASS_BG,
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  livePillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: '#4CAF50',
  },
  liveMultiplier: {
    color: GOLD,
  },
  liveLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: GOLD,
  },
  liveTime: {
    ...fontStyles.body,
    fontSize: 13,
    color: GOLD_DIM,
    marginTop: 2,
  },

  // Section title
  sectionTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textTertiary,
    marginBottom: 8,
    marginTop: 18,
  },

  // Empty
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  emptyBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 28,
    alignItems: 'center',
    gap: 8,
    backgroundColor: GLASS_BG,
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 14,
    color: GOLD_DIM,
    textAlign: 'center',
  },

  // Schedule list
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  listBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: GLASS_BG,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  listRowSep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 215, 0, 0.06)',
  },
  listLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  listMeta: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 12,
  },
  listBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.10)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  listBadgeText: {
    color: GOLD,
  },
  listStartsIn: {
    ...fontStyles.body,
    fontSize: 11,
    color: GOLD_DIM,
  },

  // Settings
  settingsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  settingsBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
    backgroundColor: GLASS_BG,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsLabel: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  settingsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 12,
  },
  offsetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingLeft: 42,
    paddingRight: 4,
  },
  offsetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  offsetBtnActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.10)',
  },
  offsetBtnText: {
    ...fontStyles.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
