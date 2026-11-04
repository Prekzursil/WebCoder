// Forum — thread list (read) + new-thread composer (post).
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ForumService } from '../../src/services/services';
import { useAuth } from '../../src/state/AuthStore';
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
import { space } from '../../src/theme/tokens';
import { formatDateTime } from '../../src/utils/verdict';
import type { ForumThread } from '../../src/types/api';

export default function ForumIndex() {
  const { status } = useAuth();
  const { t } = useSettings();
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const response = await ForumService.getThreads({ page: targetPage });
        setThreads((prev) =>
          targetPage > 1 ? [...prev, ...response.results] : response.results
        );
        setHasMore(Boolean(response.next));
        setPage(targetPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('forum_load_error'));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const createThread = async () => {
    setPosting(true);
    setError(null);
    try {
      await ForumService.createThread({ title, content });
      setShowNew(false);
      setTitle('');
      setContent('');
      await load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_label'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t('forum_header')}</Txt>
        <Txt variant="caption">{t('forum_subtitle')}</Txt>
      </Card>

      {status === 'authenticated' ? (
        <Button
          title={t('forum_new_thread')}
          onPress={() => setShowNew((v) => !v)}
          variant="ghost"
        />
      ) : null}

      {showNew ? (
        <Card>
          <Field
            placeholder={t('forum_title_label', 'Title')}
            value={title}
            onChangeText={setTitle}
          />
          <Field
            placeholder={t('forum_reply_placeholder', 'Write your post…')}
            value={content}
            onChangeText={setContent}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <Button
            title={posting ? t('loading') : t('forum_post_button', 'Post')}
            onPress={createThread}
            disabled={posting || !title || !content}
          />
        </Card>
      ) : null}

      <ErrorBox message={error} />
      {loading && threads.length === 0 ? <Spinner /> : null}

      {threads.map((thread) => (
        <Link
          key={thread.id}
          href={`/forum/${thread.id}` as never}
          style={{ textDecorationLine: 'none' }}
        >
          <Card>
            <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
              {thread.is_pinned ? (
                <Pill label={t('forum_pinned', 'pinned')} color="#fbbf24" />
              ) : null}
              <Txt variant="section" style={{ flex: 1 }}>
                {thread.title}
              </Txt>
            </View>
            <Txt variant="caption">
              {thread.author ?? '—'} · {thread.post_count} ·{' '}
              {formatDateTime(thread.last_activity)}
            </Txt>
          </Card>
        </Link>
      ))}

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
