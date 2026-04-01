import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '@/components/BackButton';
import { typographyTokens } from '@/lib/theme';

interface ScreenHeaderProps {
  /** Screen title shown centered between back button and right slot. */
  title: string;
  /**
   * Optional right-side element (icon button, receipt button, etc.).
   * Defaults to an invisible 40×40 spacer that mirrors the BackButton,
   * keeping the title perfectly centered.
   */
  right?: ReactNode;
  /**
   * Set to true when this header is rendered inside a SafeAreaView with
   * edges={['top']}. Prevents double-counting the safe-area inset.
   * Default: false — the header handles its own inset.
   */
  insetHandled?: boolean;
}

/**
 * Shared header bar for all stack screens.
 *
 * Layout:  [BackButton 40px] [title flex:1 centered] [right slot 40px]
 *
 * Usage (screen owns the inset via raw View):
 *   <ScreenHeader title={t('title')} />
 *
 * Usage (screen wraps in SafeAreaView edges=['top']):
 *   <SafeAreaView edges={['top']}>
 *     <ScreenHeader title={t('title')} insetHandled />
 *   </SafeAreaView>
 */
export default function ScreenHeader({ title, right, insetHandled = false }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const topPadding = insetHandled ? 8 : insets.top + 8;

  return (
    <View style={[styles.header, { paddingTop: topPadding }]}>
      <BackButton />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rightSlot}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: typographyTokens.headerHorizontalPadding,
    paddingBottom: 12,
  },
  title: {
    ...typographyTokens.screenTitle,
  },
  rightSlot: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
