// Settings — the full 28-locale language picker (grouped like the web),
// API endpoint display, and account actions.
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { LOCALE_GROUPS, LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES } from "../src/i18n";
import { useAuth } from "../src/state/AuthStore";
import { useSettings } from "../src/state/SettingsStore";
import { Button, Card, Screen, SectionLabel, Txt } from "../src/ui/primitives";
import { palette, space } from "../src/theme/tokens";
import { API_V1_URL } from "../src/services/config";

export default function Settings() {
  const { locale, setLocale, t } = useSettings();
  const { status, signOut } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);

  const pick = async (code: (typeof SUPPORTED_LOCALES)[number]) => {
    setSaving(code);
    await setLocale(code);
    setSaving(null);
  };

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t("language_picker_label")}</Txt>
        <Txt variant="caption">{API_V1_URL}</Txt>
      </Card>

      {LOCALE_GROUPS.map((group) => (
        <Card key={group.labelKey}>
          <SectionLabel>{t(group.labelKey)}</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {group.locales.map((code) => (
              <Pressable key={code} onPress={() => pick(code)}>
                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: locale === code ? palette.accent : palette.border,
                    backgroundColor: locale === code ? palette.accent + "22" : "transparent",
                  }}
                >
                  <Txt variant="caption" color={locale === code ? palette.accent : palette.body}>
                    {LOCALE_NATIVE_NAMES[code]}
                    {saving === code ? " …" : ""}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </View>
        </Card>
      ))}

      {status === "authenticated" ? (
        <Button title={t("nav_logout")} variant="ghost" onPress={() => signOut()} />
      ) : null}
    </Screen>
  );
}
