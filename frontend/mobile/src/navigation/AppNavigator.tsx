import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TabNavigator } from './TabNavigator';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { WalkRequestDetailScreen } from '../screens/WalkRequestDetailScreen';
import { NotificationDetailScreen } from '../screens/NotificationDetailScreen';
import { OwnerProfileScreen } from '../screens/OwnerProfileScreen';
import { MarketplaceChatScreen } from '../screens/MarketplaceChatScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AddPetScreen } from '../screens/AddPetScreen';
import { EditPetScreen } from '../screens/EditPetScreen';

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  Tabs: undefined;
  Notifications: undefined;
  WalkRequestDetail: { notif?: any; expanded?: boolean };
  NotificationDetail: { notif?: any };
  OwnerProfile: undefined;
  MarketplaceChat: { item?: any };
  EditProfile: undefined;
  AddPet: undefined;
  EditPet: { pet: any };
};

const Stack = createStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="WalkRequestDetail" component={WalkRequestDetailScreen} />
      <Stack.Screen name="NotificationDetail" component={NotificationDetailScreen} />
      <Stack.Screen name="OwnerProfile" component={OwnerProfileScreen} />
      <Stack.Screen name="MarketplaceChat" component={MarketplaceChatScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="AddPet" component={AddPetScreen} />
      <Stack.Screen name="EditPet" component={EditPetScreen} />
    </Stack.Navigator>
  );
};
