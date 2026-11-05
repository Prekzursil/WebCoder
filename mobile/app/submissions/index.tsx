// My submissions — newest-first cursor feed with verdict pills.
import { Link } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { SubmissionService } from "../../src/services/services";
import { useAuth } from "../../src/state/AuthStore";
import { useSettings } from "../../src/state/SettingsStore";
import { Button, Card, ErrorBox, Pill, Screen, Spinner, Txt } from "../../src/ui/primitives";
import { space } from "../../src/theme/tokens";
import { problemTitle } from "../../src/utils/statement";
import { formatDateTime, verdictColor, verdictLabelKey } from "../../src/utils/verdict";
import { cursorParamFromUrl, type SubmissionType } from "../../src/types/api";

export default function MySubmissions() {
  const { status } = useAuth();
  const { t, locale } = useSettings();
  const [items, setItems] = useState<SubmissionType[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const response = await SubmissionService.getSubmissions(
          {},
          { cursor: nextCursor, pageSize: 20 },
        );
        setItems((prev) => (nextCursor ? [...prev, ...response.results] : response.results));
        setCursor(cursorParamFromUrl(response.next));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error_loading_submissions"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (status === "authenticated") load(null);
    else setLoading(false);
  }, [status, load]);

  if (status !== "authenticated") {
    return (
      <Screen>
        <Card>
          <Txt variant="body">{t("error_auth_required_submission")}</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ErrorBox message={error} />
      {loading && items.length === 0 ? <Spinner /> : null}
      {items.map((submission) => (
        <Link
          key={submission.id}
          href={`/submissions/${submission.id}` as never}
          style={{ textDecorationLine: "none" }}
        >
          <Card>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: space[2],
              }}
            >
              <Txt variant="body" style={{ flex: 1 }}>
                #{submission.id} {problemTitle(submission.problem, locale).text}
              </Txt>
              <Pill
                label={t(verdictLabelKey(submission.verdict))}
                color={verdictColor(submission.verdict)}
              />
            </View>
            <Txt variant="caption">
              {submission.language} · {formatDateTime(submission.submission_time)}
            </Txt>
          </Card>
        </Link>
      ))}
      {cursor ? (
        <Button
          title={loading ? t("loading_more") : t("load_more")}
          onPress={() => load(cursor)}
          variant="ghost"
          disabled={loading}
        />
      ) : null}
    </Screen>
  );
}
