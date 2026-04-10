export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  hasCompletedOnboarding: boolean;
  role?: string | null;
  language?: 'en' | 'sv';
}

export interface AppTheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
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

export interface PendingInvite {
  id: string;
  tripId: string;
  tripTitle?: string | null;
  tripDestination?: string | null;
  tripImageUrl?: string | null;
  invitedByName: string;
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
  commentCount: number;
}

export interface ActivityComment {
  id: string;
  activityId: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string | null;
  text: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  tripId: string;
  description: string;
  totalAmount: number;
  date: string;
  splitMode: 'equal' | 'exact' | 'percentage';
  currency: string;
  createdAt: string;
  createdByName: string;
  payers: { userId: string; userName: string; amount: number }[];
  participants: { userId: string; userName: string; amount: number }[];
}

export interface MemberBalance {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  net: number;
}

export interface Debt {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
}

export interface BalancesResponse {
  balances: MemberBalance[];
  simplifiedDebts: Debt[];
}

export interface TripEvent {
  id: string;
  tripId: string;
  tripTitle?: string | null;
  actorName: string;
  type: 'member_joined' | 'member_left';
  createdAt: string;
}

export interface Settlement {
  id: string;
  tripId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
  note?: string | null;
  createdAt: string;
}
