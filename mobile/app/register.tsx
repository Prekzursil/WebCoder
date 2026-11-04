import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { useAuth } from '../src/state/AuthStore';
import { useSettings } from '../src/state/SettingsStore';
import { Button, Card, ErrorBox, Field, Screen, Txt } from '../src/ui/primitives';

export default function Register() {
  const { signUp } = useAuth();
  const { t } = useSettings();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp({ username, email, password1, password2 });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_label'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t('register_header')}</Txt>
        <Field
          placeholder={t('username_label')}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <Field
          placeholder={t('email_label')}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          placeholder={t('password_label')}
          secureTextEntry
          value={password1}
          onChangeText={setPassword1}
        />
        <Field
          placeholder={t('password_label')}
          secureTextEntry
          value={password2}
          onChangeText={setPassword2}
        />
        <ErrorBox message={error} />
        <Button
          title={busy ? t('loading') : t('register_button')}
          onPress={submit}
          disabled={busy}
        />
      </Card>
      <Link href="/login">
        <Txt variant="caption" style={{ textAlign: 'center', padding: 12 }}>
          {t('register_link_text')}
        </Txt>
      </Link>
    </Screen>
  );
}
