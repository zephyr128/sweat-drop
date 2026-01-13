import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme } from '@/lib/theme';

interface ReportIssueModalProps {
  visible: boolean;
  onClose: () => void;
  machineId: string;
  machineName: string;
}

type ReportType = 'sensor_not_connecting' | 'machine_broken' | 'missing_qr';

export function ReportIssueModal({ visible, onClose, machineId, machineName }: ReportIssueModalProps) {
  const { session } = useSession();
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reportTypes: { type: ReportType; label: string; icon: string }[] = [
    { type: 'sensor_not_connecting', label: 'Sensor not connecting', icon: 'bluetooth-outline' },
    { type: 'machine_broken', label: 'Machine broken', icon: 'warning-outline' },
    { type: 'missing_qr', label: 'Missing QR', icon: 'qr-code-outline' },
  ];

  const handleSubmit = async () => {
    if (!selectedType || !session?.user) {
      Alert.alert('Error', 'Please select an issue type');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('machine_reports').insert({
        machine_id: machineId,
        user_id: session.user.id,
        report_type: selectedType,
        status: 'pending',
      });

      if (error) throw error;

      Alert.alert('Success', 'Issue reported successfully. Thank you!', [
        {
          text: 'OK',
          onPress: () => {
            setSelectedType(null);
            onClose();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Error reporting issue:', error);
      Alert.alert('Error', `Failed to report issue: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <LinearGradient
            colors={['#0A1A2E', '#1A1A2E', '#0F0F1E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Report Issue</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.machineName}>{machineName}</Text>
            <Text style={styles.subtitle}>What's the issue?</Text>

            <View style={styles.optionsContainer}>
              {reportTypes.map((option) => (
                <TouchableOpacity
                  key={option.type}
                  style={[
                    styles.option,
                    selectedType === option.type && styles.optionSelected,
                  ]}
                  onPress={() => setSelectedType(option.type)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={24}
                    color={selectedType === option.type ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      selectedType === option.type && styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selectedType === option.type && (
                    <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.submitButton, !selectedType && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!selectedType || submitting}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  gradient: {
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  machineName: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    letterSpacing: 0.3,
  },
  optionsContainer: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  optionSelected: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderColor: theme.colors.primary + '50',
  },
  optionText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  optionTextSelected: {
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#000000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 0.3,
  },
});
