import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { theme, fontStyles } from '@/lib/theme';
import { PlatformBlur } from '@/components/PlatformBlur';

export function AppModal() {
  const { visible, title, body, buttons, hideModal } = useAppModal();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={hideModal}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => {
          // Only dismiss on backdrop if there's a single OK-style button
          if (buttons.length <= 1) hideModal();
        }}
      >
        <View style={styles.card}>
          <PlatformBlur intensity={75} tint="dark" style={styles.blur} androidColor="rgba(14,16,26,0.98)">
            <Text style={styles.title}>{title}</Text>
            {!!body && <Text style={styles.body}>{body}</Text>}

            <View style={[styles.buttonRow, buttons.length > 2 && styles.buttonColumn]}>
              {buttons.map((btn, idx) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.btn,
                      isDestructive && styles.btnDestructive,
                      isCancel && styles.btnCancel,
                      buttons.length === 1 && styles.btnSingle,
                    ]}
                    onPress={() => {
                      hideModal();
                      btn.onPress?.();
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        isDestructive && styles.btnTextDestructive,
                        isCancel && styles.btnTextCancel,
                      ]}
                    >
                      {btn.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </PlatformBlur>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  blur: {
    padding: 24,
    backgroundColor: 'rgba(14,16,26,0.80)',
  },
  title: {
    ...fontStyles.heading,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 8,
  },
  body: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 21,
    marginBottom: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  buttonColumn: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  btnSingle: {
    flex: 0,
    alignSelf: 'flex-end',
  },
  btnDestructive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
  },
  btnCancel: {
    backgroundColor: 'transparent',
  },
  btnText: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 1.5,
    color: theme.colors.text,
  },
  btnTextDestructive: {
    color: '#EF4444',
  },
  btnTextCancel: {
    color: theme.colors.textSecondary,
  },
});
