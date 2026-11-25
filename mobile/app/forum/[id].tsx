// Thread detail — posts (cursor, oldest-first) + reply composer.
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ForumService } from '../../src/services/services';
import { useAuth } from '../../src/state/AuthStore';
import { useSettings } from '../../src/state/SettingsStore';
import { Button, Card, ErrorBox, Field, Screen, Spinner, Txt } from '../../src/ui/primitives';
import { formatDateTime } from '../../src/utils/verdict';
import { cursorParamFromUrl, type ForumPost, type ForumThread } from '../../src/types/api';

export default function ThreadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const { t } = useSettings();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(
    async (nextCursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const [threadDetail, feed] = await Promise.all([
          thread ? Promise.resolve(thread) : ForumService.getThread(id),
          ForumService.getPosts(id, { cursor: nextCursor }),
        ]);
        setThread(threadDetail);
        setPosts((prev) => (nextCursor ? [...prev, ...feed.results] : feed.results));
        setCursor(cursorParamFromUrl(feed.next));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('forum_load_error'));
      } finally {
        setLoading(false);
      }
    },
    [id, thread, t],
  );

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const postReply = async () => {
    setPosting(true);
    setError(null);
    try {
      await ForumService.createPost(id, { content: reply });
      setReply('');
      await load(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_label'));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Txt variant="title">{thread?.title ?? '…'}</Txt>
        {thread?.problem ? (
          <Txt variant="caption">
            {t('nav_problems')}: #{thread.problem.id}
          </Txt>
        ) : null}
      </Card>

      <ErrorBox message={error} />
      {loading && posts.length === 0 ? <Spinner /> : null}

      {posts.map((post) => (
        <Card key={post.id}>
          <Txt variant="caption">
            {post.author ?? '—'} · {formatDateTime(post.created_at)}
          </Txt>
          <Txt variant="body">{post.content}</Txt>
          {post.is_spoiler ? <Txt variant="micro">spoiler</Txt> : null}
        </Card>
      ))}

      {cursor ? (
        <Button
          title={loading ? t('loading_more') : t('load_more')}
          onPress={() => load(cursor)}
          variant="ghost"
          disabled={loading}
        />
      ) : null}

      {status === 'authenticated' && thread && !thread.is_locked ? (
        <Card>
          <Field
            placeholder={t('forum_reply_placeholder', 'Write your reply…')}
            value={reply}
            onChangeText={setReply}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <Button
            title={posting ? t('loading') : t('forum_reply_button', 'Reply')}
            onPress={postReply}
            disabled={posting || !reply}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
