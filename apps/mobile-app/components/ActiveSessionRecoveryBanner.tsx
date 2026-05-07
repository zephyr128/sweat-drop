/**
 * Premium recovery banner shown on /home when an unfinished workout is
 * detected (Bug 4b). Three actions:
 *   - Resume        → re-open /workout with the existing session id so
 *                     loadSession() rehydrates duration/calories.
 *   - Finish & save → call recoverStaleActiveSession() then route to
 *                     /session-summary so the user sees credited drops.
 *   - Close         → confirm modal, finalize via the same helper, dismiss
 *                     the banner. (Drops still credited via award_drops —
 *                     the label communicates the user's intent to dismiss
 *                     the banner, NOT to forfeit drops.)
 *
 * Also surfaces the one-shot "Workout finalized — N drops credited" notice
 * written by the background auto-finalize timer (Bug 4c).
 *
 * AGENT NOTE: [2026-05-07] - mobile-coder
 * The banner re-uses `recoverStaleActiveSession` so the close/finish path
 * is identical to the scanner's "Close and retry" recovery.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { useActiveSessionRecovery } from '@/lib/stores/useActiveSessionRecovery';
import { useAppModal } from '@/lib/stores/useAppModal';
import { useAuthStore } from '@/lib/stores/authStore';
import { useBranding } from '@/lib/hooks/useBranding';
import { recoverStaleActiveSession } from '@/lib/qr/recoverStaleActiveSession';
import { theme, fontStyles } from '@/lib/theme';
import { log } from '@/lib/logger';

export function ActiveSessionRecoveryBanner() {
  const { t } = useTranslation('workout');
  const branding = useBranding();
  const router = useThrottledRouter();
  const showModal = useAppModal((s) => s.showModal);

  const pendingSession = useActiveSessionRecovery((s) => s.pendingSession);
  const isRecovering = useActiveSessionRecovery((s) => s.isRecovering);
  const setRecovering = useActiveSessionRecovery((s) => s.setRecovering);
  const clearPendingSession = useActiveSessionRecovery((s) => s.clearPendingSession);

  const autoFinalizedNotice = useActiveSessionRecovery((s) => s.autoFinalizedNotice);
  const clearAutoFinalizedNotice = useActiveSessionRecovery(
    (s) => s.clearAutoFinalizedNotice,
  );

  const userId = useAuthStore((s) => s.session?.user?.id ?? null);

  const minutesAgo = useMemo(() => {
    if (!pendingSession) return 0;
    const startedMs = new Date(pendingSession.startedAt).getTime();
    const ageMs = Math.max(0, Date.now() - startedMs);
    return Math.max(1, Math.floor(ageMs / 60000));
  }, [pendingSession]);

  const machineTypeLabel = useMemo(() => {
    if (!pendingSession) return '';
    return t(`recovery.machineType.${pendingSession.machineType}`);
  }, [pendingSession, t]);

  const handleResume = useCallback(() => {
    if (!pendingSession) return;
    log.debug('[Recovery] User chose Resume', { sessionId: pendingSession.sessionId });
    const params: Record<string, string> = {
      sessionId: pendingSession.sessionId,
    };
    if (pendingSession.machineId) params.machineId = pendingSession.machineId;
    if (pendingSession.gymId) params.gymId = pendingSession.gymId;
    if (pendingSession.machineType !== 'generic') {
      params.machineType = pendingSession.machineType;
    }
    if (pendingSession.sensorId) params.sensorId = pendingSession.sensorId;
    if (pendingSession.bleProtocol) params.bleProtocol = pendingSession.bleProtocol;
    clearPendingSession();
    router.push({ pathname: '/workout', params });
  }, [pendingSession, router, clearPendingSession]);

  const performRecover = useCallback(
    async (
      onSuccess: (result: Awaited<ReturnType<typeof recoverStaleActiveSession>>) => void,
    ) => {
      if (!pendingSession || !userId) {
        clearPendingSession();
        return;
      }
      setRecovering(true);
      try {
        const result = await recoverStaleActiveSession(userId);
        if (!result.closed && result.reason !== 'no_active_session') {
          // RPC + fallback both failed — surface the error and keep the
          // banner up so the user can retry.
          showModal({
            title: t('scanner:recoveryFailed'),
            body: t('scanner:recoveryFailedDesc'),
            buttons: [{ label: t('common:ok') }],
          });
          return;
        }
        onSuccess(result);
      } catch (err) {
        log.error('[Recovery] performRecover threw:', err);
        showModal({
          title: t('scanner:recoveryFailed'),
          body: t('scanner:recoveryFailedDesc'),
          buttons: [{ label: t('common:ok') }],
        });
      } finally {
        setRecovering(false);
      }
    },
    [pendingSession, userId, setRecovering, clearPendingSession, showModal, t],
  );

  const handleFinishAndSave = useCallback(() => {
    if (!pendingSession) return;
    void performRecover((result) => {
      const sessionId = result.sessionId ?? pendingSession.sessionId;
      const drops = result.dropsRecovered ?? 0;
      clearPendingSession();
      router.push({
        pathname: '/session-summary',
        params: {
          sessionId,
          drops: String(drops),
          duration: String(pendingSession.durationSeconds || 0),
          gymId: pendingSession.gymId ?? '',
          recovered: '1',
        },
      });
    });
  }, [pendingSession, performRecover, clearPendingSession, router]);

  const handleDismiss = useCallback(() => {
    if (!pendingSession) return;
    showModal({
      title: t('recovery.confirmDiscard.title'),
      body: t('recovery.confirmDiscard.body'),
      buttons: [
        { label: t('common:cancel'), style: 'cancel' },
        {
          label: t('recovery.confirmDiscard.confirm'),
          style: 'destructive',
          onPress: () => {
            void performRecover(() => {
              clearPendingSession();
            });
          },
        },
      ],
    });
  }, [pendingSession, showModal, performRecover, clearPendingSession, t]);

  const handleAcknowledgeAutoFinalize = useCallback(() => {
    clearAutoFinalizedNotice();
  }, [clearAutoFinalizedNotice]);

  // ── Auto-finalize notice (Bug 4c) — takes priority over the recovery
  // banner because the session is already closed.
  if (autoFinalizedNotice) {
    return (
      <Animated.View
        entering={FadeInDown.duration(280)}
        exiting={FadeOutUp.duration(200)}
        style={styles.wrapper}
      >
        <PlatformBlur
          intensity={60}
          tint="dark"
          androidColor="rgba(12,15,24,0.98)"
          style={styles.card}
        >
          <View style={styles.borderOverlay} pointerEvents="none" />
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(34,197,94,0.16)' }]}>
            <Ionicons name="checkmark-circle-outline" size={22} color="#22C55E" />
          </View>
          <View style={styles.contentColumn}>
            <Text style={styles.title} numberOfLines={1}>
              {t('autoFinalizedTitle')}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {t('autoFinalizedBody', { drops: autoFinalizedNotice.drops })}
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={handleAcknowledgeAutoFinalize}
                style={[styles.btnPrimary, { backgroundColor: branding.primary }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.btnPrimaryText, { color: branding.onPrimary }]}>
                  {t('common:ok')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </PlatformBlur>
      </Animated.View>
    );
  }

  if (!pendingSession) return null;

  const gymName =
    pendingSession.gymName ||
    (pendingSession.gymId ? '' : '');

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      exiting={FadeOutUp.duration(200)}
      style={styles.wrapper}
    >
      <PlatformBlur
        intensity={60}
        tint="dark"
        androidColor="rgba(12,15,24,0.98)"
        style={styles.card}
      >
        <View style={styles.borderOverlay} pointerEvents="none" />
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(245,158,11,0.16)' }]}>
          <Ionicons name="time-outline" size={22} color="#F59E0B" />
        </View>
        <View style={styles.contentColumn}>
          <Text style={styles.title} numberOfLines={1}>
            {t('recovery.banner.title')}
          </Text>
          <Text style={styles.body} numberOfLines={3}>
            {gymName
              ? machineTypeLabel
                ? t('recovery.banner.body', {
                    machineType: machineTypeLabel,
                    gymName,
                    minutesAgo,
                  })
                : t('recovery.banner.bodyNoMachine', { gymName, minutesAgo })
              : t('recovery.banner.bodyNoMachine', {
                  gymName: '',
                  minutesAgo,
                })}
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={handleResume}
              disabled={isRecovering}
              style={[
                styles.btnPrimary,
                {
                  backgroundColor: branding.primary,
                  opacity: isRecovering ? 0.6 : 1,
                },
              ]}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnPrimaryText, { color: branding.onPrimary }]}>
                {t('recovery.banner.resume')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleFinishAndSave}
              disabled={isRecovering}
              style={[styles.btnSecondary, { opacity: isRecovering ? 0.6 : 1 }]}
              activeOpacity={0.85}
            >
              {isRecovering ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Text style={styles.btnSecondaryText}>
                  {t('recovery.banner.finish')}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDismiss}
              disabled={isRecovering}
              style={[styles.btnGhost, { opacity: isRecovering ? 0.6 : 1 }]}
              activeOpacity={0.85}
            >
              <Text style={styles.btnGhostText}>
                {t('recovery.banner.dismiss')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </PlatformBlur>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,16,26,0.78)',
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  contentColumn: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  body: {
    ...fontStyles.body,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnPrimaryText: {
    ...fontStyles.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  btnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnSecondaryText: {
    ...fontStyles.bodyMedium,
    fontSize: 12,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  btnGhost: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  btnGhostText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
});
