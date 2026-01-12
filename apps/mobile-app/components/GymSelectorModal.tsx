import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { theme as baseTheme } from '@/lib/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface GymSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectGym: (gym: Gym) => void;
}

export const GymSelectorModal: React.FC<GymSelectorModalProps> = ({
  visible,
  onClose,
  onSelectGym,
}) => {
  const { theme } = useTheme();
  const { gyms, setGyms, homeGymId, setLoading, isLoading } = useGymStore();
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Always reload gyms when modal opens to ensure we have the latest list
      loadGyms();
    }
  }, [visible]);

  const loadGyms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      if (data) {
        setGyms(data);
      }
    } catch (error) {
      console.error('Error loading gyms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGym = (gym: Gym) => {
    setSelectedGymId(gym.id);
    onSelectGym(gym);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={Platform.OS === 'android'}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      {Platform.OS === 'ios' ? (
        <View style={styles.iosContainer}>
          <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
            <LinearGradient
              colors={['#000000', '#0A0E1A', '#000000']}
              style={StyleSheet.absoluteFillObject}
            />
            
            {/* Header with drag handle for iOS */}
            <View style={styles.iosHeaderContainer}>
              <View style={styles.dragHandle} />
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Select Gym</Text>
                <TouchableOpacity 
                  onPress={onClose} 
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={28} color={baseTheme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Gym List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : (
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {gyms.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="fitness-outline" size={48} color={baseTheme.colors.textSecondary} />
                    <Text style={styles.emptyText}>No gyms available</Text>
                    <Text style={styles.emptySubtext}>Check your connection and try again</Text>
                  </View>
                ) : (
                  gyms.map((gym) => {
                    const isHomeGym = gym.id === homeGymId;
                    const isSelected = gym.id === selectedGymId;

                    return (
                      <Animated.View
                        key={gym.id}
                        entering={FadeIn.duration(200)}
                        exiting={FadeOut.duration(200)}
                      >
                        <TouchableOpacity
                          style={[
                            styles.gymCard,
                            isSelected && styles.gymCardSelected,
                          ]}
                          onPress={() => handleSelectGym(gym)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.gymCardContent}>
                            {/* Gym Logo/Icon */}
                            {gym.logo_url ? (
                              <Image
                                source={{ uri: gym.logo_url }}
                                style={styles.gymLogo}
                                resizeMode="contain"
                              />
                            ) : (
                              <View
                                style={[
                                  styles.gymIconPlaceholder,
                                  { backgroundColor: gym.primary_color || theme.colors.primary + '20' },
                                ]}
                              >
                                <Ionicons
                                  name="fitness"
                                  size={24}
                                  color={gym.primary_color || theme.colors.primary}
                                />
                              </View>
                            )}

                            {/* Gym Info */}
                            <View style={styles.gymInfo}>
                              <View style={styles.gymNameRow}>
                                <Text style={styles.gymName}>{gym.name}</Text>
                                {isHomeGym && (
                                  <View style={styles.homeBadge}>
                                    <Ionicons name="home" size={12} color={theme.colors.primary} />
                                    <Text style={[styles.homeBadgeText, { color: theme.colors.primary }]}>
                                      Home
                                    </Text>
                                  </View>
                                )}
                              </View>
                              {gym.city && (
                                <Text style={styles.gymLocation}>
                                  {gym.city}
                                  {gym.country && `, ${gym.country}`}
                                </Text>
                              )}
                            </View>

                            {/* Selection Indicator */}
                            {isSelected && (
                              <Ionicons
                                name="checkmark-circle"
                                size={24}
                                color={theme.colors.primary}
                              />
                            )}
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })
                )}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <LinearGradient
            colors={['#000000', '#0A0E1A', '#000000']}
            style={StyleSheet.absoluteFillObject}
          />
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Gym</Text>
            <TouchableOpacity 
              onPress={onClose} 
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={28} color={baseTheme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Gym List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
            ) : (
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {gyms.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="fitness-outline" size={48} color={baseTheme.colors.textSecondary} />
                    <Text style={styles.emptyText}>No gyms available</Text>
                    <Text style={styles.emptySubtext}>Check your connection and try again</Text>
                  </View>
                ) : (
                  gyms.map((gym) => {
                    const isHomeGym = gym.id === homeGymId;
                    const isSelected = gym.id === selectedGymId;

                    return (
                  <Animated.View
                    key={gym.id}
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(200)}
                  >
                    <TouchableOpacity
                      style={[
                        styles.gymCard,
                        isSelected && styles.gymCardSelected,
                      ]}
                      onPress={() => handleSelectGym(gym)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.gymCardContent}>
                        {/* Gym Logo/Icon */}
                        {gym.logo_url ? (
                          <Image
                            source={{ uri: gym.logo_url }}
                            style={styles.gymLogo}
                            resizeMode="contain"
                          />
                        ) : (
                          <View
                            style={[
                              styles.gymIconPlaceholder,
                              { backgroundColor: gym.primary_color || theme.colors.primary + '20' },
                            ]}
                          >
                            <Ionicons
                              name="fitness"
                              size={24}
                              color={gym.primary_color || theme.colors.primary}
                            />
                          </View>
                        )}

                        {/* Gym Info */}
                        <View style={styles.gymInfo}>
                          <View style={styles.gymNameRow}>
                            <Text style={styles.gymName}>{gym.name}</Text>
                            {isHomeGym && (
                              <View style={styles.homeBadge}>
                                <Ionicons name="home" size={12} color={theme.colors.primary} />
                                <Text style={[styles.homeBadgeText, { color: theme.colors.primary }]}>
                                  Home
                                </Text>
                              </View>
                            )}
                          </View>
                          {gym.city && (
                            <Text style={styles.gymLocation}>
                              {gym.city}
                              {gym.country && `, ${gym.country}`}
                            </Text>
                          )}
                        </View>

                        {/* Selection Indicator */}
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color={theme.colors.primary}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
                })
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  iosContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  iosHeaderContainer: {
    paddingTop: baseTheme.spacing.sm,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: baseTheme.colors.textSecondary + '40',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: baseTheme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: baseTheme.spacing.lg,
    paddingBottom: baseTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: baseTheme.glass.border,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: baseTheme.typography.fontSize['2xl'],
    fontWeight: baseTheme.typography.fontWeight.bold,
    color: baseTheme.colors.text,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: baseTheme.spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: baseTheme.spacing.lg,
    gap: baseTheme.spacing.md,
  },
  gymCard: {
    borderRadius: baseTheme.borderRadius.xl,
    backgroundColor: baseTheme.glass.background,
    borderWidth: 1,
    borderColor: baseTheme.glass.border,
    overflow: 'hidden',
  },
  gymCardSelected: {
    borderColor: baseTheme.colors.primary,
    borderWidth: 2,
  },
  gymCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: baseTheme.spacing.lg,
    gap: baseTheme.spacing.md,
  },
  gymLogo: {
    width: 48,
    height: 48,
    borderRadius: baseTheme.borderRadius.md,
  },
  gymIconPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: baseTheme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymInfo: {
    flex: 1,
    gap: baseTheme.spacing.xs,
  },
  gymNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: baseTheme.spacing.sm,
  },
  gymName: {
    fontSize: baseTheme.typography.fontSize.lg,
    fontWeight: baseTheme.typography.fontWeight.bold,
    color: baseTheme.colors.text,
    letterSpacing: 0.3,
  },
  homeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: baseTheme.spacing.xs,
    backgroundColor: baseTheme.glass.background,
    paddingHorizontal: baseTheme.spacing.sm,
    paddingVertical: baseTheme.spacing.xs,
    borderRadius: baseTheme.borderRadius.sm,
    borderWidth: 1,
  },
  homeBadgeText: {
    fontSize: baseTheme.typography.fontSize.xs,
    fontWeight: baseTheme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  gymLocation: {
    fontSize: baseTheme.typography.fontSize.sm,
    color: baseTheme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: baseTheme.spacing['3xl'],
    gap: baseTheme.spacing.md,
  },
  emptyText: {
    fontSize: baseTheme.typography.fontSize.lg,
    fontWeight: baseTheme.typography.fontWeight.semibold,
    color: baseTheme.colors.text,
    letterSpacing: 0.3,
  },
  emptySubtext: {
    fontSize: baseTheme.typography.fontSize.sm,
    color: baseTheme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
