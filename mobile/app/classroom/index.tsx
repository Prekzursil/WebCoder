// Classroom — the student lane (Wave B surfaces): my classes with their
// open-teme counts, and my homework (assignments) with state + due date.
// Tapping a PROBLEMS assignment opens its problem list; each problem
// links into the regular problem detail → submit flow.
import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ClassroomService } from '../../src/services/services';
import { useAuth } from '../../src/state/AuthStore';
import { useSettings } from '../../src/state/SettingsStore';
import { Card, ErrorBox, Pill, Screen, SectionLabel, Spinner, Txt } from '../../src/ui/primitives';
import { palette, space } from '../../src/theme/tokens';
import { resolveLocalized } from '../../src/utils/statement';
import { formatDateTime } from '../../src/utils/verdict';
import type { ClassroomAssignment, MyClassRow } from '../../src/types/api';

export default function ClassroomIndex() {
  const { status } = useAuth();
  const { t, locale } = useSettings();
  const [classes, setClasses] = useState<MyClassRow[]>([]);
  const [assignments, setAssignments] = useState<ClassroomAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [mine, homework] = await Promise.all([
        ClassroomService.getMyClasses(),
        ClassroomService.getMyAssignments(),
      ]);
      setClasses(mine.results);
      setAssignments(homework.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('classes_load_error'));
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (status !== 'authenticated') {
    return (
      <Screen>
        <Card>
          <Txt variant="section">{t('classes_login_required')}</Txt>
          <Txt variant="caption">{t('classes_login_hint')}</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t('classes_title')}</Txt>
        <Txt variant="caption">{t('classes_subtitle')}</Txt>
      </Card>

      <ErrorBox message={error} />
      {loading ? <Spinner /> : null}

      <SectionLabel>{t('classes_enrolled')}</SectionLabel>
      {classes.length === 0 && !loading ? (
        <Card>
          <Txt variant="body">{t('classes_none')}</Txt>
          <Txt variant="caption">{t('classes_none_hint')}</Txt>
        </Card>
      ) : null}
      {classes.map((row) => (
        <Card key={row.membership_id}>
          <Txt variant="section">{row.classroom.name}</Txt>
          <Txt variant="caption">{row.classroom.teacher_username}</Txt>
          <Pill
            label={t('classes_open_assignments', { count: row.open_assignments })}
            color={row.open_assignments > 0 ? palette.accent : palette.muted}
          />
        </Card>
      ))}

      <SectionLabel>{t('classes_homework')}</SectionLabel>
      {assignments.length === 0 && !loading ? (
        <Card>
          <Txt variant="body">{t('classes_no_homework')}</Txt>
          <Txt variant="caption">{t('classes_no_homework_hint')}</Txt>
        </Card>
      ) : null}
      {assignments.map((assignment) => (
        <Link
          key={assignment.id}
          href={`/classroom/assignments/${assignment.id}` as never}
          style={{ textDecorationLine: 'none' }}
        >
          <Card>
            <Txt variant="section">{resolveLocalized(assignment.title_i18n, locale).text}</Txt>
            <Txt variant="caption">{assignment.classroom_name}</Txt>
            <Txt variant="caption">
              {t('tema_due')} {formatDateTime(assignment.due_at)}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Pill label={t(`assignment_state_${assignment.state.toLowerCase()}`)} />
              {assignment.is_exam ? <Pill label={t('tema_exam')} color={palette.orange} /> : null}
            </View>
          </Card>
        </Link>
      ))}
    </Screen>
  );
}
