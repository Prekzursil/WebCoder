// SettingsStore tests: device-locale default, persistence, t() binding,
// RTL flagging, provider guard.
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SettingsProvider, useSettings, deviceLocale } from "../SettingsStore";
import {
  LOCALE_GROUPS,
  SUPPORTED_LOCALES,
  localeDirection,
  normalizeUiLocale,
  translate,
} from "../../i18n";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SettingsProvider>{children}</SettingsProvider>
);

beforeEach(() => {
  AsyncStorage.clear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (AsyncStorage as any).__reset?.();
  jest.clearAllMocks();
});

describe("deviceLocale", () => {
  it("normalizes the expo-localization tag", () => {
    expect(deviceLocale()).toBe("en");
  });
});

describe("SettingsProvider", () => {
  it("defaults to the device locale then loads the saved choice", async () => {
    await AsyncStorage.setItem("wc_ui_locale", "ro");
    const { result } = await renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(result.current.locale).toBe("ro"));
    expect(result.current.t("app_title")).toBe("WebCoder");
  });

  it("persists a new locale and interpolates vars", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    await act(async () => {
      await result.current.setLocale("ro");
    });
    expect(await AsyncStorage.getItem("wc_ui_locale")).toBe("ro");
    // RO catalog interpolation: problem_translated_by = "tradus de {{user}}"
    expect(result.current.t("problem_translated_by", { user: "ana" })).toContain("ana");
    // unknown key falls back to the key itself; unknown var stays {{x}}
    expect(result.current.t("missing_key")).toBe("missing_key");
    expect(result.current.t("problem_translated_by", {})).toContain("{{user}}");
  });

  it("flags RTL for ar/fa only", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    expect(result.current.isRTL).toBe(false);
    await act(async () => {
      await result.current.setLocale("ar");
    });
    expect(result.current.isRTL).toBe(true);
  });

  it("throws outside the provider", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(async () => renderHook(() => useSettings())).rejects.toThrow(/SettingsProvider/);
    spy.mockRestore();
  });
});

describe("i18n registry invariants", () => {
  it("covers all 28 locales in exactly one picker group", () => {
    const grouped = LOCALE_GROUPS.flatMap((g) => g.locales);
    expect(new Set(grouped).size).toBe(SUPPORTED_LOCALES.length);
    expect(grouped.sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("translates with EN fallback for every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(translate(locale, "app_title")).toBe("WebCoder");
      expect(translate(locale, "nav_problems")).toBeTruthy();
    }
    // a key only in EN still resolves for other locales
    expect(translate("ro", "app_title")).toBe("WebCoder");
    expect(translate("en", "definitely_missing_key_xyz")).toBe("definitely_missing_key_xyz");
  });
});

describe("normalizeUiLocale edge branches", () => {
  it("maps exact, alias, prefix, neutral-zh, and unknown inputs", () => {
    expect(normalizeUiLocale("ZH-HANT")).toBe("zh-Hant");
    expect(normalizeUiLocale("zh-TW")).toBe("zh-Hant");
    expect(normalizeUiLocale("sr")).toBe("sr-Latn");
    expect(normalizeUiLocale("pt-BR")).toBe("pt");
    expect(normalizeUiLocale("zh")).toBe("zh-Hans");
    expect(normalizeUiLocale("xx-YY")).toBe("en");
    expect(normalizeUiLocale(null)).toBe("en");
    expect(localeDirection("fa")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
  });
});
