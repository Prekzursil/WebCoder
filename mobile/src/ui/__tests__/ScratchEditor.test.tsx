// ScratchEditor — the WebView bridge component: the committed esbuild
// bundle mounts in the WebView, project/say/error bridge messages route
// to their handlers (malformed ones drop), and asset failures surface as
// the error box, never a hang.
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as assetModule from 'expo-asset';
import * as webviewModule from 'react-native-webview';
import ScratchEditor from '../ScratchEditor';

jest.mock('../../../assets/scratch/editor.txt', () => 201, { virtual: true });

const webview = webviewModule as unknown as {
  __handlers: ((e: { nativeEvent: { data: string } }) => void)[];
};
const assets = assetModule as unknown as {
  __setAssetText: (m: number, s: string) => void;
  __registry: Map<number, string>;
};

const props = {
  locale: 'en',
  categoryLabels: {},
};

it('mounts the WebView with the built HTML and reports ready', async () => {
  assets.__setAssetText(201, '/*BUNDLE*/');
  const { queryByTestId } = await render(<ScratchEditor {...props} onProjectChange={jest.fn()} />);
  await waitFor(() => expect(queryByTestId('blockly-webview')).not.toBeNull());
  const fire = webview.__handlers[0];
  fire({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
  fire({
    nativeEvent: { data: JSON.stringify({ type: 'project', json: '{"targets":[]}' }) },
  });
});

it('forwards project messages and drops malformed ones', async () => {
  assets.__setAssetText(201, '/*BUNDLE*/');
  const onProjectChange = jest.fn();
  const { queryByTestId } = await render(
    <ScratchEditor {...props} onProjectChange={onProjectChange} />,
  );
  await waitFor(() => expect(queryByTestId('blockly-webview')).not.toBeNull());
  const fire = webview.__handlers[0];
  fire({ nativeEvent: { data: JSON.stringify({ type: 'project', json: '{"targets":[]}' }) } });
  expect(onProjectChange).toHaveBeenCalledWith('{"targets":[]}');
  fire({ nativeEvent: { data: 'garbage' } });
  expect(onProjectChange).toHaveBeenCalledTimes(1);
});

it('renders the error box when an asset cannot be read', async () => {
  assets.__registry.clear();
  const { queryByText } = await render(<ScratchEditor {...props} onProjectChange={jest.fn()} />);
  await waitFor(() => expect(queryByText(/asset not found/)).not.toBeNull());
});

it('reads asset bytes through the SDK-58 File API', async () => {
  assets.__setAssetText(201, '/*BUNDLE*/');
  const spy = jest.spyOn(File.prototype, 'text');
  await render(<ScratchEditor {...props} onProjectChange={jest.fn()} />);
  await waitFor(() => expect(spy).toHaveBeenCalled());
  spy.mockRestore();
});
