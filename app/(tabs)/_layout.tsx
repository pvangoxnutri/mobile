import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarBottom = 0;
  const tabBarHeight = 74 + Math.max(insets.bottom - 6, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [styles.tabBar, { bottom: tabBarBottom, height: tabBarHeight }],
        tabBarItemStyle: styles.tabItem,
        tabBarButton: (props) => <Pressable {...(props as React.ComponentProps<typeof Pressable>)} hitSlop={14} pressRetentionOffset={14} />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={<Ionicons name="home" size={26} color={focused ? '#fff' : '#9fa4ae'} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<Ionicons name="calendar-clear-outline" size={26} color={focused ? '#fff' : '#9fa4ae'} />}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<Ionicons name="notifications-outline" size={25} color={focused ? '#fff' : '#9fa4ae'} />}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={<Ionicons name="person" size={25} color={focused ? '#fff' : '#9fa4ae'} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ focused, icon }: { focused: boolean; icon: React.ReactNode }) {
  if (!focused) {
    return <View style={styles.inactiveIcon}>{icon}</View>;
  }

  return <View style={styles.activeIcon}>{icon}</View>;
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 74,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderTopWidth: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.97)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 10,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4f74',
    shadowColor: '#ff4f74',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 8,
  },
  inactiveIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
