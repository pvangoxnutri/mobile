export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  hasCompletedOnboarding: boolean;
  role?: string | null;
  isBanned?: boolean;
  language?: 'en' | 'sv';
}

export interface UserProfile {
  id: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  tripsJoined: number;
  sidequestsCreated: number;
  countriesVisited: number;
  isOnline?: boolean;
}

export interface Quest {
  id: string;
  title?: string | null;
  description?: string | null;
  destination?: string | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
  destinationPlaceId?: string | null;
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
  countries?: string[];
  shareCode?: string | null;
  membersCanEdit?: boolean;
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
  // Hotel stay: check-out date/time. Null/absent = single-day activity.
  // Withheld by the server for sealed viewers (leaks stay length).
  endDate?: string | null;
  endTime?: string | null;
  sortIndex: number;
  category?: string | null;
  // User-entered name for a custom category (paired with the symbol key in
  // `category`). Null for built-in categories and older activities.
  customCategoryLabel?: string | null;
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
  receiptUrl?: string | null;
  createdAt: string;
  createdByUserId: string;
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
  actorId?: string | null;
  actorName: string;
  actorAvatarUrl?: string | null;
  type: 'member_joined' | 'member_left' | 'activity_added' | 'sidequest_revealed';
  activityId?: string | null;
  isHidden?: boolean;
  activityTitle?: string | null;
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

export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export interface SupportAttachment {
  id: string;
  fileUrl: string;
  fileType: string;
}

export interface SupportMessage {
  id: string;
  senderType: 'user' | 'admin';
  body: string;
  createdAt: string;
  attachments: SupportAttachment[];
}

export interface SupportTicketSummary {
  id: string;
  category: string;
  subject: string;
  status: 'open' | 'waiting_for_reply' | 'closed';
  hasUnreadAdminReply: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface SupportTicketDetail {
  id: string;
  category: string;
  subject: string;
  status: 'open' | 'waiting_for_reply' | 'closed';
  createdAt: string;
  messages: SupportMessage[];
}
