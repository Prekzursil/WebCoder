// SecureStore-backed TokenStore — the credential seam ApiClient consumes.
// JWTs live in the Android Keystore / iOS Keychain (never AsyncStorage,
// never the JS-visible filesystem). Null clears the slot.
import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '../services/ApiClient';

const ACCESS_KEY = 'wc_access';
const REFRESH_KEY = 'wc_refresh';

export const secureTokenStore: TokenStore = {
  async getAccess() {
    return SecureStore.getItemAsync(ACCESS_KEY);
  },
  async setAccess(token) {
    if (token === null) {
      await SecureStore.deleteItemAsync(ACCESS_KEY);
    } else {
      await SecureStore.setItemAsync(ACCESS_KEY, token);
    }
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async setRefresh(token) {
    if (token === null) {
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } else {
      await SecureStore.setItemAsync(REFRESH_KEY, token);
    }
  },
};

/** Test/backing-store seam: wipe persisted credentials (logout). */
export async function clearTokens(): Promise<void> {
  await secureTokenStore.setAccess(null);
  await secureTokenStore.setRefresh(null);
}
