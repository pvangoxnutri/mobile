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
  // Null/absent = the adventure has no known end date yet ("I don't know yet").
  // It stays active until an end date is set or it is marked completed. Render
  // it as "Ongoing" — never as a placeholder date, an empty dash, or
  // "Invalid date".
  endDate?: string | null;
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
  // Slideshow cover preference. Optional because older backends omit it —
  // missing must be treated as ENABLED (backward compatibility rule).
  slideshowEnabled?: boolean;
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
  // True when this activity's photo must not appear as a slideshow slide. The
  // image still renders on the activity itself — this only removes it from the
  // trip's cover rotation. Absent on older payloads, which means "included".
  excludeFromSlideshow?: boolean;
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

// "From this day onwards, the travellers are here." One entry per trip day,
// already resolved server-side (explicit pick, carried forward, or the trip
// destination fallback) — the app never carries forward locations itself.
/** The RESOLVED timeline: one entry per trip day, describing that day's MAIN
 * location — explicitly set, carried forward from an earlier day, or the trip
 * destination fallback. Unchanged shape; a day's additional places are not part
 * of it, since a carried-forward day has no stored rows to expose. */
export interface TripDayLocation {
  date: string; // YYYY-MM-DD
  locationLabel: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
  isExplicit: boolean;
}

/** A single STORED place. A date can hold several, ordered by sortIndex, where
 * 0 is the day's main location and the only one that carries forward. Unlike
 * the resolved timeline these are addressable, so they can be edited, deleted
 * and reordered individually. */
export interface TripDayLocationEntry {
  id: string;
  tripId: string;
  startDate: string; // YYYY-MM-DD — matches the backend column name
  sortIndex: number;
  locationLabel: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
}
