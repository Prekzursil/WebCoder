// tokenStore — SecureStore-backed TokenStore round-trips (own suite: the
// in-memory keychain mock is per-file, so this file owns its state).
import { clearTokens, secureTokenStore } from "../tokenStore";

it("set/delete round-trips access + refresh through SecureStore", async () => {
  await secureTokenStore.setAccess("X");
  expect(await secureTokenStore.getAccess()).toBe("X");
  await secureTokenStore.setAccess(null);
  expect(await secureTokenStore.getAccess()).toBeNull();
  await secureTokenStore.setRefresh("Y");
  expect(await secureTokenStore.getRefresh()).toBe("Y");
  await secureTokenStore.setRefresh(null);
  expect(await secureTokenStore.getRefresh()).toBeNull();
});

it("clearTokens wipes both slots", async () => {
  await secureTokenStore.setAccess("A");
  await secureTokenStore.setRefresh("R");
  await clearTokens();
  expect(await secureTokenStore.getAccess()).toBeNull();
  expect(await secureTokenStore.getRefresh()).toBeNull();
});
