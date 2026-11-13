// Contest detail — problems + standings + registration.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ContestService } from '../../src/services/services';
import { useAuth } from '../../src/state/AuthStore';
import { useSettings } from '../../src/state/SettingsStore';
import {
  Button,
  Card,
  ErrorBox,
  KeyValue,
  Screen,
  SectionLabel,
  Spinner,
  Txt,
} from '../../src/ui/primitives';
import { space } from '../../src/theme/tokens';
import { resolveLocalized } from '../../src/utils/statement';
import type { Contest } from '../../src/types/api';

export default function ContestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const { t, locale } = useSettings();
  const [contest, setContest] = useState<Contest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    ContestService.getContest(id)
      .then(setContest)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t('contest_load_error')),
      );
  }, [id, t]);

  const register = async () => {
    setRegistering(true);
    setError(null);
    try {
      await ContestService.register(id);
      setContest(await ContestService.getContest(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_label'));
    } finally {
      setRegistering(false);
    }
  };

  if (error && !contest) {
    return (
      <Screen>
        <ErrorBox message={error} />
      </Screen>
    );
  }
  if (!contest) {
    return (
      <Screen scroll={false}>
        <Spinner />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Txt variant="title">{resolveLocalized(contest.title_i18n, locale).text}</Txt>
        <KeyValue label={t('time_label')} value={`${contest.start_at} → ${contest.end_at}`} />
        <KeyValue
          label={t('contest_participants_count', { count: contest.participant_count })}
          value={String(contest.participant_count)}
        />
      </Card>

      <ErrorBox message={error} />

      {contest.contest_problems && contest.contest_problems.length > 0 ? (
        <Card>
          <SectionLabel>{t('assignment_problems')}</SectionLabel>
          {contest.contest_problems.map((row) => (
            <View key={row.id} style={{ paddingVertical: space[1] }}>
              <Txt variant="body">
                {row.label}. {resolveLocalized(row.problem_title, locale).text} ({row.points})
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}

      {status === 'authenticated' && !contest.my_participation ? (
        <Button
          title={registering ? t('loading') : t('contest_register')}
          onPress={register}
          disabled={registering}
        />
      ) : null}
    </Screen>
  );
}
