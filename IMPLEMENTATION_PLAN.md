# Design System Implementation Plan

**Timeline:** 4-5 days of focused work  
**Estimated Lines of Code:** 1000-1500 (mostly refactoring, some new components)  
**Complexity:** Medium (straightforward, no business logic changes)

---

## PHASE 1: Foundation & Tokens (Day 1)

### Task 1.1: Create `constants/design-tokens.ts`
**File:** `constants/design-tokens.ts` (new)

This file centralizes all design values used across the app.

```typescript
// Spacing
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
  xxxl: 44,
} as const;

// Typography
export const TYPOGRAPHY = {
  pageHeading: { size: 24, weight: '900', lineHeight: 28, letterSpacing: -0.8 },
  sectionHeader: { size: 11, weight: '800', lineHeight: 13, letterSpacing: 1.4 },
  subheading: { size: 15, weight: '700', lineHeight: 18, letterSpacing: -0.3 },
  body: { size: 13, weight: '500', lineHeight: 18 },
  meta: { size: 12, weight: '600', lineHeight: 16, letterSpacing: 0.2 },
  label: { size: 11, weight: '800', lineHeight: 13, letterSpacing: 1.4 },
  buttonLarge: { size: 15, weight: '800', lineHeight: 18, letterSpacing: -0.2 },
  buttonSmall: { size: 13, weight: '800', lineHeight: 16 },
} as const;

// Colors (from existing constants, plus extended palette)
export const COLORS = {
  primary: '#ff4f74',
  secondary: '#0d90a8',
  primaryLight08: 'rgba(255,79,116,0.08)',
  primaryLight12: 'rgba(255,79,116,0.12)',
  primaryLight20: 'rgba(255,79,116,0.2)',
  
  // Neutrals
  white: '#fff',
  textPrimary: '#161821',
  textSecondary: '#6f7683',
  textMeta: '#8a909e',
  textMuted: '#bbc0c8',
  
  // Backgrounds
  bgPrimary: '#fff',
  bgLight: '#f4f4f5',
  bgInputPlaceholder: '#b0b5c0',
  
  // Borders & Dividers
  borderPrimary: '#e3e5e9',
  borderInput: '#e2e5ee',
  
  // Semantic
  success: '#3ddc8c',
  error: '#d53d18',
  
  // Modal/Overlay
  backdropModal: 'rgba(10,12,18,0.28)',
  backdropFab: 'rgba(17,18,23,0.08)',
} as const;

// Border Radius
export const RADIUS = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 32,
  circle: 999,
} as const;

// Shadows
export const SHADOWS = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 5,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 14,
  },
} as const;

// Animation Timing
export const TIMING = {
  quick: 120,      // ms
  standard: 180,   // ms
  slow: 300,       // ms
  verySlow: 320,   // ms
} as const;
```

**Time:** 30 minutes
**Files Changed:** 1 (new)

---

### Task 1.2: Create Reusable Component: `Button.tsx`
**File:** `components/ui/button.tsx` (new)

Extract button logic and styling into a reusable component.

```typescript
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SPACING, RADIUS, COLORS, TYPOGRAPHY, SHADOWS } from '@/constants/design-tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  size?: 'sm' | 'md' | 'lg' | 'icon';
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  icon?: React.ReactNode;
  loading?: boolean;
}

export function Button({
  label,
  onPress,
  size = 'md',
  variant = 'primary',
  disabled = false,
  icon,
  loading = false,
}: ButtonProps) {
  const sizeMap = {
    sm: { height: 34, paddingHorizontal: 16, fontSize: TYPOGRAPHY.buttonSmall.size },
    md: { height: 52, paddingHorizontal: 18, fontSize: TYPOGRAPHY.buttonLarge.size },
    lg: { height: 60, paddingHorizontal: 20, fontSize: TYPOGRAPHY.buttonLarge.size },
    icon: { height: 44, width: 44, borderRadius: RADIUS.circle },
  };

  const variantStyles = {
    primary: {
      backgroundColor: COLORS.primary,
      borderColor: 'transparent',
      textColor: COLORS.white,
    },
    secondary: {
      backgroundColor: COLORS.white,
      borderColor: COLORS.primary,
      textColor: COLORS.primary,
    },
    outline: {
      backgroundColor: 'transparent',
      borderColor: COLORS.borderPrimary,
      textColor: COLORS.textPrimary,
    },
  };

  return (
    <TouchableOpacity
      disabled={disabled || loading}
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.button,
        sizeMap[size],
        variantStyles[variant],
        disabled && styles.disabled,
      ]}>
      {icon && <View style={{ marginRight: SPACING.md }}>{icon}</View>}
      {!loading && <Text style={[styles.text, { color: variantStyles[variant].textColor }]}>{label}</Text>}
      {loading && <ActivityIndicator color={variantStyles[variant].textColor} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    ...SHADOWS.subtle,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    ...TYPOGRAPHY.buttonLarge,
    fontWeight: TYPOGRAPHY.buttonLarge.weight,
  },
});
```

**Time:** 45 minutes
**Files Changed:** 1 (new)

---

### Task 1.3: Create Reusable Component: `TextInput.tsx`
**File:** `components/ui/text-input.tsx` (new)

Standardized text input with consistent styling.

```typescript
import { StyleSheet, TextInput as RNTextInput, View, Text } from 'react-native';
import { SPACING, RADIUS, COLORS, TYPOGRAPHY } from '@/constants/design-tokens';

interface TextInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  error?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'email-address' | 'numeric';
}

export function TextInput({
  placeholder,
  value,
  onChangeText,
  label,
  error,
  multiline = false,
  maxLength,
  keyboardType = 'default',
}: TextInputProps) {
  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}
      <RNTextInput
        style={[styles.input, error && styles.inputError, multiline && styles.multiline]}
        placeholder={placeholder}
        placeholderTextColor={COLORS.bgInputPlaceholder}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...TYPOGRAPHY.label,
    fontWeight: TYPOGRAPHY.label.weight,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  input: {
    height: 54,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.borderInput,
    backgroundColor: '#f8f9fc',
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.body.size,
    color: COLORS.textPrimary,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  multiline: {
    minHeight: 100,
    paddingVertical: SPACING.lg,
  },
  error: {
    ...TYPOGRAPHY.meta,
    fontWeight: '500',
    color: COLORS.error,
    marginTop: SPACING.md,
  },
});
```

**Time:** 40 minutes
**Files Changed:** 1 (new)

---

## PHASE 2: Calendar Screen Unification (Day 1-2)

### Task 2.1: Update Calendar Background Color
**File:** `app/(tabs)/calendar.tsx`

Change line 33: `const BG = '#F7F3EC';` → `const BG = '#fff';`

**Time:** 5 minutes
**Files Changed:** 1

---

### Task 2.2: Redesign Calendar Date Chips
**File:** `app/(tabs)/calendar.tsx` (lines 208-238)

Replace the custom date chip styling with card-based system.

**Current:**
```jsx
<Pressable
  style={[styles.dateChip, isSelected && styles.dateChipSelected]}
  onPress={() => jumpToSelectedDay(dateKey)}>
  <Text style={[styles.dateChipWeekday, isSelected && { color: PRIMARY_COLOR }]}>
    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase()}
  </Text>
  <Text style={[styles.dateChipDay, isSelected && { color: PRIMARY_COLOR }]}>{date.getDate()}</Text>
  <View style={styles.dateChipDots}>
    {getCalendarDots(items).map((tone, index) => (
      <View
        key={`${dateKey}-${tone}-${index}`}
        style={[...]}
      />
    ))}
  </View>
</Pressable>
```

**New (Card-based):**
```jsx
<Pressable
  style={[
    styles.dateCard,
    isSelected && styles.dateCardSelected,
    { backgroundColor: isSelected ? PRIMARY_08 : COLORS.white },
  ]}
  onPress={() => jumpToSelectedDay(dateKey)}>
  <Text style={[styles.dateWeekday, isSelected && { color: PRIMARY_COLOR }]}>
    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase()}
  </Text>
  <Text style={[styles.dateDay, isSelected && { color: PRIMARY_COLOR }]}>
    {date.getDate()}
  </Text>
  {items.length > 0 && (
    <View style={styles.dateIndicators}>
      {getCalendarDots(items).map((tone, index) => (
        <View key={index} style={[styles.dot, getDotColor(tone)]} />
      ))}
    </View>
  )}
</Pressable>
```

**Updated Styles:**
```javascript
dateCard: {
  width: 54,
  paddingVertical: SPACING.md,
  paddingHorizontal: SPACING.sm,
  borderRadius: RADIUS.sm,
  alignItems: 'center',
  justifyContent: 'center',
  ...SHADOWS.subtle,
},
dateCardSelected: {
  borderWidth: 2,
  borderColor: PRIMARY_COLOR,
},
dateWeekday: {
  ...TYPOGRAPHY.label,
  fontWeight: '800',
  color: COLORS.textMeta,
  fontSize: 10,
},
dateDay: {
  ...TYPOGRAPHY.subheading,
  fontWeight: '700',
  color: COLORS.textPrimary,
  marginTop: 4,
},
dateIndicators: {
  flexDirection: 'row',
  gap: 3,
  marginTop: 6,
},
dot: {
  width: 4,
  height: 4,
  borderRadius: 2,
},
```

**Time:** 45 minutes
**Files Changed:** 1

---

## PHASE 3: Form Standardization (Day 2)

### Task 3.1: Standardize Input Fields in Forms
**Files:** `app/create-trip.tsx`, `app/(tabs)/profile.tsx`, `app/trip/[id]/index.tsx`, `app/trip/[id]/split.tsx`

Replace all manual TextInput styling with reusable `TextInput` component from Task 1.3.

**For each file:**
1. Import `TextInput` from `@/components/ui/text-input`
2. Replace all `<TextInput />` usage with component syntax
3. Remove individual input-related styles from StyleSheet

**Example (create-trip.tsx):**

**Before:**
```jsx
<TextInput
  style={styles.input}
  placeholder="Trip name"
  value={title}
  onChangeText={setTitle}
/>
```

**After:**
```jsx
<TextInput
  label="Trip Name"
  placeholder="e.g. Iceland 2026"
  value={title}
  onChangeText={setTitle}
/>
```

**Time:** 1 hour
**Files Changed:** 4

---

### Task 3.2: Standardize Button Styling
**Files:** All screens with buttons

Replace all manual button styling with `Button` component from Task 1.2.

Focus on:
- Primary buttons (forms, actions)
- Secondary buttons (decline, cancel)
- Icon buttons (close, back)

**Time:** 1.5 hours
**Files Changed:** 8-10 screens

---

## PHASE 4: Modal & Sheet Unification (Day 2-3)

### Task 4.1: Create `ModalHeader` Component
**File:** `components/ui/modal-header.tsx` (new)

```typescript
interface ModalHeaderProps {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  rightAction?: React.ReactNode;
}

export function ModalHeader({ eyebrow, title, onClose, rightAction }: ModalHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
      </View>
      {rightAction}
      <TouchableOpacity
        style={styles.closeButton}
        activeOpacity={0.88}
        onPress={onClose}>
        <Ionicons name="close" size={20} color={COLORS.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  eyebrow: {
    ...TYPOGRAPHY.label,
    fontWeight: '800',
    color: COLORS.textMeta,
  },
  title: {
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

**Time:** 30 minutes
**Files Changed:** 1 (new)

---

### Task 4.2: Update All Modals to Use ModalHeader
**Files:** Home, Trip Detail, Profile, Settings

Replace custom header logic with `ModalHeader` component.

**Time:** 45 minutes
**Files Changed:** 3-4

---

### Task 4.3: Standardize All Modal Padding to 22px
**Files:** All modal-containing files

Audit all modals and ensure `paddingHorizontal: 22` is applied.

**Time:** 30 minutes
**Files Changed:** 3-4

---

## PHASE 5: Card & Shadow System (Day 3)

### Task 5.1: Create `Card` Component
**File:** `components/ui/card.tsx` (new)

```typescript
interface CardProps {
  children: React.ReactNode;
  variant?: 'subtle' | 'medium' | 'strong';
  padding?: 'compact' | 'standard' | 'large';
  borderRadius?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
}

export function Card({
  children,
  variant = 'subtle',
  padding = 'standard',
  borderRadius = 'md',
  onPress,
}: CardProps) {
  const paddingMap = {
    compact: SPACING.md,
    standard: SPACING.lg,
    large: SPACING.xl,
  };

  const radiusMap = {
    sm: RADIUS.sm,
    md: RADIUS.md,
    lg: RADIUS.lg,
  };

  const shadowMap = {
    subtle: SHADOWS.subtle,
    medium: SHADOWS.medium,
    strong: SHADOWS.strong,
  };

  const content = (
    <View
      style={[
        styles.card,
        {
          padding: paddingMap[padding],
          borderRadius: radiusMap[borderRadius],
          ...shadowMap[variant],
        },
      ]}>
      {children}
    </View>
  );

  return onPress ? <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity> : content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
  },
});
```

**Time:** 30 minutes
**Files Changed:** 1 (new)

---

### Task 5.2: Replace All Card Styles with SHADOWS Tokens
**Files:** All screens with cards

Replace inline shadow definitions with SHADOWS constants from design tokens.

**Example:**

**Before:**
```javascript
activityCard: {
  backgroundColor: '#fff',
  borderRadius: 18,
  paddingVertical: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
}
```

**After:**
```javascript
activityCard: {
  backgroundColor: COLORS.white,
  borderRadius: RADIUS.md,
  paddingVertical: SPACING.md,
  ...SHADOWS.subtle,
}
```

**Time:** 1 hour
**Files Changed:** 5-8 screens

---

## PHASE 6: Color Consistency (Day 3-4)

### Task 6.1: Replace All Hardcoded Colors with Constants
**Files:** All files with styles

Replace all inline color strings with COLORS constants.

**Example:**

**Before:**
```javascript
styles.text: { color: '#8a909e' }
```

**After:**
```javascript
styles.text: { color: COLORS.textMeta }
```

**Time:** 1.5 hours
**Files Changed:** All stylesheets

---

### Task 6.2: Fix Divider Colors to Single Color
**Files:** All files with dividers

Replace all divider colors with `COLORS.borderPrimary`.

**Time:** 30 minutes
**Files Changed:** 3-5

---

## PHASE 7: Typography Consistency (Day 4)

### Task 7.1: Create Typography Constants File
**File:** `constants/typography.ts` (if not in design-tokens.ts)

Export pre-built text styles for common use cases:

```typescript
export const textStyles = {
  pageHeading: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
    letterSpacing: -0.8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  // ... etc
};
```

**Time:** 20 minutes
**Files Changed:** 1

---

### Task 7.2: Audit and Standardize All Text Font Sizes
**Files:** All screens

Check every text element against TYPOGRAPHY scale:
- Headers: 24px+
- Subheadings: 15px
- Body: 13px
- Meta: 11-12px

Fix any outliers.

**Time:** 1 hour
**Files Changed:** 8-10

---

## PHASE 8: Avatar System (Day 4)

### Task 8.1: Document Avatar Sizes in Constants
**File:** `constants/design-tokens.ts`

Add avatar size system:

```typescript
export const AVATAR_SIZES = {
  xs: 28,
  sm: 32,
  md: 36,
  lg: 42,
  xl: 48,
  xxl: 56,
} as const;
```

**Time:** 10 minutes
**Files Changed:** 1

---

### Task 8.2: Audit All Avatar Sizes
**Files:** All screens with avatars

Replace hardcoded avatar sizes with AVATAR_SIZES constants.

Document which size is used for each context:
- Activity feed: md (36px)
- BigHeroCard stack: sm (32px)
- Members list: lg (42px)
- Profile header: xl (48px)

**Time:** 45 minutes
**Files Changed:** 3-5

---

## PHASE 9: Empty States (Day 4-5)

### Task 9.1: Create `EmptyState` Component
**File:** `components/ui/empty-state.tsx` (new)

```typescript
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={46} color={COLORS.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {action && <Button label={action.label} onPress={action.onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.lg,
  },
  iconContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.pageHeading,
    fontWeight: '900',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...TYPOGRAPHY.body,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
});
```

**Time:** 30 minutes
**Files Changed:** 1 (new)

---

### Task 9.2: Replace All Empty States with Component
**Files:** Home, Calendar, Trip Detail, Up Next

Replace custom empty state layouts with `EmptyState` component.

**Time:** 45 minutes
**Files Changed:** 3-4

---

## PHASE 10: Final Verification & Polish (Day 5)

### Task 10.1: Screenshot Each Screen
- [ ] Home (with and without trips)
- [ ] Calendar
- [ ] Profile
- [ ] Trip Detail
- [ ] Create Trip
- [ ] Settings
- [ ] Cost Split
- [ ] Onboarding

**Time:** 30 minutes

---

### Task 10.2: Cross-Check Against Design System
- [ ] All backgrounds are white or documented
- [ ] All shadows use SHADOWS tokens
- [ ] All colors use COLORS constants
- [ ] All spacing uses SPACING constants
- [ ] All text matches TYPOGRAPHY scale
- [ ] All border radius uses RADIUS tokens
- [ ] All buttons use Button component
- [ ] All inputs use TextInput component
- [ ] All modals use ModalHeader component
- [ ] All empty states use EmptyState component

**Time:** 1 hour

---

### Task 10.3: Test Accessibility
- [ ] All text has sufficient contrast against backgrounds
- [ ] All buttons are at least 44x44px tap target
- [ ] All form labels are visible (not placeholder-only)
- [ ] All interactive elements have activeOpacity feedback

**Time:** 45 minutes

---

### Task 10.4: Performance Audit
- [ ] No unnecessary re-renders (check with React Devtools)
- [ ] No large shadows causing frame drops
- [ ] Smooth animations (no jank on device)

**Time:** 30 minutes

---

## SUMMARY

| Phase | Tasks | Time | Files |
|-------|-------|------|-------|
| 1: Foundation | 3 | 2.5h | 3 new |
| 2: Calendar | 2 | 1h | 1 modified |
| 3: Forms | 2 | 2.5h | 4 modified |
| 4: Modals | 3 | 2h | 4 modified, 1 new |
| 5: Cards | 2 | 1.5h | 5-8 modified, 1 new |
| 6: Colors | 2 | 2h | All stylesheets |
| 7: Typography | 2 | 1.5h | 8-10 modified, 1 file |
| 8: Avatars | 2 | 1h | 3-5 modified, 1 file |
| 9: Empty States | 2 | 1.25h | 3-4 modified, 1 new |
| 10: Verification | 4 | 2.75h | Review all |
| **TOTAL** | **24** | **17.5h** | **40-50 touched** |

---

## PRIORITY ORDER FOR MERGING

1. **Day 1:** Merge foundation (design-tokens, Button, TextInput)
2. **Day 2:** Merge Calendar + Forms + Modals
3. **Day 3:** Merge Cards + Colors
4. **Day 4:** Merge Typography + Avatars
5. **Day 5:** Merge Empty States + Final Polish

---

## POST-IMPLEMENTATION

- [ ] Update DESIGN_SYSTEM.md as a living document
- [ ] Add to CI/CD: Visual regression tests (screenshot comparisons)
- [ ] Create design system Storybook (future enhancement)
- [ ] Train team on using design tokens instead of hardcoding values

---

