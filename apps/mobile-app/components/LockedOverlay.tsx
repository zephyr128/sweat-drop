import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { theme as baseTheme } from '@/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

interface LockedOverlayProps {
  message?: string;
  onSetAsHomeGym?: () => void;
  compact?: boolean; // For smaller cards like Rewards Store and Leaderboards
}

export const LockedOverlay: React.FC<LockedOverlayProps> = ({
  message,
  onSetAsHomeGym,
  compact = false,
}) => {
  const { theme } = useTheme();
  
  // Use shorter message for compact mode
  const defaultMessage = compact 
    ? 'Preview Mode. Scan QR code to unlock.'
    : 'You are in Preview Mode. Scan a QR code in this gym to unlock its rewards.';
  
  const displayMessage = message || defaultMessage;

  return (
    <View style={styles.overlayContainer}>
      {/* Semi-transparent background to allow gym colors to show through */}
      <View style={styles.overlayBackground} />
      
      <BlurView 
        intensity={30} 
        style={styles.blurView}
        tint="dark"
      >
        <View style={[styles.lockedContent, compact && styles.lockedContentCompact]}>
          {/* Centered Lock Icon and Title */}
          <View style={styles.centeredContent}>
            <View style={[
              styles.lockIconContainer, 
              { borderColor: theme.colors.primary + '40' },
              compact && styles.lockIconContainerCompact
            ]}>
              <Ionicons 
                name="lock-closed" 
                size={compact ? 24 : 32} 
                color={theme.colors.primary} 
              />
            </View>
            
            <Text style={[styles.lockedTitle, compact && styles.lockedTitleCompact]}>
              Preview Mode
            </Text>
            
            <Text 
              style={[styles.lockedMessage, compact && styles.lockedMessageCompact]}
              numberOfLines={compact ? 2 : 3}
              ellipsizeMode="tail"
            >
              {displayMessage}
            </Text>
          </View>

          {/* Button at the bottom */}
          {onSetAsHomeGym && (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.setHomeButton, compact && styles.setHomeButtonCompact]}
                onPress={onSetAsHomeGym}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.primaryDark]}
                  style={styles.setHomeButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="home" size={compact ? 14 : 16} color={baseTheme.colors.background} />
                  <Text style={[styles.setHomeButtonText, compact && styles.setHomeButtonTextCompact]}>
                    Set as Home Gym
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    borderRadius: baseTheme.borderRadius.xl,
    overflow: 'hidden',
    width: '100%',
    height: '100%',
  },
  overlayContainerCompact: {
    borderRadius: baseTheme.borderRadius.lg,
  },
  overlayBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Semi-transparent to allow colors through
  },
  blurView: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: baseTheme.borderRadius.xl,
  },
  lockedContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: baseTheme.spacing.lg,
    width: '100%',
    height: '100%',
  },
  lockedContentCompact: {
    padding: baseTheme.spacing.md,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: baseTheme.spacing.md,
    width: '100%',
  },
  lockIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: baseTheme.glass.background,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIconContainerCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  lockedTitle: {
    fontSize: baseTheme.typography.fontSize.xl,
    fontWeight: baseTheme.typography.fontWeight.bold,
    color: baseTheme.colors.text,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  lockedTitleCompact: {
    fontSize: baseTheme.typography.fontSize.base,
  },
  lockedMessage: {
    fontSize: baseTheme.typography.fontSize.sm,
    color: baseTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: baseTheme.typography.lineHeight.relaxed * baseTheme.typography.fontSize.sm,
    letterSpacing: 0.3,
    paddingHorizontal: baseTheme.spacing.md,
    maxWidth: '100%',
  },
  lockedMessageCompact: {
    fontSize: baseTheme.typography.fontSize.xs,
    lineHeight: baseTheme.typography.lineHeight.normal * baseTheme.typography.fontSize.xs,
    paddingHorizontal: baseTheme.spacing.sm,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: baseTheme.spacing.md,
  },
  setHomeButton: {
    borderRadius: baseTheme.borderRadius.full,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 200,
  },
  setHomeButtonCompact: {
    maxWidth: 180,
  },
  setHomeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: baseTheme.spacing.sm,
    paddingHorizontal: baseTheme.spacing.lg,
    paddingVertical: baseTheme.spacing.md,
  },
  setHomeButtonText: {
    fontSize: baseTheme.typography.fontSize.sm,
    fontWeight: baseTheme.typography.fontWeight.bold,
    color: baseTheme.colors.background,
    letterSpacing: 0.5,
  },
  setHomeButtonTextCompact: {
    fontSize: baseTheme.typography.fontSize.xs,
  },
});
