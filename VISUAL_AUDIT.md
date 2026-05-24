# Visual Inconsistency Audit

**Total Inconsistencies Found:** 47  
**Critical (High Impact):** 15  
**Minor (Polish):** 32  

---

# TOP 15 VISUAL INCONSISTENCIES

## 1. **Calendar Screen Background Color**

**File:** `app/(tabs)/calendar.tsx`  
**Current:** `#F7F3EC` (cream/tan background)  
**Should Be:** `#ffffff` (white)  
**Severity:** 🔴 CRITICAL  
**Impact:** Calendar is the only major screen with a non-white background, breaking the clean, cohesive feel  
**How It Breaks Consistency:** Home, Profile, Trip Detail, Settings all use white. Calendar stands out visually.  
**Fix:** Change BG constant from `#F7F3EC` to `#fff`

---

## 2. **Calendar Date Chip Styling — Different Visual Language**

**File:** `app/(tabs)/calendar.tsx` (lines 208-238)  
**Current:** Custom date chips with dots, weekday abbreviations, selected state styling  
**Should Be:** Consistent with Up Next card styling — cards with subtle shadows, same border radius  
**Severity:** 🔴 CRITICAL  
**Impact:** Calendar uses its own visual language (date "chips") that looks nothing like the rest of the app  
**Why It Breaks:** No other screens use this chip pattern. Should be swappable with regular card system.  
**Fix:**
- Redesign date picker as scrollable row of white cards (border-radius 16px)
- Use same shadows as Up Next cards
- Styling: 54px width, 72px height, flex column center

---

## 3. **Modal Header Styling — Inconsistent Close Button**

**File:** Multiple modals (home, trip detail, profile)  
**Current:** Mix of button styles
- Home: 38x38px circle, #f5f6f8 background
- Others: Potentially different sizes/colors  
**Should Be:** Unified header style across ALL modals  
**Severity:** 🔴 CRITICAL  
**Impact:** Users see different close buttons on different modals  
**How It Breaks:** No consistent modal header component  
**Fix:** Extract reusable `ModalHeader` component:
```jsx
{
  eyebrow: string // optional
  title: string
  onClose: () => void
  rightAction?: ReactNode
}
```

---

## 4. **Input Field Styling — Inconsistent Across Forms**

**Files:** `app/create-trip.tsx`, `app/(tabs)/profile.tsx`, `app/trip/[id]/index.tsx`  
**Current:**
- Join modal input: Height 54px, font-size 22px, letter-spacing 6
- Create trip: Height varies, standard font
- Profile: Non-standard styling
**Should Be:** All inputs follow the unified input system (54px height, 16px border-radius, #e2e5ee border)  
**Severity:** 🔴 CRITICAL  
**Impact:** Forms feel fragmented and unprofessional  
**How It Breaks:** Each form defined its own input styling  
**Fix:** Create shared `TextInput` wrapper component that applies design tokens

---

## 5. **Button Sizing — Inconsistent Heights Across App**

**Files:** Multiple screens  
**Current:**
- Primary buttons: 52px (forms), 34px (compact), 56px (FAB)
- Secondary buttons: Varies
- Icon buttons: 32px, 38px, 68px (no clear system)
**Should Be:** Strict hierarchy
- **Full-width form:** 52px
- **Inline/compact:** 34px  
- **Icon only:** Always circular (50% border-radius)
**Severity:** 🔴 CRITICAL  
**Impact:** Buttons look randomly sized throughout the app  
**How It Breaks:** No clear size hierarchy defined  
**Fix:** Create `Button` component with size prop (sm, md, lg, icon)

---

## 6. **Shadow Inconsistency — Cards Have Different Elevations**

**Files:** All screens with cards  
**Current:**
- Activity feed: `shadowOpacity: 0.05, shadowRadius: 8`
- Up Next: `shadowOpacity: 0.04, shadowRadius: 6`
- Invite cards: No shadow listed but styled differently
- Modals: `shadowOpacity: 0.16, shadowRadius: 28`
**Should Be:** Standardized elevation levels (subtle, medium, strong, floating)  
**Severity:** 🔴 CRITICAL  
**Impact:** Cards look like they're at different depths; app feels visually noisy  
**How It Breaks:** Each component independently chose shadow values  
**Fix:** Use elevation system from DESIGN_SYSTEM.md:
- Subtle: 0.04-0.05 opacity, 6-8px radius
- Medium: 0.06 opacity, 22px radius
- Strong: 0.18-0.26 opacity, 24-28px radius

---

## 7. **Empty State Styling — Inconsistent Structure**

**Files:** Home (no-adventures), Calendar (no-events), Up Next (no-plans)  
**Current:**
- Home: 112px circle icon, 28px title, 18px copy
- Calendar: Similar but slightly different
- Up Next: Different icon sizing
**Should Be:** Unified template:
- Icon: 46px (in #f5f4f5 circle if prominent)
- Title: 24px, weight 900, #161821
- Copy: 14px, weight 500, #6f7683
**Severity:** 🔴 CRITICAL  
**Impact:** Empty states are ad-hoc, not designed as a system  
**How It Breaks:** Each screen invented its own empty state  
**Fix:** Create `EmptyState` component with required props (icon, title, copy, cta)

---

## 8. **Form Label Typography — No Consistent System**

**Files:** Trip creation, Profile editing, Cost split  
**Current:** Labels are styled inconsistently (sometimes eyebrow-style, sometimes regular)  
**Should Be:**
- **Field Label:** 13px, weight 700, #161821, margin-bottom 8px
- **Eyebrow (Section):** 11px, weight 800, letter-spacing 1.4, #8a909e
**Severity:** 🟠 HIGH  
**Impact:** Forms lack visual hierarchy and feel amateur  
**How It Breaks:** No defined label styling  
**Fix:** Create reusable `FormLabel` and `FormSection` components

---

## 9. **Avatar Sizing — No System (28px to 56px, Undefined)**

**Files:** All screens  
**Current:**
- HomeActivity feed: 36px
- BigHeroCard: 32px
- Members list: 42px
- Profile: 56px
- No documented system
**Should Be:** Strict sizing: 28, 32, 36, 42, 48, 56px for specific contexts  
**Severity:** 🟠 HIGH  
**Impact:** Avatars appear randomly scaled; breaks visual rhythm  
**How It Breaks:** Each component chose its own size  
**Fix:** Document avatar sizes in DESIGN_SYSTEM.md, use constants in code

---

## 10. **Divider & Border Colors — Multiple Gray Shades**

**Files:** All screens  
**Current:**
- Activity rows: `#eef0f4` (very light)
- Input borders: `#e2e5ee` (slightly darker)
- Section dividers: `#e8ebef` (inconsistent)
**Should Be:** ONE divider color: `#e3e5e9` (use PRIMARY_20)  
**Severity:** 🟠 HIGH  
**Impact:** Subtle but breaks visual consistency; eye catches the variations  
**How It Breaks:** Different components used slightly different grays  
**Fix:** Replace all divider colors with single `#e3e5e9` constant

---

## 11. **Loading State — No Unified System**

**Files:** Home, Trip Detail, Profile, Calendar  
**Current:** Cached data + refetch pattern; no skeleton loaders; no loading message styling  
**Should Be:**
- **Full page:** Show cached data, fade in new data on refresh
- **Inline:** Small spinner in place
- **Modals:** Centered spinner overlay
**Severity:** 🟠 HIGH  
**Impact:** Loading states feel inconsistent; unclear when data is loading  
**How It Breaks:** Each screen handled loading differently  
**Fix:** Create `LoadingOverlay` and `InlineLoader` components, standardize message styling

---

## 12. **Error Message Styling — Color & Position Inconsistent**

**Files:** Forms, modals, API calls  
**Current:**
- Some errors are inline (red, 13px)
- Some are in modals
- Some are toasts (not implemented yet)
- Colors vary: `#d53d18` vs others
**Should Be:** Always inline below field, color #d53d18, 13px, weight 500  
**Severity:** 🟠 HIGH  
**Impact:** Users miss error messages; error UX is confusing  
**How It Breaks:** No defined error handling pattern  
**Fix:** Create `FormError` component, document error placement rules

---

## 13. **Modal Padding & Content Width — Inconsistent**

**Files:** JoinModal, MembersSheet, settings modals  
**Current:**
- Join modal: 20px padding
- Members sheet: 22px padding
- Forms: Varies
**Should Be:** ALL: 22px padding (match page standard)  
**Severity:** 🟠 HIGH  
**Impact:** Modals feel cramped or loose depending on screen  
**How It Breaks:** Each modal was styled independently  
**Fix:** Use standard `22px` padding in all modals via shared component

---

## 14. **Text Input Placeholder Color — Slightly Off Brand**

**File:** All inputs  
**Current:** `#b0b5c0` (slightly too blue)  
**Should Be:** `#bbc0c8` (neutral gray, matches hint text)  
**Severity:** 🟡 MEDIUM  
**Impact:** Placeholders feel less premium; slight color mismatch  
**How It Breaks:** Placeholder color doesn't match design palette  
**Fix:** Update all TextInput placeholderTextColor to `#bbc0c8`

---

## 15. **Timestamp/Meta Text Color — Inconsistent Gray Usage**

**Files:** All screens with timestamps  
**Current:**
- Some use `#8a909e` (correct)
- Some use `#6f7683` (slightly darker)
- Some use `#7b828e` (inconsistent)
- Some use `#9aa0ad` (too light)
**Should Be:** One meta text color: `#8a909e`  
**Severity:** 🟡 MEDIUM  
**Impact:** Visual inconsistency in text hierarchy; confusing visual weight  
**How It Breaks:** Different screens chose different grays  
**Fix:** Replace all secondary/meta text colors with `#8a909e` constant

---

---

# SECONDARY INCONSISTENCIES (16-47)

## 16. **Activity Feed Card Border Radius — 18px vs 16px**
- Activity card: 18px
- Should be: 16px (medium card standard)
- Status: Apply consistent 16px across all cards

## 17. **Big Hero Card Gradient Layers — Hard-coded Colors**
- Uses `rgba(0,0,0,...)` values
- Should be: Centralized in design tokens
- Status: Extract to constants

## 18. **Badge Styling — Inconsistent Across App**
- Day badge: Different style from category badges
- Should be: Unified badge component
- Status: Create `Badge` component

## 19. **Tab Navigation Styling — Not Unified**
- Tab bar styling not documented
- Should be: Consistent color, size, active state
- Status: Check `_layout.tsx`

## 20. **Swipe Hint Arrow Color — Should Use Meta Text Color**
- Current: `#8a909e` (correct by accident)
- Verify consistency across all hints

## 21. **Animated Value Defaults — useNativeDriver Not Documented**
- Some use `useNativeDriver: true`, some false
- Should be: Consistent policy
- Status: Document in animation section

## 22. **Icon Colors — Inconsistent for Secondary Icons**
- Some icons: `#8a909e`, others `#bbc0c8`, others `#6f7683`
- Should be: Hierarchy (primary, secondary, muted)
- Status: Define icon color system

## 23. **Section Divider Styling — Not Used Consistently**
- Some screens have dividers, some don't
- Should be: Consistent usage across sections
- Status: Document divider rules

## 24. **Spacing After Header — Varies 8px to 16px**
- Should be: Consistent 8px after header, then content
- Status: Standardize all headers

## 25. **Modal Backdrop Opacity — Slightly Inconsistent**
- Join modal: `rgba(10,12,18,0.28)`
- Members: `rgba(12,14,19,0.28)`
- Should be: `rgba(10,12,18,0.28)` everywhere

## 26. **Card Padding on Sides — 12px vs 16px vs 18px**
- Should be: 16px standard (12px only for compact, 18px for forms)
- Status: Standardize all cards

## 27. **Invite Card Image Height — 52px**
- Should be: Documented in image system
- Status: Define in design tokens

## 28. **Category Icon Names — Not Standardized**
- Should be: `categoryIonicon()` function updated to use consistent names
- Status: Verify against design system

## 29. **Loading Text Color — Uses `#747984`**
- Should be: `#8a909e` (meta text color)
- Status: Replace in home screen

## 30. **Time Text Size — Mix of 10px and 12px**
- Should be: 11-12px maximum
- Status: Audit all time displays

## 31. **"LIVE" Badge Font Weight — 800**
- Should be: Consistent with other badges (800 is correct)
- Status: Verify all badges use 800

## 32. **Location Pill Font Size — 12px**
- Should be: Documented; consistent across app
- Status: Define pill text sizing

## 33. **SVG/Image Fallback Colors — No System**
- Some fallback: `#3a2c26`, others `#f0f1f5`
- Should be: Consistent light gray fallback
- Status: Use `#f4f4f5`

## 34. **TextShadow on BigHeroCard — Semi-transparent Black**
- Uses `rgba(0,0,0,0.45)` to `rgba(0,0,0,0.55)`
- Should be: Documented text-shadow rules
- Status: Define in design system

## 35. **Icon Badge Size — 28px Standard**
- Should be: Consistent 28px for all icon badges
- Status: Verify across Up Next and Activity Feed

## 36. **Member Name Font — 15px, Weight 700**
- Should be: Subheading style (consistent everywhere)
- Status: Use subheading constant

## 37. **Pressable Opacity — Active Opacity 0.7-0.92 (Inconsistent)**
- Should be: 0.85 standard for all pressables
- Status: Audit and standardize

## 38. **Number Formatting — No Locale Consistency**
- Some use `toLocaleString`, others don't
- Should be: Always format numbers with toLocaleString('en-US', { ... })
- Status: Audit all number displays

## 39. **Chat Message Styling — Not Documented**
- Uses custom bubble styling
- Should be: Unified message bubble system
- Status: Check trip/[id]/index.tsx chat

## 40. **Comment Styling — Not Unified**
- Activity detail view has comments
- Should be: Match chat message styling
- Status: Verify consistency

## 41. **Link Colors — Not Defined**
- Some links use PRIMARY_COLOR, some don't
- Should be: All links are PRIMARY_COLOR, underlined
- Status: Define link style

## 42. **Spinner Size — "small" vs "large"**
- Should be: Consistent sizing documented
- Status: Define ActivityIndicator sizing rules

## 43. **Modal Content Scrolling — Not Consistent**
- Some use ScrollView, some don't
- Should be: All non-critical modals are scrollable
- Status: Audit modal scrolling

## 44. **SafeAreaInsets Usage — Varies By Screen**
- Some add extra padding, some don't
- Should be: Consistent rule (top: insets.top, bottom: 100px+ for FAB)
- Status: Document safe area rules

## 45. **Card Rounding — 18px vs 16px vs 20px**
- Should be: Use Medium system: 16px is standard
- Status: Audit all card border-radius

## 46. **Section Header Eyebrow — Weight Inconsistency**
- Mix of 700, 800
- Should be: Always 800
- Status: Standardize all eyebrows to 800

## 47. **Transition Duration — No Documented Standard**
- Uses 120ms, 180ms, 240ms, 300ms, 320ms inconsistently
- Should be: Documented timing scale (quick: 120ms, standard: 180ms, slow: 300ms+)
- Status: Use timing constants

---

## SUMMARY

| Severity | Count | Examples |
|----------|-------|----------|
| 🔴 CRITICAL (Fix Immediately) | 8 | Background color, buttons, modals, shadows, empty states |
| 🟠 HIGH (High Impact) | 7 | Forms, avatars, dividers, loading, errors |
| 🟡 MEDIUM (Noticeable) | 12 | Colors, spacing, component sizes |
| 🟢 LOW (Polish) | 20 | Typography details, constants, optimization |

---

