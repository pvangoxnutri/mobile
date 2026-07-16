import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  calendar: 'calendar-clear-outline',
  profile: 'person',
};

const PILL_SIZE = 50;
const TAB_BAR_PADDING_H = 10;
const TAB_BAR_PADDING_TOP = 10;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
      tabBar={(props) => <PremiumTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

function PremiumTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Exact pre-theming light value (not a token) — light must stay
  // pixel-identical; dark uses the muted text tone.
  const inactiveIconColor = theme.isDark ? theme.colors.textMeta : '#9fa4ae';
  const [containerWidth, setContainerWidth] = useState(0);
  const pillTranslateX = useRef(new Animated.Value(0)).current;
  const isFirstLayout = useRef(true);

  // Fixed, symmetric height — was 74 + extra safe-area height with the icons
  // pinned to the top (alignItems: 'flex-start'), which made the pill read
  // as lopsided: ~10px of breathing room above the icons but 30-40px below
  // them. The icons now sit dead-center in a pill that's only as tall as it
  // needs to be; the safe-area clearance moves to bottomGap below instead —
  // a margin OUTSIDE the pill, not extra (asymmetric) height inside it.
  const tabBarHeight = TAB_BAR_PADDING_TOP * 2 + PILL_SIZE;
  const bottomGap = Math.max(insets.bottom - 16, 10);

  // Compute target X for the active tab whenever index or width changes.
  useEffect(() => {
    if (containerWidth === 0) return;
    const innerWidth = containerWidth - 2 * TAB_BAR_PADDING_H;
    const tabWidth = innerWidth / state.routes.length;
    const tabCenterX = TAB_BAR_PADDING_H + tabWidth * (state.index + 0.5);
    const targetX = tabCenterX - PILL_SIZE / 2;

    if (isFirstLayout.current) {
      // First measurement → snap without animation so initial render isn't
      // a slide from left edge.
      pillTranslateX.setValue(targetX);
      isFirstLayout.current = false;
      return;
    }

    Animated.timing(pillTranslateX, {
      toValue: targetX,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state.index, containerWidth, state.routes.length, pillTranslateX]);

  function onLayout(e: LayoutChangeEvent) {
    setContainerWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={[styles.tabBar, { height: tabBarHeight, bottom: bottomGap }]} onLayout={onLayout}>
      {/* Sliding pill behind icons. Rendered first so icons sit on top. */}
      {containerWidth > 0 ? (
        <Animated.View
          style={[
            styles.pill,
            {
              backgroundColor: theme.colors.primary,
              shadowColor: theme.colors.primary,
              transform: [{ translateX: pillTranslateX }],
            },
          ]}
        />
      ) : null}

      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const iconName = TAB_ICONS[route.name] ?? 'ellipse';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            hitSlop={14}
            pressRetentionOffset={14}
            style={styles.tabItem}>
            <Ionicons name={iconName} size={26} color={focused ? theme.colors.white : inactiveIconColor} />
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    paddingTop: TAB_BAR_PADDING_TOP,
    paddingBottom: 10,
    paddingHorizontal: TAB_BAR_PADDING_H,
    flexDirection: 'row',
    alignItems: 'center', // symmetric now — height exactly fits the icon row
    borderTopWidth: 0,
    borderRadius: 999,
    // Near-opaque surface pill; dark separates from the page via a hairline
    // ring instead of the big drop shadow.
    backgroundColor: theme.colors.surfaceBar,
    borderWidth: theme.isDark ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.borderPrimary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.35 : 0.07,
    shadowRadius: 20,
    elevation: theme.isDark ? 0 : 10,
  },
  tabItem: {
    flex: 1,
    height: PILL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pill: {
    position: 'absolute',
    top: TAB_BAR_PADDING_TOP, // aligns with tabItem y-position
    left: 0, // visual x controlled via translateX
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: PILL_SIZE / 2,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 8,
  },
});
