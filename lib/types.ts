export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string | null;
  language?: 'en' | 'sv';
}

export interface Quest {
  id: string;
  title?: string | null;
  description?: string | null;
  destination?: string | null;
  startDate: string;
  endDate: string;
  imageUrl?: string | null;
  spotifyUrl?: string | null;
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

export interface SideQuestActivity {
  id: string;
  tripId: string;
  date: string;
  title?: string | null;
  description?: string | null;
  time?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  spotifyUrl?: string | null;
  visibility: 'public' | 'hidden';
  revealAt?: string | null;
  isRevealed: boolean;
  teaser?: string | null;
  teaserOffsetMinutes?: number | null;
  isHiddenForViewer: boolean;
  teaserVisible: boolean;
  canEdit: boolean;
  isHidden: boolean;
  ownerId: string;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  createdAt: string;
}
