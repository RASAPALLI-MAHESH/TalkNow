import { createNavigationContainerRef, type ParamListBase } from '@react-navigation/native';

// Lets code outside screens (e.g. tapping a push notification) navigate.
export const navigationRef = createNavigationContainerRef<ParamListBase>();
