import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadows } from '@/constants/theme';
import { notificationsApi } from '@/lib/api';

export default function PatientTabsLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 45_000,
  });

  const tabBarHeight = 58 + insets.bottom;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.mutedLight,
          tabBarStyle: {
            height: tabBarHeight,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontFamily: fonts.semibold,
            fontSize: 11,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'home' : 'home-outline'}
                size={22}
                color={(color ?? colors.mutedLight) as string}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="readings"
          options={{
            title: 'History',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'stats-chart' : 'stats-chart-outline'}
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
            tabBarBadgeStyle: {
              backgroundColor: colors.danger,
              fontFamily: fonts.bold,
              fontSize: 10,
            },
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
              <Ionicons
                name={focused ? 'person' : 'person-outline'}
                size={22}
                color={(color ?? colors.mutedLight) as string}
              />
            ),
          }}
        />
      </Tabs>

      <View style={[styles.fabWrap, { bottom: tabBarHeight - 26 }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a blood pressure reading"
          onPress={() => router.push('/reading/new')}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Ionicons name="add" size={30} color={colors.onBrand} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    ...shadows.raised,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
