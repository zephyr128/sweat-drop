import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { BottomSheet } from '@/components/BottomSheet';
import { fontStyles, hexToRgba, theme } from '@/lib/theme';

export type GymMapsPickerTarget = {
  gymName: string;
  fullAddress: string;
  lat: number | null;
  lng: number | null;
};

type MapRow = {
  key: string;
  label: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  url: string;
};

async function buildMapRows(target: GymMapsPickerTarget, t: TFunction<'gymDetails'>): Promise<MapRow[]> {
  const rows: MapRow[] = [];
  const { gymName, fullAddress, lat, lng } = target;
  const trimmed = fullAddress.trim();
  const addrEncoded = trimmed ? encodeURIComponent(trimmed) : '';
  const hasCoords = lat != null && lng != null;

  if (Platform.OS === 'ios') {
    const appleUrl = hasCoords
      ? `maps:0,0?q=${encodeURIComponent(gymName)}@${lat},${lng}`
      : addrEncoded
        ? `maps:0,0?q=${addrEncoded}`
        : '';
    if (appleUrl) {
      rows.push({ key: 'apple', label: t('mapsApple'), icon: 'map-outline', url: appleUrl });
    }
  }

  let googleUrl = '';
  if (hasCoords) {
    googleUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    if (Platform.OS === 'ios') {
      try {
        const nativeOk = await Linking.canOpenURL('comgooglemaps://');
        if (nativeOk) {
          googleUrl = `comgooglemaps://?q=${lat},${lng}`;
        }
      } catch {
        /* keep https */
      }
    }
  } else if (addrEncoded) {
    googleUrl = `https://www.google.com/maps/search/?api=1&query=${addrEncoded}`;
  }
  if (googleUrl) {
    rows.push({ key: 'google', label: t('mapsGoogle'), icon: 'navigate-outline', url: googleUrl });
  }

  if (hasCoords) {
    let wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    try {
      if (await Linking.canOpenURL('waze://')) {
        wazeUrl = `waze://?ll=${lat},${lng}&navigate=yes`;
      }
    } catch {
      /* universal link */
    }
    rows.push({ key: 'waze', label: t('mapsWaze'), icon: 'car-outline', url: wazeUrl });
  } else if (addrEncoded) {
    rows.push({
      key: 'waze',
      label: t('mapsWaze'),
      icon: 'car-outline',
      url: `https://waze.com/ul?q=${addrEncoded}`,
    });
  }

  if (Platform.OS === 'android') {
    const geoUrl = hasCoords
      ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(gymName)})`
      : addrEncoded
        ? `geo:0,0?q=${addrEncoded}`
        : '';
    if (geoUrl) {
      rows.push({
        key: 'geo',
        label: t('mapsOtherApps'),
        sub: t('mapsOtherAppsSub'),
        icon: 'apps-outline',
        url: geoUrl,
      });
    }
  }

  return rows;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  accentColor: string;
  target: GymMapsPickerTarget | null;
};

export function GymMapsPickerSheet({ visible, onClose, accentColor, target }: Props) {
  const { t } = useTranslation('gymDetails');
  const [rows, setRows] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !target?.fullAddress?.trim()) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void buildMapRows(target, t).then((built) => {
      if (!cancelled) {
        setRows(built);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, target, t]);

  const openRow = (url: string) => {
    void Linking.openURL(url);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accentColor={accentColor}>
      <Text style={styles.sheetTitle}>{t('mapsSheetTitle')}</Text>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : (
        <View style={styles.rows}>
          {rows.map((row, index) => (
            <TouchableOpacity
              key={row.key}
              style={[styles.row, index < rows.length - 1 && styles.rowDivider]}
              onPress={() => openRow(row.url)}
              activeOpacity={0.75}
            >
              <View style={[styles.iconBubble, { backgroundColor: hexToRgba(accentColor, 0.12) }]}>
                <Ionicons name={row.icon} size={20} color={accentColor} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                {row.sub ? <Text style={styles.rowSub}>{row.sub}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetTitle: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.38)',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  loading: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: theme.colors.text,
  },
  rowSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    lineHeight: 16,
  },
});
