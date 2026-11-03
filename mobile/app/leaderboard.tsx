// Leaderboard — public standings with paging.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { LeaderboardService } from '../src/services/services';
import { useSettings } from '../src/state/SettingsStore';
import { Button, Card, ErrorBox, Screen, Spinner, Txt } from '../src/ui/primitives';
import { space } from '../src/theme/tokens';
import { ratingColor } from '../src/theme/tokens';
import type { LeaderboardEntry } from '../src/types/api';

export default function Leaderboard() {
  const { t } = useSettings();
  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await LeaderboardService.getLeaderboard({
          page: targetPage,
        });
        setItems((prev) =>
          targetPage > 1 ? [...prev, ...response.results] : response.results
        );
        setHasMore(Boolean(response.next));
        setPage(targetPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('leaderboard_load_error'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t('leaderboard_header')}</Txt>
        <Txt variant="caption">{t('leaderboard_subtitle')}</Txt>
      </Card>
      <ErrorBox message={error} />
      {loading && items.length === 0 ? <Spinner /> : null}
      {items.map((entry) => (
        <Card key={entry.username}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="body">
              {entry.rank}. {entry.username}
            </Txt>
            <Txt variant="body" color={ratingColor(entry.total_points)}>
              {t('leaderboard_points')}: {entry.total_points}
            </Txt>
          </View>
          <Txt variant="caption">
            {t('leaderboard_solved')}: {entry.solved_count} ·{' '}
            {t('leaderboard_success_rate')}:{' '}
            {(entry.success_rate * 100).toFixed(0)}%
          </Txt>
        </Card>
      ))}
      <View style={{ height: space[2] }} />
      {hasMore ? (
        <Button
          title={loading ? t('loading_more') : t('load_more')}
          onPress={() => load(page + 1)}
          variant="ghost"
          disabled={loading}
        />
      ) : null}
    </Screen>
  );
}
