/**
 * SheetArenaContent
 * Bottom sheet content for page 3 (Arenas): cyan-themed premium arena stats.
 * No internal scroll — the parent Animated.ScrollView handles all vertical scrolling.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ArenasStatsCards } from '@/components/home/ArenasStatsCards';
import type { AvailableArena } from '@/hooks/useAvailableArenas';

export interface SheetArenaContentProps {
  isUnlocked: boolean;
  activeArenas: AvailableArena[];
  onArenaPress: (arenaId: string) => void;
  onViewAllArenas: () => void;
}

export const SheetArenaContent = React.memo(function SheetArenaContent({
  isUnlocked,
  activeArenas,
  onArenaPress,
  onViewAllArenas,
}: SheetArenaContentProps) {
  return (
    <View style={styles.container}>
      <ArenasStatsCards
        activeArenas={activeArenas}
        isUnlocked={isUnlocked}
        onArenaPress={onArenaPress}
        onViewAllArenas={onViewAllArenas}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
});
