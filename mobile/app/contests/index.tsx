// Contests — state tabs (running/upcoming/finished) + list.
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ContestService } from '../../src/services/services';
import { useSettings } from '../../src/state/SettingsStore';
import { Card, ErrorBox, Pill, Screen, Spinner, Txt } from '../../src/ui/primitives';
import { palette, space } from '../../src/theme/tokens';
import { resolveLocalized } from '../../src/utils/statement';
import { formatDateTime } from '../../src/utils/verdict';
import type { Contest } from '../../src/types/api';

const STATES: Array<'RUNNING' | 'UPCOMING' | 'FINISHED' | undefined> = [
  undefined,
  'RUNNING',
  'UPCOMING',
  'FINISHED',
];

export default function ContestsIndex() {
  const { t, locale } = useSettings();
  const [state, setState] = useState<'RUNNING' | 'UPCOMING' | 'FINISHED' | undefined>(undefined);
  const [items, setItems] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ContestService.getContests(state ? { state } : {});
      setItems(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('contest_load_error'));
    } finally {
      setLoading(false);
    }
  }, [state, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        {STATES.map((s) => (
          <Pressable key={s ?? 'all'} onPress={() => setState(s)}>
            <Pill
              label={
                s === undefined ? t('forum_filter_all') : t(`contest_state_${s.toLowerCase()}`)
              }
              color={state === s ? palette.accent : palette.muted}
            />
          </Pressable>
        ))}
      </View>

      <ErrorBox message={error} />
      {loading ? <Spinner /> : null}

      {items.map((contest) => (
        <Link
          key={contest.id}
          href={`/contests/${contest.id}` as never}
          style={{ textDecorationLine: 'none' }}
        >
          <Card>
            <Txt variant="section">{resolveLocalized(contest.title_i18n, locale).text}</Txt>
            <Txt variant="caption">
              {formatDateTime(contest.start_at)} → {formatDateTime(contest.end_at)}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Pill label={t(`contest_state_${contest.state.toLowerCase()}`)} />
              {contest.is_rated ? <Pill label={t('contest_rated')} color={palette.orange} /> : null}
              <Pill label={t('contest_problems_count', { count: contest.problem_count })} />
            </View>
          </Card>
        </Link>
      ))}
    </Screen>
  );
}
