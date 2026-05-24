# PHASE 4 & 5: NOTIFICATION SYSTEM + IMPLEMENTATION ROADMAP

---

## PHASE 4: NOTIFICATION + ANTICIPATION SYSTEM

The notifications in SideQuest should NOT be engagement spam. They should be **emotional anticipation reminders** that deepen the emotional connection to the app.

### Core Philosophy

**NOT:**
- "You have a new message!" (every 5 minutes)
- Engagement metrics maximization
- Push notification farming
- Red badge notification spam

**BUT:**
- Moments of genuine emotional relevance
- Building anticipation for reveals
- Social connection moments
- Premium, thoughtful timing

---

### NOTIFICATION CATEGORIES

#### 1. **REVEAL ANTICIPATION** (Highest Emotional Value)

When a hidden SideQuest is scheduled to reveal, send a soft reminder:

```
"Your SideQuest unlocks in 1 hour 👀"
"Barcelona awaits in 30 minutes ✨"
```

**Characteristics:**
- Scheduled based on reveal time
- Sent 1 hour before, 30 min before, 5 min before (opt-in intensity)
- Soft language (not "UNLOCK NOW")
- Emoji for emotional tone
- Haptic: light pulse (not disruptive)

**Timing:** 0-1 notifications per SideQuest

---

#### 2. **SOCIAL MOMENTS** (Connection, not FOMO)

When someone in your trip group does something:

```
"Alex added a hidden SideQuest to Barcelona 🇪🇸"
"Elena joined your trip ✨"
"Your invite was accepted 🎉"
```

**Characteristics:**
- Personalized (use real names)
- Celebrate, don't pressure
- Only for meaningful actions (not "viewed" or "typing")
- Optional: user can mute by trip

**Timing:** 0-2 per day during active trips

---

#### 3. **MILESTONE MOMENTS** (Celebration, not Spam)

When something meaningful happens:

```
"Your SideQuest reveal just unlocked ✨"
"Trip starts tomorrow! 🚀"
"You've planned 5 SideQuests this month 🔥"
```

**Characteristics:**
- Genuine achievement moments
- Spaced out (not multiple per day)
- Celebratory tone, never pushy
- Haptic: medium pulse (satisfying)

**Timing:** 1-2 per week maximum

---

#### 4. **OPERATIONAL NOTIFICATIONS** (Necessary but Minimal)

Only when user action is required:

```
"Your invite is expiring in 2 days"
"You were mentioned in a chat 💬"
```

**Characteristics:**
- Actually necessary (not opt-in)
- Minimal, professional tone
- No emotional manipulation
- Haptic: light (not intrusive)

**Timing:** As needed, but not more than 1 per day

---

### NOTIFICATION DESIGN PRINCIPLES

#### ✅ ALWAYS DO THIS

- **Personalization:** Use real names, trip names, specific reveals
- **Gratitude Tone:** "Great work scheduling 5 SideQuests!" not "You haven't shared in 24h"
- **Respect Timing:** Never before 8am, after 10pm, or during meals
- **One Message:** Never send duplicates within 6 hours
- **Control:** Let users customize by trip, type, intensity
- **Honor:** Only send what would genuinely delight them

#### ❌ NEVER DO THIS

- Multiple notifications for same event (batch them)
- Notifications that create anxiety ("Time running out!")
- Gamification tactics ("Streaks," "Leaderboards")
- Manufactured urgency ("Only 2 spots left!")
- Notifications about someone's presence/activity
- Auto-send on specific days (no "Monday Motivation")
- Notifications with calls-to-action (no "Tap here to...")

---

### NOTIFICATION SETTINGS (User Control)

Users should be able to control:

```typescript
notificationPreferences = {
  // Reveal Anticipation
  revealReminders: 'none' | 'oneHourBefore' | 'allReminders',

  // Social
  socialNotifications: true | false,
  socialMutedTrips: string[], // trip IDs

  // Milestones
  milestoneNotifications: true | false,

  // Operational
  operationalNotifications: true | false,

  // Quiet Hours
  quietHours: {
    enabled: boolean,
    startTime: '22:00',
    endTime: '08:00',
  },
};
```

---

### NOTIFICATION IMPLEMENTATION EXAMPLE

How a reveal anticipation notification should work:

```typescript
// When hidden SideQuest is created with reveal time
const sidequestCreated = {
  id: '123',
  title: 'Secret Barcelona tapas',
  revealAt: '2025-06-15T18:00:00Z',
  tripName: 'Spain Summer',
};

// Schedule notifications
scheduleNotification({
  // 1 hour before
  triggerTime: subHours(sidequestCreated.revealAt, 1),
  title: 'Spain Summer awaits',
  body: 'Your SideQuest unlocks in 1 hour 👀',
  emoji: '👀',
  haptic: 'light',
  priority: 'normal',
  action: 'openTrip',
  actionData: { tripId: '456' },
});

scheduleNotification({
  // 5 minutes before (only if user opted in to "all reminders")
  triggerTime: subMinutes(sidequestCreated.revealAt, 5),
  title: 'Secret Barcelona tapas',
  body: 'Your SideQuest unlocks now ✨',
  emoji: '✨',
  haptic: 'medium',
  priority: 'high',
  action: 'openSidequest',
  actionData: { sidequestId: '123' },
});

// Actually send the unlock notification when time comes
scheduleNotification({
  // At reveal time
  triggerTime: sidequestCreated.revealAt,
  title: 'SideQuest Unlocked! 🎉',
  body: 'Secret Barcelona tapas is here',
  emoji: '🎉',
  haptic: 'success', // special success haptic
  priority: 'high',
  action: 'openSidequest',
  actionData: { sidequestId: '123' },
});
```

---

## PHASE 5: IMPLEMENTATION ROADMAP

### TIER 1: CRITICAL REVEALS (Weeks 1-2)

**Priority:** 🔴 🔴 🔴 Build this first — it's the heart of the app

**What to build:**
- `useRevealAnimation` hook implementation in trip detail
- Blur effect on hidden SideQuest cards
- Content reveal animation (blur clear, content rise, glow)
- Haptic feedback sequence
- Test on multiple devices

**Files to modify:**
- `app/trip/[id]/index.tsx` — Apply reveal animation to hidden SideQuest cards
- `components/hidden-sidequest-card.tsx` — Create component with built-in reveal
- Add blur filter dependency (expo-blur or native iOS blur)

**Metrics:**
- Reveal animation should feel cinematic (500-600ms)
- Haptic feedback should feel satisfying (3 pulses)
- No lag or jank on reveal (60fps sustained)

---

### TIER 2: BUTTON + CARD PRESS FEEDBACK (Weeks 2-3)

**Priority:** 🟠 High impact across entire app

**What to build:**
- `useScalePress` hook integration on all buttons
- Apply to primary CTAs (create trip, accept invite, add plan)
- Card press feedback on tap
- Ensure haptic on all interactive elements

**Files to modify:**
- `components/ui/button.tsx` — Add scale press animation
- `components/ui/card.tsx` — Add optional press animation
- All screens with buttons/cards — Apply `useScalePress`

**Priority screens:**
1. Home screen (invite accept button)
2. Trip detail (reveal button)
3. Create trip (submit button)
4. Calendar (add plan button)

**Metrics:**
- Button press should feel responsive (<100ms)
- Haptic should trigger on press-in
- Scale should normalize quickly on release

---

### TIER 3: MODAL/SHEET ANIMATIONS (Weeks 3-4)

**Priority:** 🟡 Medium — Pervasive across app

**What to build:**
- `useModalSpring` hook for sheet entry/exit
- Apply to all modals (join trip, invite, settings, etc.)
- Drag-to-dismiss gesture integration
- Backdrop fade/blur

**Files to modify:**
- All modal/sheet components
- `app/(tabs)/index.tsx` — Join modal
- `app/trip/[id]/index.tsx` — Invite/member modals
- Settings/profile modals

**Metrics:**
- Modal entry should feel premium (smooth spring, 400ms)
- Exit should be snappy (300ms)
- Drag should feel responsive (real-time tracking)

---

### TIER 4: EMPTY STATES + ENTRANCE ANIMATIONS (Weeks 4-5)

**Priority:** 🟡 Medium — Quality of life improvement

**What to build:**
- `useBob` for icon gentle motion in empty states
- `useFadeIn` for entrance animation on load
- `useListItemStagger` for activity lists

**Files to modify:**
- Home screen empty state
- Calendar empty state
- Activity feed entrance
- Trip detail activity list

**Metrics:**
- Empty state should feel inviting (gentle bob, no anxiety)
- List items should feel organized (stagger, 50-100ms gaps)
- Entrance should be invisible (doesn't feel like loading)

---

### TIER 5: NOTIFICATION SYSTEM (Weeks 5-6)

**Priority:** 🟢 Lower — Polish and engagement

**What to build:**
- Notification preferences UI
- Schedule notifications for reveals
- Local notification integration
- Silent-hours logic

**Dependencies:**
- `@react-native-firebase/messaging` or `react-native-notifications`
- Background task scheduler

**Metrics:**
- Notifications should trigger on schedule (99% reliability)
- User should be able to customize (per-trip, per-type)
- Should feel anticipatory, not spammy

---

### TIER 6: ADVANCED INTERACTIONS (Weeks 6-7)

**Priority:** 🟢 Lower — Polish

**What to build:**
- Chat message animations
- Success/error states across app
- Loading state consistency
- Navigation transitions

**Files to modify:**
- All screens for consistency
- `components/ui/error-banner.tsx` — Shake animation
- `components/ui/success-toast.tsx` — Celebration animation

---

## IMPLEMENTATION STRATEGY

### Step 1: Setup Motion Infrastructure

```bash
# Install dependencies
npm install react-native-haptic-feedback expo-blur

# Create motion system files (already done)
- MOTION_CONSTANTS.ts
- hooks/useMotion.ts
- MOTION_SYSTEM.md
```

### Step 2: Start with Highest Priority

**DO NOT skip ahead.** Build in this order:

1. Hidden reveal animation (useRevealAnimation hook)
2. Button press feedback (useScalePress hook)
3. Modal entry animations (useModalSpring hook)
4. List entrance animations (useFadeIn, useListItemStagger)
5. Empty state motion (useBob)
6. Notifications (scheduleNotification)
7. Everything else

### Step 3: One Component at a Time

For each component/screen:

```typescript
// 1. Import the hook
import { useScalePress } from '@/hooks/useMotion';

// 2. Initialize animation
const { scaleValue, handlePressIn, handlePressOut, animatedStyle } =
  useScalePress({ scale: 0.92, triggerHaptics: true });

// 3. Apply to pressable
<TouchableOpacity
  onPressIn={handlePressIn}
  onPressOut={handlePressOut}
  style={animatedStyle}
>
  {/* content */}
</TouchableOpacity>
```

### Step 4: Test on Real Devices

- Test on iPhone (haptics, animation smoothness)
- Test on Android (animation differences, haptic interpretation)
- Test with Slow Animations ON (Settings → Developer)
- Test battery impact (animation shouldn't drain battery)

### Step 5: Iterate Based on Feeling

After implementing each tier, ask:
- Does it feel premium?
- Does it feel intentional?
- Would a user notice if we removed it?
- Does it support emotion or just distract?

If answer to 2-3 is "not sure," revise.

---

## PERFORMANCE GUIDELINES

### What NOT to Animate

These cause jank and should be avoided:

- ❌ Width/Height (triggers layout)
- ❌ Padding/Margin (triggers layout)
- ❌ borderRadius (performance hit on some devices)
- ❌ fontSize (triggers layout)
- ❌ backgroundColor (unless via opacity+color cross-fade)

### What to Animate

These are performant:

- ✅ transform (translateX, translateY, scale, rotate)
- ✅ opacity
- ✅ color (via opacity layers)

### Performance Budget

- Max 3 animations running simultaneously per screen
- Animation should not drop below 55fps (check with Slow Animations)
- useNativeDriver: true for all transforms and opacity
- useNativeDriver: false only for blur/filters

### Memory Impact

- Each Animated.Value takes ~2KB RAM
- 50 Animated values = ~100KB (acceptable)
- 500 Animated values = ~1MB (unacceptable)

Cleanup: Always cancel animations in useEffect cleanup

```typescript
useEffect(() => {
  const animationId = animatedValue.addListener(...);
  return () => animatedValue.removeListener(animationId);
}, []);
```

---

## TESTING STRATEGY

### Unit Test Animation Logic

```typescript
describe('useRevealAnimation', () => {
  it('should animate blur from 8 to 0', () => {
    const { blurValue, startReveal } = useRevealAnimation();
    startReveal();
    // Assert blurValue goes from 8 → 0
  });

  it('should trigger haptics', () => {
    const mockHaptic = jest.fn();
    useRevealAnimation({ triggerHaptics: true });
    // Assert haptic triggered
  });
});
```

### Integration Test Animation + UI

```typescript
describe('Hidden SideQuest Reveal', () => {
  it('should blur then clear card on reveal', () => {
    render(<HiddenSidequestCard isRevealing={true} />);
    // Assert: card starts blurred
    // Wait 600ms
    // Assert: card is clear
  });
});
```

### Manual Testing Checklist

- [ ] Reveal animation feels cinematic (not too fast, not sluggish)
- [ ] Haptic feedback matches animation timing
- [ ] No jank on low-end devices (test on Android low-end)
- [ ] Slow Animations enabled still looks good
- [ ] Animations respect user's reduced-motion preference
- [ ] All animations cleanup on unmount

---

## ACCESSIBILITY CONSIDERATIONS

### Respecting Reduced Motion

iOS/Android users can enable "Reduce Motion" in accessibility settings.

```typescript
const { reduceMotionEnabled } = useWindowDimensions();

const duration = reduceMotionEnabled ? MOTION_TIMING.quick : MOTION_TIMING.cinematic;
```

**Principle:** Animation should enhance, not define. If you disable animation and the UI still works, you're good.

### Haptic Accessibility

Not everyone can feel haptics. Never rely on haptics alone for feedback.

```typescript
// ✅ GOOD: Animation + Haptic + Color change
<Button
  onPress={() => {
    animation.start(); // Visual feedback
    triggerHaptic(); // Tactile feedback
    setColor(success); // Color feedback
  }}
/>

// ❌ BAD: Haptic only
<Button onPress={() => triggerHaptic()} />
```

---

## MIGRATION PLAN FOR EXISTING CODE

Don't refactor everything. Prioritize:

### Week 1: Critical Reveals Only
- Hidden SideQuest cards
- Reveal animations
- Test thoroughly

### Week 2: Main CTAs
- Home screen invite accept
- Trip detail buttons
- Create trip submit

### Week 3: Modals
- Join trip modal
- All other modals
- Sheet gestures

### Week 4+: Everything Else
- Lists, animations
- Empty states
- Nice-to-haves

---

## SUCCESS METRICS

After full implementation:

✅ **User Feeling:**
- App feels alive and responsive
- Interactions feel tactile and premium
- Hidden reveals feel cinematic and rewarding
- No animations feel gratuitous or distracting

✅ **Technical:**
- 60fps maintained on all animations
- <100ms input lag on all interactions
- Zero jank on Slow Animations
- Haptics trigger on cue
- Battery impact negligible

✅ **Retention:**
- Users remember the reveal moment
- Share moment more often (social proof)
- Open app more frequently (emotional connection)
- Rate app higher (premium feel)

---

## FINAL PHILOSOPHY

Motion in SideQuest is not about being flashy.

It's about:
- **Warmth:** Making the app feel human and welcoming
- **Intention:** Every animation serves a purpose
- **Emotion:** Supporting the emotional journey of discovery
- **Premium:** Small polish details that add up to "this app cares"

The goal is invisible excellence: animations that feel so natural, users don't notice them individually, but notice immediately if they're gone.

---
