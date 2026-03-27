'use client';

import { ChallengesList } from './ChallengesList';

interface ChallengesPageViewProps {
  gymId: string;
  initialChallenges?: unknown[];
}

export function ChallengesPageView({ gymId }: ChallengesPageViewProps) {
  return <ChallengesList gymId={gymId} />;
}
