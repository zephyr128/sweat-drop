'use client';

import { TeamList } from './TeamList';

interface TeamPageViewProps {
  gymId: string;
  isGymOwner: boolean;
  initialStaff: unknown[];
  initialInvitations: unknown[];
}

export function TeamPageView({ gymId, isGymOwner }: TeamPageViewProps) {
  return <TeamList gymId={gymId} isGymOwner={isGymOwner} />;
}
