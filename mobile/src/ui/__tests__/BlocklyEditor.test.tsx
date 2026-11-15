// BlocklyEditor — the WebView bridge component: assets load through
// expo-asset + the SDK-58 File API, the built HTML mounts in the
// WebView, and code messages from the bridge reach onCodeChange
// (malformed ones are dropped). Asset failures surface as the error
// box, never a hang.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import BlocklyEditor from '../BlocklyEditor';
import { File } from 'expo-file-system';
import * as assetModule from 'expo-asset';
import * as webviewModule from 'react-native-webview';
// The asset modules are opaque numbers at runtime — the mock registry
// keys off them, so stable ids make the fixtures addressable.
jest.mock('../../../assets/blockly/core.txt', () => 101, { virtual: true });
jest.mock('../../../assets/blockly/blocks.txt', () => 102, { virtual: true });
jest.mock('../../../assets/blockly/python.txt', () => 103, { virtual: true });
jest.mock('../../../assets/blockly/javascript.txt', () => 104, { virtual: true });
jest.mock('../../../assets/blockly/messages-en.txt', () => 105, { virtual: true });
jest.mock('../../../assets/blockly/messages-ro.txt', () => 106, { virtual: true });

// The jest.setup mocks expose the captured onMessage handler and the
// asset-text registry through their module exports.
const webview = webviewModule as unknown as {
  __handlers: ((e: { nativeEvent: { data: string } }) => void)[];
};
const assets = assetModule as unknown as {
  __setAssetText: (m: number, s: string) => void;
  __registry: Map<number, string>;
};

function seedAssets() {
  const set = assets.__setAssetText;
  set(101, '/*CORE*/');
  set(102, '/*BLOCKS*/');
  set(103, '/*PYTHON*/');
  set(104, '/*JAVASCRIPT*/');
  set(105, '/*EN*/');
  set(106, '/*RO*/');
}

const props = {
  generator: 'python3' as const,
  locale: 'en',
  categoryLabels: {},
};

it('mounts the WebView with the built HTML', async () => {
  seedAssets();
  render(<BlocklyEditor {...props} onCodeChange={jest.fn()} />);
  await waitFor(() => expect(screen.queryByTestId('blockly-webview')).not.toBeNull());
});

it('forwards bridge code messages to onCodeChange and drops malformed ones', async () => {
  seedAssets();
  const onCodeChange = jest.fn();
  render(<BlocklyEditor {...props} onCodeChange={onCodeChange} />);
  await waitFor(() => expect(screen.queryByTestId('blockly-webview')).not.toBeNull());
  const fire = webview.__handlers[0];
  fire({ nativeEvent: { data: JSON.stringify({ type: 'code', code: 'print(1)' }) } });
  expect(onCodeChange).toHaveBeenCalledWith('print(1)');
  fire({ nativeEvent: { data: 'garbage' } });
  expect(onCodeChange).toHaveBeenCalledTimes(1);
});

it('renders the error box when an asset cannot be read', async () => {
  // Clear the registry seeded by earlier tests → new File(uri).text()
  // rejects and the error box surfaces.
  assets.__registry.clear();
  render(<BlocklyEditor {...props} onCodeChange={jest.fn()} />);
  await waitFor(() => expect(screen.queryByText(/asset not found/)).not.toBeNull());
});

it('reads asset bytes through the SDK-58 File API', async () => {
  seedAssets();
  const spy = jest.spyOn(File.prototype, 'text');
  render(<BlocklyEditor {...props} onCodeChange={jest.fn()} />);
  await waitFor(() => expect(spy).toHaveBeenCalled());
  spy.mockRestore();
});
