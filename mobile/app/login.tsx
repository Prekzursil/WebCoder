import { Link, router } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { useAuth } from "../src/state/AuthStore";
import { useSettings } from "../src/state/SettingsStore";
import { Button, Card, ErrorBox, Field, Screen, Txt } from "../src/ui/primitives";
import { space } from "../src/theme/tokens";

export default function Login() {
  const { signIn } = useAuth();
  const { t } = useSettings();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t("login_header")}</Txt>
        <View style={{ height: space[4] }} />
        <Field
          placeholder={t("username_label")}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <Field
          placeholder={t("password_label")}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <ErrorBox message={error} />
        <Button title={busy ? t("loading") : t("login_button")} onPress={submit} disabled={busy} />
      </Card>
      <Link href="/register">
        <Txt variant="caption" style={{ textAlign: "center", padding: space[3] }}>
          {t("login_link_text")}
        </Txt>
      </Link>
    </Screen>
  );
}
