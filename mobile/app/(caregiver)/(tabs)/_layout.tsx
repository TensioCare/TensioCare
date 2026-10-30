import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { notificationsApi } from '@/lib/api';

export default function CaregiverTabsLayout() {
  const insets = useSafeAreaInsets();
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 45_000,
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.mutedLight,
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={(color ?? colors.mutedLight) as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="patient"
        options={{
          title: 'Patient',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'heart' : 'heart-outline'}
              size={22}
              color={(color ?? colors.mutedLight) as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarBadge: unread.data?.unread ? unread.data.unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'notifications' : 'notifications-outline'}
              size={22}
              color={(color ?? colors.mutedLight) as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={(color ?? colors.mutedLight) as string} />
          ),
        }}
      />
    </Tabs>
  );
}
