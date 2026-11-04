// Problem catalog — search + difficulty/status filters + paging.
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ProblemService } from '../../src/services/services';
import { useSettings } from '../../src/state/SettingsStore';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Pill,
  Screen,
  Spinner,
  Txt,
} from '../../src/ui/primitives';
import { palette, space } from '../../src/theme/tokens';
import { problemTitle } from '../../src/utils/statement';
import type { ProblemType } from '../../src/types/api';

const DIFFICULTIES = ['', 'EASY', 'MEDIUM', 'HARD'];

export default function Problems() {
  const { t, locale } = useSettings();
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProblemType[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const response = await ProblemService.getProblems(
          { search, difficulty, status: 'APPROVED' },
          { page: targetPage, pageSize: 20 }
        );
        setItems((prev) =>
          append ? [...prev, ...response.results] : response.results
        );
        setHasMore(Boolean(response.next));
        setPage(targetPage);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('problems_load_error')
        );
      } finally {
        setLoading(false);
      }
    },
    [search, difficulty, t]
  );

  useEffect(() => {
    // Debounce the search box.
    const timer = setTimeout(() => load(1, false), 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Screen>
      <Field
        placeholder={t('problems_search_placeholder')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        {DIFFICULTIES.map((d) => (
          <Pressable key={d || 'all'} onPress={() => setDifficulty(d)}>
            <Pill
              label={
                d === ''
                  ? t('forum_filter_all')
                  : t(`difficulty_${d.toLowerCase()}`)
              }
              color={difficulty === d ? palette.accent : palette.muted}
            />
          </Pressable>
        ))}
      </View>

      <ErrorBox message={error} />
      {loading && items.length === 0 ? <Spinner /> : null}

      {items.map((problem) => (
        <Link
          key={problem.id}
          href={`/problems/${problem.id}` as never}
          style={{ textDecorationLine: 'none' }}
        >
          <Card>
            <Txt variant="section">
              {problem.id}. {problemTitle(problem, locale).text}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
              <Pill
                label={t(`difficulty_${problem.difficulty.toLowerCase()}`)}
                color={
                  problem.difficulty === 'EASY'
                    ? palette.success
                    : problem.difficulty === 'HARD'
                      ? palette.danger
                      : palette.warn
                }
              />
              {problem.tags?.slice(0, 2).map((tag) => (
                <Pill
                  key={tag.id}
                  label={tag.name_i18n[locale] ?? tag.name_i18n.en ?? tag.slug}
                />
              ))}
            </View>
          </Card>
        </Link>
      ))}

      {hasMore ? (
        <Button
          title={loading ? t('loading_more') : t('load_more')}
          onPress={() => load(page + 1, true)}
          variant="ghost"
          disabled={loading}
        />
      ) : null}
    </Screen>
  );
}
