// Translate this problem — the mobile lane of the i18n wave's community
// translation-contribution entry point (mirrors the web's
// /problems/[problemId]/translate): pick a target language, propose the
// translated title + statement; a verifier reviews it. Reached from the
// problem detail when the user's locale is missing.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ProblemService, TranslationsService } from '../../../src/services/services';
import { useAuth } from '../../../src/state/AuthStore';
import { useSettings } from '../../../src/state/SettingsStore';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Screen,
  SectionLabel,
  Spinner,
  Txt,
} from '../../../src/ui/primitives';
import { palette, space } from '../../../src/theme/tokens';
import type { ProblemType, TranslationLanguageEntry } from '../../../src/types/api';

export default function TranslateProblem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const { t } = useSettings();
  const [problem, setProblem] = useState<ProblemType | null>(null);
  const [languages, setLanguages] = useState<TranslationLanguageEntry[]>([]);
  const [language, setLanguage] = useState('');
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [detail, langs] = await Promise.all([
          ProblemService.getProblemDetail(id),
          TranslationsService.getLanguages(),
        ]);
        setProblem(detail);
        setLanguages(langs.results);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('translate_error'));
      }
    })();
  }, [id, t]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await TranslationsService.propose({
        problemId: id,
        language,
        title,
        statement,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('translate_error'));
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'authenticated') {
    return (
      <Screen>
        <Card>
          <Txt variant="section">{t('translate_login_hint')}</Txt>
        </Card>
      </Screen>
    );
  }

  if (!problem) {
    return <Screen scroll={false}>{error ? <ErrorBox message={error} /> : <Spinner />}</Screen>;
  }

  if (done) {
    return (
      <Screen>
        <Card>
          <Txt variant="body">{t('translate_submitted')}</Txt>
          <Button title={t('classes_back')} onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <Card>
        <Txt variant="title">{t('translate_page_title')}</Txt>
        <Txt variant="caption">{t('translate_intro')}</Txt>
      </Card>

      <Card>
        <SectionLabel>{t('translate_language_label')}</SectionLabel>
        <ScrollView horizontal style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            {languages.map((lang) => (
              <Pressable key={lang.code} onPress={() => setLanguage(lang.code)}>
                <View
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: language === lang.code ? palette.accent : palette.border,
                    backgroundColor: language === lang.code ? palette.accent + '22' : 'transparent',
                  }}
                >
                  <Txt
                    variant="caption"
                    color={language === lang.code ? palette.accent : palette.muted}
                  >
                    {lang.endonym}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Card>

      <Card style={{ flexShrink: 1 }}>
        <SectionLabel>{t('translate_title_label')}</SectionLabel>
        <Field value={title} onChangeText={setTitle} />
        <SectionLabel>{t('translate_statement_label')}</SectionLabel>
        <Field
          multiline
          value={statement}
          onChangeText={setStatement}
          style={{ minHeight: 160, textAlignVertical: 'top' }}
        />
      </Card>

      <ErrorBox message={error} />
      <Button
        title={busy ? t('translate_submitting') : t('translate_submit')}
        onPress={submit}
        disabled={busy || !language || !title.trim() || !statement.trim()}
      />
    </Screen>
  );
}
