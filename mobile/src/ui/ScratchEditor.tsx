// The mobile Scratch editor: the scratch-vm/scratch-blocks/scratch-render
// stack (the SAME packages the web ScratchEditor.tsx mounts) running in a
// react-native-webview via the committed esbuild bundle — no network. The
// sb3 project JSON flows back over the postMessage bridge and submits
// through the normal pipeline with `language: 'scratch'`.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import { palette, space } from '../theme/tokens';
import { ErrorBox, Spinner, Txt } from './primitives';
import { buildScratchHtml, parseScratchMessage } from '../utils/scratchWeb';

import scratchEditor from '../../assets/scratch/editor.txt';

async function readAssetText(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (!asset.downloaded) await asset.downloadAsync();
  if (!asset.localUri) throw new Error('scratch asset unavailable');
  return new File(asset.localUri).text();
}

export interface ScratchEditorProps {
  /** Starter sb3 project JSON (problem config or playground default). */
  projectJson?: string;
  /** Per-problem curated block set (opcodes); null = the full curated set. */
  allowedOpcodes?: string[] | null;
  /** UI locale ('ro…' selects the Romanian block labels). */
  locale: string;
  /** Localized toolbox category labels (the caller's t() output). */
  categoryLabels: Record<string, string>;
  /** Called with the current project JSON whenever it changes. */
  onProjectChange?: (projectJson: string) => void;
  /** Ready-to-submit hint shown until the bridge posts the first project. */
  submitDisabledHint?: string;
}

export default function ScratchEditor({
  projectJson,
  allowedOpcodes = null,
  locale,
  categoryLabels,
  onProjectChange,
  submitDisabledHint,
}: ScratchEditorProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const webviewRef = useRef<React.ComponentRef<typeof WebView>>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const editor = await readAssetText(scratchEditor);
        if (!alive) return;
        setHtml(
          buildScratchHtml({
            projectJson,
            allowedOpcodes,
            locale,
            categoryLabels,
            scripts: { editor },
          }),
        );
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
    // Re-mount when the starter project or curated block set changes —
    // mirroring the web editor's effect deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectJson, allowedOpcodes, locale]);

  const onChangeRef = React.useRef(onProjectChange);
  React.useEffect(() => {
    onChangeRef.current = onProjectChange;
  }, [onProjectChange]);

  const webview = useMemo(() => {
    if (!html) return null;
    return (
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onError={(event: WebViewErrorEvent) =>
          setError(`webview: ${event.nativeEvent.description}`)
        }
        onMessage={(event: WebViewMessageEvent) => {
          const message = parseScratchMessage(event.nativeEvent.data);
          if (!message) return;
          if (message.type === 'project') onChangeRef.current?.(message.json);
          else if (message.type === 'ready') setReady(true);
          else if (message.type === 'say') {
            setConsoleLines((lines) => [...lines.slice(-40), message.text]);
          } else if (message.type === 'error') setError(message.message);
        }}
      />
    );
  }, [html]);

  const runFlag = () => {
    setConsoleLines([]);
    webviewRef.current?.injectJavaScript(
      'window.WebCoderScratch && window.WebCoderScratch.greenFlag(); true;',
    );
  };
  const runStop = () => {
    webviewRef.current?.injectJavaScript(
      'window.WebCoderScratch && window.WebCoderScratch.stopAll(); true;',
    );
  };

  if (error) {
    return <ErrorBox message={error} />;
  }
  if (!webview) {
    return <Spinner />;
  }
  return (
    <View style={{ flex: 1, gap: space[2] }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Pressable
          onPress={runFlag}
          accessibilityRole="button"
          accessibilityLabel="Run (green flag)"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.accent,
          }}
        >
          <Txt variant="caption" color={palette.accent}>
            ⚑ Run
          </Txt>
        </Pressable>
        <Pressable
          onPress={runStop}
          accessibilityRole="button"
          accessibilityLabel="Stop"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <Txt variant="caption" color={palette.muted}>
            ⏹ Stop
          </Txt>
        </Pressable>
        {!ready ? <Txt variant="caption">{submitDisabledHint ?? 'Loading…'}</Txt> : null}
      </View>
      {webview}
      {consoleLines.length > 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 8,
            padding: space[2],
            maxHeight: 90,
          }}
        >
          {consoleLines.map((line, index) => (
            <Txt key={index} variant="caption" color={palette.muted}>
              {line}
            </Txt>
          ))}
        </View>
      ) : null}
    </View>
  );
}
