'use client';

import { isProfileAvatarImageUrl } from '@/lib/utils/avatar-display';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<Size, { box: string; emoji: string; img: string; initial: string }> = {
  sm: {
    box: 'w-6 h-6 min-w-[1.5rem]',
    emoji: 'text-sm leading-none',
    img: 'w-6 h-6',
    initial: 'text-[10px]',
  },
  md: {
    box: 'w-8 h-8 min-w-[2rem]',
    emoji: 'text-lg leading-none',
    img: 'w-8 h-8',
    initial: 'text-xs',
  },
  lg: {
    box: 'w-12 h-12 min-w-[3rem]',
    emoji: 'text-2xl leading-none',
    img: 'w-12 h-12',
    initial: 'text-sm',
  },
  xl: {
    box: 'w-16 h-16 min-w-[4rem]',
    emoji: 'text-4xl leading-none',
    img: 'w-16 h-16',
    initial: 'text-xl',
  },
};

interface MemberAvatarProps {
  avatarUrl: string | null | undefined;
  username: string;
  size?: Size;
  className?: string;
}

export function MemberAvatar({ avatarUrl, username, size = 'md', className = '' }: MemberAvatarProps) {
  const s = sizeMap[size];
  const initial = (username || '?').charAt(0).toUpperCase();
  const raw = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';

  if (!raw) {
    return (
      <div
        className={`${s.box} rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0 ${className}`}
      >
        <span className={`${s.initial} font-bold text-[#808080]`}>{initial}</span>
      </div>
    );
  }

  if (isProfileAvatarImageUrl(raw)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={raw}
        alt={username}
        className={`${s.img} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${s.box} rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0 overflow-hidden ${className}`}
      aria-label={username}
      role="img"
    >
      <span className={`${s.emoji} select-none`}>{raw}</span>
    </div>
  );
}
