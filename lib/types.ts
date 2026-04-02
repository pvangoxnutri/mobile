export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string | null;
}

export interface Quest {
  id: string;
  title?: string | null;
  description?: string | null;
  destination?: string | null;
  startDate: string;
  endDate: string;
  imageUrl?: string | null;
  ownerId: string;
  ownerIds: string[];
  visibility: 'public' | 'hidden';
  revealAt?: string | null;
  isRevealed: boolean;
  teaser?: string | null;
  inviteCode: string;
}

export interface TripInvite {
  id: string;
  email: string;
  status: 'pending' | string;
  createdAt: string;
}
