// Submit — language picker (the expanded 14-language registry), plain code
// editor, or the locked-region partial-code editor for template problems
// (judge-fairness wave E). Submission verdict is polled on the detail page.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ProblemService, PublicService, SubmissionService } from '../../../src/services/services';
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
import {
  composeSubmission,
  initialSlots,
  isPartialCodeProblem,
  parseTemplate,
} from '../../../src/utils/partialCode';
import type { LanguageRow, ProblemType } from '../../../src/types/api';

export default function Submit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useAuth();
  const { t } = useSettings();
  const [problem, setProblem] = useState<ProblemType | null>(null);
  const [registry, setRegistry] = useState<LanguageRow[]>([]);
  const [language, setLanguage] = useState('');
  const [code, setCode] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const segments = useMemo(() => parseTemplate(problem?.code_template), [problem]);

  useEffect(() => {
    (async () => {
      try {
        const [detail, langs] = await Promise.all([
          ProblemService.getProblemDetail(id),
          PublicService.getLanguages(),
        ]);
        setProblem(detail);
        setRegistry(langs.results);
        const allowed = detail.allowed_languages;
        const choices = allowed
          ? langs.results.filter((l) => allowed.includes(l.id))
          : langs.results;
        const preferred =
          choices.find((l) => l.id === detail.code_template_language) ??
          choices.find((l) => l.id === 'python3') ??
          choices[0];
        setLanguage(preferred?.id ?? '');
        if (isPartialCodeProblem(detail)) {
          setSlots(initialSlots(parseTemplate(detail.code_template)));
        } else {
          setCode('// ' + t('code_placeholder'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('problems_load_error'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submit = async () => {
    if (!problem) return;
    setBusy(true);
    setError(null);
    try {
      const finalCode = isPartialCodeProblem(problem) ? composeSubmission(segments, slots) : code;
      const created = await SubmissionService.createSubmission({
        problem: problem.id,
        language,
        code: finalCode,
      });
      router.replace(`/submissions/${created.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error_code_empty'));
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'authenticated') {
    return (
      <Screen>
        <Card>
          <Txt variant="body">{t('error_auth_required_submission')}</Txt>
        </Card>
      </Screen>
    );
  }

  if (!problem) {
    return <Screen scroll={false}>{error ? <ErrorBox message={error} /> : <Spinner />}</Screen>;
  }

  const partial = isPartialCodeProblem(problem);

  return (
    <Screen scroll={false}>
      <Card>
        <SectionLabel>{t('language_label')}</SectionLabel>
        <ScrollView horizontal style={{ flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {registry
              .filter((l) => !problem.allowed_languages || problem.allowed_languages.includes(l.id))
              .map((l) => (
                <Pressable key={l.id} onPress={() => setLanguage(l.id)}>
                  <View
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: language === l.id ? palette.accent : palette.border,
                      backgroundColor: language === l.id ? palette.accent + '22' : 'transparent',
                    }}
                  >
                    <Txt
                      variant="caption"
                      color={language === l.id ? palette.accent : palette.muted}
                    >
                      {l.name}
                    </Txt>
                  </View>
                </Pressable>
              ))}
          </View>
        </ScrollView>
      </Card>

      {partial ? (
        <View style={{ flex: 1, gap: space[2] }}>
          <Txt variant="caption">
            {t('partial_code_hint', 'Locked regions are read-only — fill in the editable parts.')}
          </Txt>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space[2] }}>
            {segments.map((segment, index) =>
              segment.locked ? (
                <Card key={index} style={{ opacity: 0.55 }}>
                  <Txt variant="mono" style={{ opacity: 0.8 }}>
                    {segment.text}
                  </Txt>
                </Card>
              ) : (
                <Field
                  key={index}
                  multiline
                  value={slots[segments.slice(0, index).filter((s) => !s.locked).length] ?? ''}
                  onChangeText={(text) =>
                    setSlots((prev) => {
                      const slotIndex = segments.slice(0, index).filter((s) => !s.locked).length;
                      const next = [...prev];
                      next[slotIndex] = text;
                      return next;
                    })
                  }
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
              ),
            )}
          </ScrollView>
        </View>
      ) : (
        <Field
          multiline
          value={code}
          onChangeText={setCode}
          style={{ flex: 1, textAlignVertical: 'top', fontFamily: 'monospace' }}
        />
      )}

      <ErrorBox message={error} />
      <Button
        title={busy ? t('loading') : t('submit_button')}
        onPress={submit}
        disabled={busy || !language}
      />
    </Screen>
  );
}
