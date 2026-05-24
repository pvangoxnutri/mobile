# SideQuest Mobile App — Global Design System

**Version:** 1.0 (Unification Pass)  
**Base Reference:** Home Screen (`app/(tabs)/index.tsx`)  
**Scope:** Complete visual/interaction consistency across all screens  
**Goal:** Premium, cohesive consumer app feel (Duolingo, Instagram, Linear quality)

---

## 1. Spacing System

### Horizontal Padding (Page Level)
- **Standard:** `22px` (all screens, all tabs, modals)
- **Exception:** None. All screens use 22px.

### Gaps & Gutters (Within Sections)
| Use Case | Value |
|----------|-------|
| Tight icon + text | 5-6px |
| Icon button + label | 8px |
| List items | 10px |
| Card sections | 12px |
| Major sections | 14px |
| Section headers | 16-18px |

### Vertical Spacing (Between Sections)
| Section Type | Spacing |
|--------------|---------|
| Top margin (after header) | 8px |
| Section heading to content | 10px |
| Card to next card | 10px |
| Major sections (Activity → UpNext) | 10px |
| Header to first content | 16px |
| Bottom padding (before FAB) | 100-140px |

### Card Padding (Interior)
- **Compact cards** (activity feed row): `16px horizontal, 9px vertical`
- **Standard cards** (invites): `12px`
- **Large cards** (modals): `20px`
- **Form sections**: `18px`

---

## 2. Typography Scale

### Font Family
- **All text:** System default (San Francisco on iOS, Roboto-equivalent on Android)
- **No custom fonts**

### Type Hierarchy

| Component | Size | Weight | Line Height | Letter Spacing | Use Case |
|-----------|------|--------|-------------|-----------------|----------|
| **Page Heading** | 24px | 900 | 28px | -0.8 | Major section titles (Calendar, Profile) |
| **Card Title** | 28px | 800 | 32px | -0.6 | BigHeroCard trip title |
| **Section Header** | 11px | 800 | 13px | 1.4 | "ACTIVITY", "UP NEXT", "INVITED" |
| **Subheading** | 15px | 700 | 18px | -0.3 | Card titles, activity titles |
| **Body Text** | 13-15px | 500-600 | 18-22px | -0.2 to 0 | Descriptions, activity descriptions |
| **Meta Text** | 11-12px | 600 | 16px | 0-0.5 | Timestamps, "by Name", secondary info |
| **Label (Eyebrow)** | 11px | 800 | 13px | 1.4 | "INVITE CODE", "MEMBERS HEADING" |
| **Button Text** | 13-15px | 800 | 18px | -0.2 | Primary, secondary, FAB text |
| **Input Text** | 22px | 800 | 28px | 6 | Invite code input (special case) |

### Color by Role
- **Headers/Titles:** `#161821` (dark near-black)
- **Body Text:** `#14161d` (dark)
- **Secondary Text:** `#6f7683` (medium gray)
- **Meta/Hint Text:** `#8a909e` (light gray)
- **Disabled/Muted:** `#bbc0c8` (lighter gray)
- **Accent (Primary):** `#ff4f74` (pink)
- **Accent (Secondary):** `#0d90a8` (cyan)
- **White Text (on dark):** `#fff` or `rgba(255,255,255,0.92)`

---

## 3. Border Radius System

### Small (Button-sized elements)
| Component | Radius | Notes |
|-----------|--------|-------|
| Icon buttons | 50% (circular) | Always circle |
| Small badge | 14-17px | Accept/decline invite buttons |
| Avatar | 50% (circular) | All avatars, all sizes |

### Medium (Card-sized)
| Component | Radius |
|-----------|--------|
| Activity cards | 18px |
| Up Next cards | 16px |
| Invite cards | 20px |
| Input fields | 16px |
| Chat messages | 16px |
| FAB menu | 22px |

### Large (Screen-sized)
| Component | Radius |
|-----------|--------|
| Bottom sheets | 32px (top corners only) |
| Join modal | 28px |
| Large cards | 32px |
| BigHeroCard | 32px |

### Full Circle
- **All avatars:** `borderRadius: width/2`
- **Icon buttons:** `borderRadius: width/2`
- **Pill buttons:** `borderRadius: 999`

---

## 4. Color System

### Primary Colors (from `constants/colors.ts`)
```javascript
PRIMARY_COLOR = '#ff4f74'        // Pink — all primary actions
SECONDARY_COLOR = '#0d90a8'      // Cyan — trip planning, dates
PRIMARY_08 = 'rgba(255,79,116,0.08)'   // Very light pink background
PRIMARY_20 = 'rgba(255,79,116,0.2)'    // Light pink background
PRIMARY_12 = 'rgba(255,79,116,0.12)'   // Slight pink tint
```

### Neutral Palette
| Color | Hex | Use |
|-------|-----|-----|
| White | #fff | Card backgrounds, text on dark |
| Page BG | #fff | All page backgrounds (NOT cream) |
| Light Gray BG | #f4f4f5, #f5f5f6 | Input backgrounds, avatar shells |
| Medium Gray | #8a909e | Secondary text, hints, meta |
| Dark Gray | #bbc0c8 | Dividers, disabled states |
| Very Light Gray | #e3e5e9 | Input borders, hairlines |
| Dark Text | #161821, #14161d | Headers, primary text |

### Semantic Colors
| State | Color | Use |
|-------|-------|-----|
| Success | #3ddc8c | Activity dot, live indicator |
| Error | #d53d18 | Error messages |
| Warning | #f59e0b | Not used yet, reserved |

### Background Colors by Context
| Context | Color | Notes |
|---------|-------|-------|
| Modal backdrop | `rgba(10,12,18,0.28)` | Semi-transparent dark |
| FAB backdrop | `rgba(17,18,23,0.08)` | Very subtle |
| Gradient overlay (dark) | `rgba(0,0,0,0.55)` | BigHeroCard bottom |
| Pill background (dark) | `rgba(20,22,29,0.7)` | LIVE badge on hero |
| Pill background (light) | `rgba(0,0,0,0.42)` | Location pill on hero |

---

## 5. Shadow & Elevation System

### Elevation Levels

| Level | Use | Shadow Spec |
|-------|-----|-------------|
| **Subtle (1-2)** | Activity rows, up next cards | `offset: 0,2; opacity: 0.04-0.05; radius: 6-8px` |
| **Medium (5)** | Quest cards, invite cards | `offset: 0,10; opacity: 0.06; radius: 22px` |
| **Strong (8-10)** | BigHeroCard, FAB | `offset: 0,14-18; opacity: 0.18-0.26; radius: 24-28px` |
| **Floating (14)** | FAB menu, modals | `offset: 0,18; opacity: 0.16; radius: 28px` |

### Shadow Formula
```javascript
shadowColor: '#000'
shadowOffset: { width: 0, height: N }  // Only vertical offset
shadowOpacity: 0.04 to 0.26            // Based on level
shadowRadius: 6 to 28                  // Based on elevation
elevation: 1 to 14                     // Android parity
```

### No Rounded Shadows
- React Native shadows cannot be rounded; avoid trying to create "soft" shadows with border-radius tricks
- Shadows are always rectangular falloff

---

## 6. Button System

### Button Hierarchy

#### Primary Button
- **Background:** `PRIMARY_COLOR` (#ff4f74)
- **Text Color:** `#fff`
- **Height:** 52px (forms), 34px (compact)
- **Border Radius:** 16px (forms), 17px (compact)
- **Padding:** 18px horizontal (forms), 16px (compact)
- **Text:** 15px, weight 800
- **Active Opacity:** 0.88
- **Shadow:** Medium elevation (5)
- **Disabled:** Opacity 0.5

#### Secondary Button
- **Background:** `#fff`
- **Border:** 1.5px, `PRIMARY_COLOR`
- **Text Color:** `PRIMARY_COLOR`
- **Height:** 52px (forms), 34px (compact)
- **Border Radius:** 16px (forms), 17px (compact)
- **Padding:** 18px horizontal (forms), 16px (compact)
- **Text:** 15px, weight 700
- **Active Opacity:** 0.88

#### Icon Button
- **Shape:** Circular (borderRadius: 50%)
- **Sizes:** 32px (small), 38px (medium), 68px (FAB)
- **Background:** `#f5f6f8` (secondary), `PRIMARY_COLOR` (primary)
- **Active Opacity:** 0.8-0.92

#### Pill Button
- **Border Radius:** 999 (fully rounded)
- **Padding:** 8-12px horizontal, 6-8px vertical
- **Font Size:** 11-13px
- **Use:** Status badges, action pills

### All Buttons Rules
- No rounded shadows, use flat elevation
- Consistent active opacity (0.8-0.92)
- Disabled: opacity 0.5, not `pointerEvents: 'none'` (let press handlers detect it)
- Icon + text gap: 8-12px depending on context
- Minimum touch target: 44x44px

---

## 7. Card System

### Card Base Style
```javascript
{
  backgroundColor: '#fff',
  borderRadius: 16,
  paddingVertical: 9,
  paddingHorizontal: 16,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 8,
  elevation: 2,
}
```

### Card Variants

| Variant | Radius | Padding | Shadow | Use |
|---------|--------|---------|--------|-----|
| **Activity** | 18px | 16h/9v | Subtle | Activity feed rows, comments |
| **Up Next** | 16px | 9px all | Subtle | Upcoming activities carousel |
| **Invite** | 20px | 12px all | None | Pending invites section |
| **Hero/Featured** | 32px | None | Strong | BigHeroCard, large previews |
| **Form Section** | 20px | 16px | Subtle | Form cards, grouped inputs |

---

## 8. Input System

### Text Input
- **Height:** 54px
- **Border Radius:** 16px
- **Border:** 1.5px, color `#e2e5ee`
- **Background:** `#f8f9fc`
- **Padding:** 18px horizontal
- **Font Size:** 15-16px
- **Placeholder Color:** `#b0b5c0`
- **Text Color:** `#161821`
- **Active Border:** Same (no color change on focus)

### Picker Input (Dropdown)
- **Same dimensions as text input**
- **Arrow icon on right:** 16px, gray
- **Chevron icon color:** `#8a909e`

### Date Input (Range Picker)
- **Component:** Custom RangeDatePicker
- **Button style:** Same as picker, shows date range
- **Modal:** Centered, backdrop `rgba(10,12,18,0.28)`

### Textarea
- **Min Height:** 100px
- **Same border/background as text input**
- **Padding:** 18px
- **Font Size:** 15px
- **Line Height:** 20px

---

## 9. Modal & Sheet System

### Bottom Sheet (Default)
- **Border Radius:** 32px (top corners only)
- **Background:** `#fff`
- **Max Height:** 82% of screen
- **Handle:** 44x5px, borderRadius 999, color `#d9dde4`, margin 4px bottom
- **Header Spacing:** marginTop 14px
- **Padding:** 22px horizontal, 10px top
- **Shadow:** Strong elevation (14)
- **Dismiss:** Swipe down, tap outside, X button

### Centered Modal (Forms)
- **Border Radius:** 28px
- **Background:** `#fff`
- **Padding:** 20px
- **Backdrop:** `rgba(10,12,18,0.28)`
- **Content:** Centered on screen
- **Shadow:** Strong elevation (14)

### Modal Header
- **Eyebrow:** 11px, weight 800, color `#9aa0ad`, letter-spacing 1.4
- **Title:** 22-24px, weight 900, color `#161821`, marginTop 4-6px
- **Close Button:** 38x38px circle, color `#f5f6f8`, icon `#161821`

---

## 10. Animation Philosophy

### Timing
- **Quick feedback:** 120ms (opacity changes, item highlights)
- **Transition:** 180-240ms (screen changes, panel slides)
- **Reveal:** 300-320ms (expand/collapse, progress bars)
- **Idle:** 3000ms+ (auto-rotate carousels, event feed cycles)

### Easing
- **Linear:** Opacity fades, progress bars
- **Timing:** Slide-ins, modal opens
- **Spring:** FAB menu open/close, hero card transitions
  - Damping: 14-16
  - Stiffness: 200-220
  - Mass: default

### Native Driver
- Use `useNativeDriver: true` for position/opacity/scale
- Use `useNativeDriver: false` for width/height/backgroundColor

### No Excessive Animation
- **Forbidden:** Particle effects, confetti, complex lottie
- **Allowed:** Smooth transitions, button press feedback, carousel momentum
- **Principle:** Animation should feel responsive, not decorative

---

## 11. Empty State Philosophy

### Structure
```
{Icon} 24px space
{Primary Text} 24px, weight 900, color #161821
{Secondary Text} 14px, weight 500, color #6f7683
```

### Icon
- Size: 28-46px (depending on prominence)
- Color: `#bbc0c8` (muted gray)
- Background: Optional, `#f5f4f5`, 56-112px circle

### Primary Copy
- 24-30px, weight 900, letter-spacing -0.6
- "No adventures yet", "Nothing to do today"
- Clear action implication

### Secondary Copy
- 14-18px, weight 500, line-height 24-30
- Optional, contextual hint
- "Create your first trip to get started"

### CTA Button (Optional)
- Only if action is obvious (not always needed)
- Use primary or secondary button style

---

## 12. Icon System

### Icon Library
- **Source:** Ionicons (expo/vector-icons)
- **Size Range:** 11px (labels) to 46px (empty states)
- **Standard Sizes:** 12, 14, 16, 18, 20, 22, 28, 46
- **Color:** Match text hierarchy (dark, gray, accent)

### Icon + Text Combinations
| Pattern | Gap | Icon Size | Text Size |
|---------|-----|-----------|-----------|
| Label + icon | 5px | 12px | 11px |
| Button label | 8px | 18-20px | 15px |
| Header icon | 8px | 16px | 13px |
| Large badge | 10px | 22px | 18px |
| List item | 12px | 20px | 15px |

### Icon Names (Semantic)
Use consistent icon names across the app:
- **Actions:** `add`, `close`, `arrow-back`, `arrow-forward`
- **Status:** `checkmark`, `close`, `alert-circle`
- **Navigation:** `chevron-back`, `chevron-forward`
- **Status Indicators:** `time-outline`, `lock-closed`, `star-outline`

---

## 13. Avatar System

### Avatar Sizes
| Size | Use | Border Radius |
|------|-----|---------------|
| 28px | Small list avatars | 14px |
| 32px | BigHeroCard stack | 16px |
| 36px | Activity feed | 18px |
| 42px | Members list | 21px |
| 48px | Profile header | 24px |
| 56px | Large profile | 28px |

### Avatar Styling
- **Background:** `#1d212a` (dark) or `#fff1f5` (light with pink initials)
- **Text Color:** `#fff` (dark bg), `PRIMARY_COLOR` (light bg)
- **Text:** Weight 800, size varies by avatar size
- **Image:** Covers entire area, no border (except when stacked)
- **Stacked:** Border 2px white, negative margin -12px for overlap

### Avatar Initials
- Max 2 characters
- Uppercase
- First letter of first and last name
- Fallback: "SQ" or "?"

---

## 14. Divider & Border System

### Hairline Divider
- **Width:** `StyleSheet.hairlineWidth` (platform-aware, ~0.5-1px)
- **Color:** `#eef0f4` (very light gray)
- **Use:** Between list items, under headers

### Visible Border
- **Width:** 1px or 1.5px (for inputs)
- **Color:** Input borders `#e2e5ee`
- **Radius:** 16px (paired with input styling)

### Separator Line (Section)
- **Height:** 1px
- **Color:** `#e8ebef`
- **Use:** Between major sections in scrollable content

---

## 15. Image & Media System

### Aspect Ratios
| Context | Ratio | Notes |
|---------|-------|-------|
| Cover photo (trip) | 16:10 | BigHeroCard cover |
| Avatar | 1:1 | Circular, all sizes |
| Activity image | 76px tall | Up Next cards |
| Activity detail | 3:2 or native | Activity detail view |

### Image Sizing Rules
- **Optimize for network:** Use quality 0.85-0.9
- **Respect safe area:** Leave padding for notch/home bar
- **Responsive:** Use window dimensions, not fixed pixel values
- **Fallback:** Always have placeholder (color or icon)

### Image Loading
- No skeleton loaders required
- Show placeholder immediately, swap image on load
- Fade in image on load (optional, but use native opacity)

---

## 16. Data Table & List System

### Row Height
- **Compact:** 44px (no padding)
- **Standard:** 56px (12px vertical padding)
- **Spacious:** 68px (18px vertical padding)

### Column Alignment
- **Primary text:** Left aligned, #161821
- **Secondary text:** Left aligned below primary, gray
- **Action:** Right aligned, icon or button
- **Avatar:** Left side, 12px gap to text

### Hover/Press State
- **Background:** Opacity 0.7 on press
- **Duration:** 100ms
- **No colored overlay** (just opacity change)

---

## 17. Form & Input Validation

### Error Message Display
- **Color:** `#d53d18` (error red)
- **Font Size:** 13px
- **Margin Top:** 8px (below input)
- **Icon:** Optional (triangle-outline)

### Success State
- **Color:** `#3ddc8c` (success green, same as activity dot)
- **Font Size:** 13px
- **Margin Top:** 8px (below input)

### Field Label
- **Font:** 13px, weight 700
- **Color:** `#161821`
- **Margin Bottom:** 8px
- **Optional Indicator:** "(optional)" in 12px gray

---

## 18. Status & Loading States

### Loading Spinner
- **Component:** `ActivityIndicator` (React Native)
- **Color:** `PRIMARY_COLOR` (pink)
- **Size:** `"small"` (30px) or `"large"` (50px)
- **No background** required

### Loading Skeleton
- **NOT YET IMPLEMENTED** in Home — use cached data + reload
- **Future:** Placeholder cards with opacity 0.5, animated shimmer if needed

### Disabled State
- **Opacity:** 0.5
- **Pointer Events:** Still allow press (to show error message)
- **Cursor:** Not changed (N/A on mobile)

### Progress Indicator
- **Type:** Animated bar or step counter
- **Color:** `PRIMARY_COLOR`
- **Background:** `#f4f4f5`
- **Height:** 4px (thin bar) or full component height

---

## 19. Accessibility Baseline

### Typography
- **Minimum font size:** 11px (labels only)
- **Body text:** 13px minimum
- **Headers:** 24px minimum

### Touch Targets
- **Minimum:** 44x44px (all buttons, icons)
- **Text links:** Underline or high contrast with background

### Color Contrast
- **Text on white:** `#161821` (WCAG AA ✓)
- **Text on primary:** `#fff` (WCAG AAA ✓)
- **Meta text:** `#8a909e` is borderline — avoid on gray backgrounds

### Labels
- All inputs have visible labels (no placeholder-only)
- Form sections are clearly grouped

---

## 20. Dark Mode (Future)

### Not Implemented Yet
- **Baseline:** Light mode only
- **Reserved:** `useColorScheme()` imported but not used
- **Plan:** Invert palette if/when dark mode is added

---

---

# IMPLEMENTATION PRIORITY

## Phase 1: Foundation (Day 1-2)
- [ ] Create `DESIGN_TOKENS.ts` with all spacing, colors, typography variables
- [ ] Create reusable component library (`Button`, `Card`, `Input`, `Modal`)
- [ ] Unify all backgrounds to white (#fff)
- [ ] Standardize all horizontal padding to 22px

## Phase 2: Consistency Pass (Day 2-3)
- [ ] Update Calendar screen background
- [ ] Standardize all inputs across forms
- [ ] Unify modal/sheet styling
- [ ] Fix avatar sizing across screens

## Phase 3: Polish (Day 3-4)
- [ ] Add animation timing utilities
- [ ] Refactor shadows & elevation
- [ ] Standardize empty states
- [ ] Test across all screens

## Phase 4: Verification (Day 4-5)
- [ ] Screenshot each screen
- [ ] Cross-check against design system
- [ ] Verify accessibility (contrast, touch targets)
- [ ] Performance check (no excessive re-renders)

---

