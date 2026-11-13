import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../src/state/SettingsStore';
import { AuthProvider } from '../src/state/AuthStore';
import { palette } from '../src/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: palette.bg },
              headerTintColor: palette.foreground,
              contentStyle: { backgroundColor: palette.bg },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'WebCoder' }} />
            <Stack.Screen name="login" options={{ title: 'Login' }} />
            <Stack.Screen name="register" options={{ title: 'Register' }} />
            <Stack.Screen name="problems/index" options={{ title: 'Problems' }} />
            <Stack.Screen name="problems/[id]" options={{ title: 'Problem' }} />
            <Stack.Screen name="problems/[id]/submit" options={{ title: 'Submit' }} />
            <Stack.Screen name="submissions/index" options={{ title: 'My Submissions' }} />
            <Stack.Screen name="submissions/[id]" options={{ title: 'Submission' }} />
            <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
            <Stack.Screen name="forum/index" options={{ title: 'Forum' }} />
            <Stack.Screen name="forum/[id]" options={{ title: 'Thread' }} />
            <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
            <Stack.Screen name="contests/index" options={{ title: 'Contests' }} />
            <Stack.Screen name="contests/[id]" options={{ title: 'Contest' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
