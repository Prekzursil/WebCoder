// Notifications — cursor feed, mark-read, mark-all-read.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { NotificationService } from '../src/services/services';
import { useAuth } from '../src/state/AuthStore';
import { useSettings } from '../src/state/SettingsStore';
import { Button, Card, ErrorBox, Screen, Spinner, Txt } from '../src/ui/primitives';
import { palette, space } from '../src/theme/tokens';
import { formatDateTime } from '../src/utils/verdict';
import { cursorParamFromUrl, type ApiNotification } from '../src/types/api';

export default function Notifications() {
  const { status } = useAuth();
  const { t } = useSettings();
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const response = await NotificationService.getNotifications({
          cursor: nextCursor,
        });
        setItems((prev) => (nextCursor ? [...prev, ...response.results] : response.results));
        setCursor(cursorParamFromUrl(response.next));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('notifications_load_error'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (status === 'authenticated') load(null);
    else setLoading(false);
  }, [status, load]);

  const markAll = async () => {
    try {
      await NotificationService.markAllRead();
      setItems((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notifications_mark_all_error'));
    }
  };

  const markOne = async (notification: ApiNotification) => {
    if (notification.read_at) return;
    try {
      await NotificationService.markRead(notification.id);
      setItems((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
    } catch {
      // Non-fatal: the badge refreshes on next load.
    }
  };

  if (status !== 'authenticated') {
    return (
      <Screen>
        <Card>
          <Txt variant="body">{t('notifications_login_description')}</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t('notifications_header')}</Txt>
      </Card>
      <Button title={t('notifications_mark_all_read')} onPress={markAll} variant="ghost" />
      <ErrorBox message={error} />
      {loading && items.length === 0 ? <Spinner /> : null}
      {items.map((notification) => (
        <Pressable key={notification.id} onPress={() => markOne(notification)}>
          <Card
            style={{
              borderColor: notification.read_at ? palette.border : palette.accent + '66',
            }}
          >
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Txt variant="body" style={{ flex: 1 }}>
                {String(
                  notification.data.title ?? notification.data.feedback ?? t('nav_notifications'),
                )}
              </Txt>
              <Txt variant="micro" color={palette.accent}>
                {notification.verb}
              </Txt>
            </View>
            <Txt variant="caption">
              {notification.actor ? `${notification.actor} · ` : ''}
              {formatDateTime(notification.created_at)}
            </Txt>
          </Card>
        </Pressable>
      ))}
      {cursor ? (
        <Button
          title={loading ? t('loading_more') : t('load_more')}
          onPress={() => load(cursor)}
          variant="ghost"
          disabled={loading}
        />
      ) : null}
    </Screen>
  );
}
