// Submission detail — verdict polling while PENDING/COMPILING/RUNNING
// (1s x5 then 2s, web parity) and the per-test result table.
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SubmissionService } from '../../src/services/services';
import { useSettings } from '../../src/state/SettingsStore';
import {
  Card,
  ErrorBox,
  KeyValue,
  Screen,
  SectionLabel,
  Spinner,
  Txt,
} from '../../src/ui/primitives';
import { palette, space } from '../../src/theme/tokens';
import {
  formatDateTime,
  formatKb,
  formatMs,
  pollDelayMs,
  verdictColor,
  verdictInProgress,
  verdictLabelKey,
} from '../../src/utils/verdict';
import type { GetSubmissionDetailResponse } from '../../src/types/api';

export default function SubmissionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSettings();
  const [data, setData] = useState<GetSubmissionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const detail = await SubmissionService.getSubmissionDetail(id);
      setData(detail);
      setError(null);
      return detail;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('submission_not_found'));
      return null;
    }
  }, [id, t]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const step = async () => {
      const detail = await poll();
      if (!alive) return;
      if (detail && verdictInProgress(detail.verdict)) {
        attemptRef.current += 1;
        timer = setTimeout(step, pollDelayMs(attemptRef.current));
      }
    };
    step();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [poll]);

  if (error && !data) {
    return (
      <Screen>
        <ErrorBox message={error} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen scroll={false}>
        <Spinner />
      </Screen>
    );
  }

  const inProgress = verdictInProgress(data.verdict);

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Txt variant="title">#{data.id}</Txt>
          <Txt variant="section" color={verdictColor(data.verdict)}>
            {t(verdictLabelKey(data.verdict))}
          </Txt>
        </View>
        <KeyValue label={t('language_label')} value={data.language} />
        <KeyValue label={t('time_label')} value={formatDateTime(data.submission_time)} />
        {data.execution_time_ms != null ? (
          <KeyValue label={t('time_th')} value={formatMs(data.execution_time_ms)} />
        ) : null}
        {data.memory_used_kb != null ? (
          <KeyValue label={t('memory_used_label')} value={formatKb(data.memory_used_kb)} />
        ) : null}
        {inProgress ? (
          <Txt variant="caption" color={palette.accent}>
            {t('submission_successful_pending')}
          </Txt>
        ) : null}
      </Card>

      {data.test_results && data.test_results.length > 0 ? (
        <Card>
          <SectionLabel>{t('tests_label', 'Tests')}</SectionLabel>
          {data.test_results.map((result, index) => (
            <View key={result.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space[1] }}>
              <Txt variant="mono">#{result.test_case_details.order ?? index + 1}</Txt>
              <Txt variant="mono" color={verdictColor(result.verdict)}>
                {result.verdict}
              </Txt>
              <Txt variant="mono">
                {result.execution_time_ms != null ? formatMs(result.execution_time_ms) : '—'}
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionLabel>{t('code_editor_label')}</SectionLabel>
        <Txt variant="mono">{data.code}</Txt>
      </Card>
    </Screen>
  );
}
