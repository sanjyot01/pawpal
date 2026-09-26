import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { getFocusedRouteNameFromRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { useTelemetryPing } from '../utils/telemetry';
import { usePushNotifications, type PushPayload } from '../utils/push';
import { HomeMapScreen } from '../screens/HomeMapScreen';
import { FindPartnersScreen } from '../screens/FindPartnersScreen';
import { PetBlindDateScreen } from '../screens/PetBlindDateScreen';
import { MarketplaceScreen } from '../screens/MarketplaceScreen';
import { MeProfileScreen } from '../screens/MeProfileScreen';
import { PostInvitationScreen } from '../screens/PostInvitationScreen';
import { PostDateInvitationScreen } from '../screens/PostDateInvitationScreen';
import { DatePetProfileScreen } from '../screens/DatePetProfileScreen';
import { EditDateInvitationScreen } from '../screens/EditDateInvitationScreen';
import { PostMarketItemScreen } from '../screens/PostMarketItemScreen';
import { MarketChatsScreen } from '../screens/MarketChatsScreen';
import { EditInvitationScreen } from '../screens/EditInvitationScreen';
import { ConnectPetProfileScreen } from '../screens/ConnectPetProfileScreen';
import { CompletedWalksScreen } from '../screens/CompletedWalksScreen';
import { CompletedDatesScreen } from '../screens/CompletedDatesScreen';

const Tab = createBottomTabNavigator();

const WalkStack = createStackNavigator();
const WalkNavigator = () => (
  <WalkStack.Navigator screenOptions={{ headerShown: false }}>
    <WalkStack.Screen name="FindPartners" component={FindPartnersScreen} />
    <WalkStack.Screen name="PostInvitation" component={PostInvitationScreen} />
    <WalkStack.Screen name="EditInvitation" component={EditInvitationScreen} />
    <WalkStack.Screen name="ConnectPetProfile" component={ConnectPetProfileScreen} />
    <WalkStack.Screen name="CompletedWalks" component={CompletedWalksScreen} />
  </WalkStack.Navigator>
);

const MarketStack = createStackNavigator();
const MarketNavigator = () => (
  <MarketStack.Navigator screenOptions={{ headerShown: false }}>
    <MarketStack.Screen name="Marketplace" component={MarketplaceScreen} />
    <MarketStack.Screen name="PostMarketItem" component={PostMarketItemScreen} />
    <MarketStack.Screen name="MarketChats" component={MarketChatsScreen} />
  </MarketStack.Navigator>
);

const DateStack = createStackNavigator();
const DateNavigator = () => (
  <DateStack.Navigator screenOptions={{ headerShown: false }}>
    <DateStack.Screen name="PetBlindDate" component={PetBlindDateScreen} />
    <DateStack.Screen name="PostDateInvitation" component={PostDateInvitationScreen} />
    <DateStack.Screen name="DatePetProfile" component={DatePetProfileScreen} />
    <DateStack.Screen name="EditDateInvitation" component={EditDateInvitationScreen} />
    <DateStack.Screen name="CompletedDates" component={CompletedDatesScreen} />
  </DateStack.Navigator>
);

interface TabIconProps {
  emoji: string;
  label: string;
  focused: boolean;
}

const TabIcon: React.FC<TabIconProps> = ({ emoji, label, focused }) => (
  <View style={tabStyles.iconContainer}>
    <Text style={tabStyles.emoji}>{emoji}</Text>
    <Text style={[tabStyles.label, focused ? tabStyles.labelActive : tabStyles.labelInactive]}>
      {label}
    </Text>
  </View>
);

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    width: 60,
  },
  emoji: {
    fontSize: 22,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: COLORS.primary,
  },
  labelInactive: {
    color: COLORS.textMuted,
  },
});

export const TabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  // Report the signed-in user's position into the backend geo index while the app is open.
  useTelemetryPing();
  // Create the Android notification channels and register this device for push.
  // Mounted here (behind auth) because registration needs a valid Bearer token.
  //
  // Tapping a push lands on the list the notification belongs to. The push carries
  // relatedId, but it identifies a match/event/pet — not the walk or date *request* the
  // detail screen is built around — so routing to the filtered list is the honest
  // destination: the item is the first thing on it, and the alternative was doing nothing.
  usePushNotifications(useCallback((payload: PushPayload) => {
    const filter =
      payload.category === 'WALK_REQUEST' ? 'walk'
      : payload.category === 'BLIND_DATE' ? 'date'
      : undefined;
    navigation.navigate('Notifications', filter ? { filter } : undefined);
  }, [navigation]));
  // Sit above the Android system navigation bar (edge-to-edge on Android 15+)
  const tabBarStyle = {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    height: 72 + insets.bottom,
    paddingBottom: 10 + insets.bottom,
  };
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Map"
        component={HomeMapScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🗺️" label="Map" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Walk"
        component={WalkNavigator}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'FindPartners';
          const hideTabBar = ['ConnectPetProfile', 'PostInvitation', 'EditInvitation', 'CompletedWalks'].includes(routeName);
          return {
            // No badge: unread state is shown once, by the bell on the Home map. This dot
            // was also only ever populated while the Walk tab itself was open, so it went
            // stale the moment you were anywhere else.
            tabBarIcon: ({ focused }) => (
              <TabIcon emoji="🚶" label="Walk" focused={focused} />
            ),
            tabBarStyle: hideTabBar ? { display: 'none' as const } : tabBarStyle,
          };
        }}
      />
      <Tab.Screen
        name="Date"
        component={DateNavigator}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'PetBlindDate';
          const hideTabBar = ['PostDateInvitation', 'DatePetProfile', 'EditDateInvitation', 'CompletedDates'].includes(routeName);
          return {
            tabBarIcon: ({ focused }) => (
              <TabIcon emoji="💕" label="Date" focused={focused} />
            ),
            tabBarStyle: hideTabBar ? { display: 'none' as const } : tabBarStyle,
          };
        }}
      />
      <Tab.Screen
        name="Market"
        component={MarketNavigator}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'Marketplace';
          const hideTabBar = ['PostMarketItem', 'MarketChats'].includes(routeName);
          return {
            tabBarIcon: ({ focused }) => (
              <TabIcon emoji="🛍️" label="Market" focused={focused} />
            ),
            tabBarStyle: hideTabBar ? { display: 'none' as const } : tabBarStyle,
          };
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" label="Me" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
