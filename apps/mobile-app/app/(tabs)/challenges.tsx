import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export default function ChallengesScreen() {
  const { session } = useSession();
  const [challenges, setChallenges] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});

  useEffect(() => {
    if (session?.user) {
      loadChallenges();
    }
  }, [session]);

  useEffect(() => {
    if (session?.user && challenges.length > 0) {
      loadProgress();
    }
  }, [session, challenges]);

  const loadChallenges = async () => {
    if (!session?.user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;

    const query = supabase
      .from('challenges')
      .select('*')
      .eq('is_active', true)
      .gte('end_date', new Date().toISOString().split('T')[0]);

    if (gymId) {
      query.eq('gym_id', gymId);
    }

    const { data } = await query.order('end_date');

    if (data) {
      setChallenges(data);
    }
  };

  const loadProgress = async () => {
    if (!session?.user) return;

    const challengeIds = challenges.map((c) => c.id);
    const { data } = await supabase
      .from('challenge_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .in('challenge_id', challengeIds);

    if (data) {
      const progressMap: Record<string, any> = {};
      data.forEach((p) => {
        progressMap[p.challenge_id] = p;
      });
      setProgress(progressMap);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getChallengeTypeLabel = (type: string) => {
    switch (type) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'streak':
        return 'Streak';
      default:
        return type;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <Text style={styles.title}>Active Challenges</Text>

          {challenges.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active challenges</Text>
            </View>
          ) : (
            challenges.map((challenge) => {
              const userProgress = progress[challenge.id];
              const currentDrops = userProgress?.current_drops || 0;
              const progressPercent = Math.min(
                (currentDrops / challenge.target_drops) * 100,
                100
              );
              const isCompleted = userProgress?.is_completed || false;

              return (
                <View key={challenge.id} style={styles.challengeCard}>
                  <View style={styles.challengeHeader}>
                    <View>
                      <Text style={styles.challengeType}>
                        {getChallengeTypeLabel(challenge.challenge_type)}
                      </Text>
                      <Text style={styles.challengeName}>{challenge.name}</Text>
                    </View>
                    <Text style={styles.timeRemaining}>
                      {getTimeRemaining(challenge.end_date)}
                    </Text>
                  </View>

                  {challenge.description && (
                    <Text style={styles.challengeDescription}>
                      {challenge.description}
                    </Text>
                  )}

                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progressPercent}%` },
                          isCompleted && styles.progressFillCompleted,
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {currentDrops} / {challenge.target_drops} drops
                    </Text>
                  </View>

                  {isCompleted && (
                    <View style={styles.completedBadge}>
                      <Text style={styles.completedText}>
                        ✅ Completed! {challenge.reward_drops} drops earned
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  challengeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  challengeType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  challengeName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  timeRemaining: {
    fontSize: 14,
    color: '#6b7280',
  },
  challengeDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 4,
  },
  progressFillCompleted: {
    backgroundColor: '#10b981',
  },
  progressText: {
    fontSize: 14,
    color: '#6b7280',
  },
  completedBadge: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#d1fae5',
    borderRadius: 8,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065f46',
  },
});
