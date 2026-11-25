// Assignment detail — the student lane: description, due window, state,
// and the assignment's problem list. Each problem links into the regular
// problem detail → submit flow (verdicts count toward the class grid
// server-side, exactly like the web).
import { Link, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ClassroomService } from '../../../src/services/services';
import { useSettings } from '../../../src/state/SettingsStore';
import {
  Card,
  ErrorBox,
  KeyValue,
  Pill,
  Screen,
  SectionLabel,
  Spinner,
  Txt,
} from '../../../src/ui/primitives';
import { palette, space } from '../../../src/theme/tokens';
import { resolveLocalized } from '../../../src/utils/statement';
import { formatDateTime } from '../../../src/utils/verdict';
import type { ClassroomAssignment } from '../../../src/types/api';

export default function AssignmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useSettings();
  const [assignment, setAssignment] = useState<ClassroomAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setAssignment(await ClassroomService.getAssignment(id));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('classes_load_error'));
      }
    })();
  }, [id, t]);

  if (error && !assignment) {
    return (
      <Screen>
        <ErrorBox message={error} />
      </Screen>
    );
  }
  if (!assignment) {
    return (
      <Screen scroll={false}>
        <Spinner />
      </Screen>
    );
  }

  const problems = [...(assignment.assignment_problems ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  return (
    <Screen>
      <Card>
        <Txt variant="title">{resolveLocalized(assignment.title_i18n, locale).text}</Txt>
        <Txt variant="caption">{assignment.classroom_name}</Txt>
        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
          <Pill label={t(`assignment_state_${assignment.state.toLowerCase()}`)} />
          {assignment.is_exam ? <Pill label={t('tema_exam')} color={palette.orange} /> : null}
        </View>
        {assignment.description ? (
          <Txt variant="body" style={{ marginTop: space[2] }}>
            {assignment.description}
          </Txt>
        ) : null}
      </Card>

      <Card>
        <KeyValue label={t('tema_due')} value={formatDateTime(assignment.due_at)} />
        {assignment.available_from ? (
          <KeyValue
            label={t('assignment_state_scheduled')}
            value={formatDateTime(assignment.available_from)}
          />
        ) : null}
      </Card>

      <SectionLabel>{t('class_teme')}</SectionLabel>
      {problems.length === 0 ? (
        <Card>
          <Txt variant="body">{t('class_no_teme')}</Txt>
        </Card>
      ) : null}
      {problems.map((row) => (
        <Link
          key={row.id}
          href={`/problems/${row.problem}` as never}
          style={{ textDecorationLine: 'none' }}
        >
          <Card>
            <Txt variant="section">
              {row.label}. {resolveLocalized(row.problem_title, locale).text}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Pill label={row.problem_difficulty} />
              <Pill label={t('points_label') + ': ' + row.points} color={palette.accent} />
            </View>
          </Card>
        </Link>
      ))}
    </Screen>
  );
}
