// The mobile block editor: the official Blockly UMD bundles running in
// a react-native-webview (no network — the scripts are app assets),
// generating judge-compatible Python/JavaScript exactly like the web's
// BlockEditor.tsx. Generated code flows back over postMessage and is
// submitted through the normal pipeline with `language` = generator.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import React, { useEffect, useMemo, useState } from 'react';
import { WebView } from 'react-native-webview';
import { ErrorBox, Spinner } from './primitives';
import {
  buildBlocklyHtml,
  parseBlocklyMessage,
  type BlockGenerator,
  type BlocklyScripts,
} from '../utils/blocklyWeb';

// The Blockly UMD bundles as static asset modules — Metro resolves these
// to numeric asset ids at build time (the only form it accepts), and
// `Asset.fromModule` turns each id into a downloadable local file.
import blocklyBlocks from '../../assets/blockly/blocks.txt';
import blocklyCore from '../../assets/blockly/core.txt';
import blocklyJavascript from '../../assets/blockly/javascript.txt';
import blocklyMessagesEn from '../../assets/blockly/messages-en.txt';
import blocklyMessagesRo from '../../assets/blockly/messages-ro.txt';
import blocklyPython from '../../assets/blockly/python.txt';

/** Read a bundled text asset's bytes (downloadAsync resolves the local
 * URI for both local dev and a packaged release build; the SDK-58 File
 * API reads it — the legacy readAsStringAsync throws from the main
 * export). */
async function readAssetText(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (!asset.downloaded) await asset.downloadAsync();
  if (!asset.localUri) throw new Error('blockly asset unavailable');
  return new File(asset.localUri).text();
}

export interface BlocklyEditorProps {
  generator: BlockGenerator;
  /** Per-problem toolbox XML (falls back to the default beginner set). */
  toolboxXml?: string;
  /** Per-problem starter workspace XML. */
  starterXml?: string;
  /** UI locale ('ro…' selects the Romanian message pack + site strings). */
  locale: string;
  /** Localized toolbox category labels (the caller's t() output). */
  categoryLabels: Record<string, string>;
  /** Called with the generated source whenever the workspace changes. */
  onCodeChange?: (code: string) => void;
  height?: number;
}

export default function BlocklyEditor({
  generator,
  toolboxXml,
  starterXml,
  locale,
  categoryLabels,
  onCodeChange,
  height = 380,
}: BlocklyEditorProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const scripts: BlocklyScripts = {
          core: await readAssetText(blocklyCore),
          blocks: await readAssetText(blocklyBlocks),
          python: await readAssetText(blocklyPython),
          javascript: await readAssetText(blocklyJavascript),
          messages: await readAssetText(
            locale.startsWith('ro') ? blocklyMessagesRo : blocklyMessagesEn,
          ),
        };
        if (!alive) return;
        setHtml(
          buildBlocklyHtml({ generator, toolboxXml, starterXml, locale, categoryLabels, scripts }),
        );
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
    // The workspace re-injects when the problem's block set, generator,
    // or locale changes — mirroring the web editor's effect deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generator, toolboxXml, starterXml, locale]);

  const onChangeRef = React.useRef(onCodeChange);
  React.useEffect(() => {
    onChangeRef.current = onCodeChange;
  }, [onCodeChange]);

  const webview = useMemo(() => {
    if (!html) return null;
    return (
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled={false}
        style={{ height, backgroundColor: 'transparent' }}
        onMessage={(event) => {
          const message = parseBlocklyMessage(event.nativeEvent.data);
          if (!message) return;
          if (message.type === 'code') onChangeRef.current?.(message.code);
          else setError(message.message);
        }}
      />
    );
  }, [html, height]);

  if (error) {
    // Surface load failures inside the box the caller reserved for the
    // editor — a silent spinner would hide a broken asset bundle.
    return <ErrorBox message={error} />;
  }
  return webview ?? <Spinner />;
}
