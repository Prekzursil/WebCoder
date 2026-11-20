// JoinByQr — wave G item 99: scan the teacher's class QR and join.
//
// The camera's barcode scanner recognizes QR payloads; parseJoinPayload
// accepts both the deep link (webcoder://join?c=…&p=…) and the web URL
// (…/classes/join?code=…&p=…). A successful scan calls the join API and
// bounces to the classes list.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useAuth } from '../../src/state/AuthStore';
import { useSettings } from '../../src/state/SettingsStore';
import { ClassroomService } from '../../src/services/services';
import { parseJoinPayload } from '../../src/services/QrJoin';
import { Button, Card, Screen, Txt } from '../../src/ui/primitives';
import { palette } from '../../src/theme/tokens';

export default function JoinByQr() {
  const { t } = useSettings();
  const { status } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const camera = useMemo(() => {
    if (!permission) return <ActivityIndicator />;
    if (!permission.granted) {
      return (
        <Card>
          <Txt variant="body">
            {t('qr_need_camera', 'Camera access is needed to scan the class QR code.')}
          </Txt>
          <Button
            title={t('qr_grant', 'Grant camera access')}
            onPress={() => {
              void requestPermission();
            }}
          />
        </Card>
      );
    }
    return (
      <View style={{ borderRadius: 12, overflow: 'hidden', height: 320 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleScan}
        />
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, scanned, busy]);

  const handleScan = async ({ data }: { data: string }) => {
    const payload = parseJoinPayload(data);
    if (!payload) return; // not a join QR — keep scanning quietly
    setScanned(true);
    setBusy(true);
    try {
      await ClassroomService.join(payload.code, payload.password);
      setMessage(t('qr_joined', 'Joined! Taking you to your classes…'));
      setTimeout(() => router.replace('/classroom'), 900);
    } catch {
      setMessage(t('qr_failed', 'Could not join — check the code with your teacher.'));
      setScanned(false);
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'authenticated') {
    return (
      <Screen>
        <Card>
          <Txt variant="body">{t('qr_need_login', 'Sign in to join a class.')}</Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Txt variant="title">{t('qr_title', 'Join a class by QR')}</Txt>
        <Txt variant="caption">
          {t('qr_hint', 'Point the camera at the QR code your teacher shows.')}
        </Txt>
      </Card>
      {camera}
      {busy ? <ActivityIndicator /> : null}
      {message ? (
        <Card>
          <Txt variant="body" color={palette.accent}>
            {message}
          </Txt>
        </Card>
      ) : null}
      <Pressable onPress={() => router.back()}>
        <Txt variant="caption">{t('back', 'Back')}</Txt>
      </Pressable>
    </Screen>
  );
}
