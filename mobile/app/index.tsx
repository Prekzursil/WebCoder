// Home hub — signed-in state, quick navigation, unread-notification badge.
import { Link } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "../src/state/AuthStore";
import { useSettings } from "../src/state/SettingsStore";
import { NotificationService } from "../src/services/services";
import { Button, Card, Screen, Spinner, Txt } from "../src/ui/primitives";
import { palette, space } from "../src/theme/tokens";

function HubLink({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <Link href={href as never} style={{ textDecorationLine: "none" }}>
      <Card>
        <Txt variant="section" color={palette.accent}>
          {label}
        </Txt>
        {hint ? <Txt variant="caption">{hint}</Txt> : null}
      </Card>
    </Link>
  );
}

export default function Home() {
  const { user, status, signOut } = useAuth();
  const { t } = useSettings();
  const [unread, setUnread] = useState<number | null>(null);

  const loadUnread = useCallback(async () => {
    if (status !== "authenticated") {
      setUnread(null);
      return;
    }
    try {
      const { count } = await NotificationService.getUnreadCount();
      setUnread(count);
    } catch {
      setUnread(null);
    }
  }, [status]);

  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  if (status === "bootstrapping") {
    return (
      <Screen scroll={false}>
        <Spinner />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t("app_title")}</Txt>
        {status === "authenticated" && user ? (
          <>
            <Txt variant="body">
              {t("username_label")}: {user.username}
            </Txt>
            {unread !== null && unread > 0 ? (
              <Txt variant="caption" color={palette.accent}>
                {t("notifications_new_count", { count: unread })}
              </Txt>
            ) : null}
          </>
        ) : (
          <Txt variant="caption">{t("home_hero_subtitle", "Practice. Compete. Learn.")}</Txt>
        )}
      </Card>

      <View style={{ gap: space[3] }}>
        <HubLink href="/problems" label={t("nav_problems")} />
        <HubLink href="/submissions" label={t("nav_my_submissions")} />
        <HubLink href="/leaderboard" label={t("nav_leaderboard")} />
        <HubLink href="/forum" label={t("nav_forum")} />
        <HubLink href="/contests" label={t("nav_contests")} />
        {status === "authenticated" ? (
          <HubLink href="/notifications" label={t("nav_notifications")} />
        ) : null}
        <HubLink href="/settings" label={t("language_picker_label", "Settings")} />
      </View>

      {status === "authenticated" ? (
        <Button title={t("nav_logout")} variant="ghost" onPress={() => signOut()} />
      ) : (
        <View style={{ flexDirection: "row", gap: space[3] }}>
          <Link href="/login" style={{ flex: 1 }}>
            <Button title={t("nav_login")} onPress={() => {}} />
          </Link>
          <Link href="/register" style={{ flex: 1 }}>
            <Button title={t("nav_register")} onPress={() => {}} />
          </Link>
        </View>
      )}
    </Screen>
  );
}
