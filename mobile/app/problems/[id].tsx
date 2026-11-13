// Problem detail — user-locale statement with EN fallback, sample cases,
// limits + per-language effective limits (judge fairness), and the
// translation-contribution entry point when the statement is EN-only.
import { Link, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { ProblemService, PublicService, TranslationsService } from "../../src/services/services";
import { useSettings } from "../../src/state/SettingsStore";
import {
  Button,
  Card,
  ErrorBox,
  KeyValue,
  Screen,
  SectionLabel,
  Spinner,
  Txt,
} from "../../src/ui/primitives";
import { palette, space } from "../../src/theme/tokens";
import {
  needsTranslation,
  problemStatement,
  problemTitle,
  translationCredit,
} from "../../src/utils/statement";
import { effectiveLimitsForProblem, formatLimitKb, formatLimitMs } from "../../src/utils/limits";
import type { LanguageRow, ProblemType, TranslationLanguageEntry } from "../../src/types/api";

export default function ProblemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useSettings();
  const [problem, setProblem] = useState<ProblemType | null>(null);
  const [registry, setRegistry] = useState<LanguageRow[]>([]);
  const [transLangs, setTransLangs] = useState<TranslationLanguageEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [detail, langs] = await Promise.all([
          ProblemService.getProblemDetail(id),
          PublicService.getLanguages().catch(() => ({
            results: [] as LanguageRow[],
          })),
        ]);
        setProblem(detail);
        setRegistry(langs.results);
        if (needsTranslation(detail, locale)) {
          // The i18n wave's contribution entry point: the translatable-
          // language list powers the "translate this problem" affordance.
          const translatable = await TranslationsService.getLanguages().catch(() => ({
            results: [] as TranslationLanguageEntry[],
          }));
          setTransLangs(translatable.results);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("problems_load_error"));
      }
    })();
  }, [id, locale, t]);

  if (error) {
    return (
      <Screen>
        <ErrorBox message={error} />
      </Screen>
    );
  }
  if (!problem) {
    return (
      <Screen scroll={false}>
        <Spinner />
      </Screen>
    );
  }

  const title = problemTitle(problem, locale);
  const statement = problemStatement(problem, locale);
  const credit = translationCredit(problem, statement.resolvedLocale);
  const samples = (problem.test_cases ?? []).filter((tc) => tc.is_sample);
  const limits = effectiveLimitsForProblem(problem, registry);

  return (
    <Screen>
      <Card>
        <Txt variant="title">
          {problem.id}. {title.text}
        </Txt>
        {needsTranslation(problem, locale) ? (
          <Txt variant="caption" color={palette.muted}>
            {t("translate_from_english")}
          </Txt>
        ) : null}
        {credit ? <Txt variant="micro">{t("problem_translated_by", { user: credit })}</Txt> : null}
      </Card>

      <Card>
        <SectionLabel>{t("problem_statement_header")}</SectionLabel>
        <Txt variant="body" style={{ lineHeight: 22 }}>
          {statement.text || t("empty_statement")}
        </Txt>
        {needsTranslation(problem, locale) && transLangs.length > 0 ? (
          <Txt variant="caption" color={palette.accent} style={{ marginTop: space[3] }}>
            {t("problem_help_translate")} — {t("translate_page_title")}
          </Txt>
        ) : null}
      </Card>

      <Card>
        <KeyValue
          label={t("time_limit_label")}
          value={formatLimitMs(problem.default_time_limit_ms ?? 1000)}
        />
        <KeyValue
          label={t("memory_limit_label")}
          value={formatLimitKb(problem.default_memory_limit_kb ?? 262144)}
        />
        {problem.io_mode === "FILES" ? (
          <KeyValue
            label={t("io_mode_label", "I/O")}
            value={`${problem.io_input_filename ?? ""} / ${problem.io_output_filename ?? ""}`}
          />
        ) : null}
      </Card>

      {limits.length > 0 ? (
        <Card>
          <SectionLabel>
            {t("effective_limits_header", "Effective limits per language")}
          </SectionLabel>
          <View style={{ gap: space[1] }}>
            {limits.map((limit) => (
              <View
                key={limit.language}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Txt variant="mono">{limit.language}</Txt>
                <Txt variant="mono">
                  {formatLimitMs(limit.timeMs)} · {formatLimitKb(limit.memoryKb)}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {samples.length > 0 ? (
        <Card>
          <SectionLabel>{t("sample_test_cases_header")}</SectionLabel>
          {samples.map((tc, index) => (
            <View key={tc.id ?? index} style={{ marginBottom: space[3] }}>
              <Txt variant="micro">
                {t("sample_input_label")} {index + 1}
              </Txt>
              <Txt variant="mono">{tc.input_data}</Txt>
              <Txt variant="micro">
                {t("sample_output_label")} {index + 1}
              </Txt>
              <Txt variant="mono">{tc.expected_output_data}</Txt>
            </View>
          ))}
        </Card>
      ) : null}

      <Link href={`/problems/${problem.id}/submit` as never}>
        <Button title={t("submit_solution_header")} onPress={() => {}} />
      </Link>
    </Screen>
  );
}
