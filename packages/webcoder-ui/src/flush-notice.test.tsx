// @webcoder/ui — flush-notice component test (item 149): the package
// ships tested components (CONTRIBUTING's promise).

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FlushNotice } from './flush-notice';

// vitest runs with globals: false — register RTL cleanup manually.
afterEach(cleanup);

describe('@webcoder/ui flush-notice [item 149]', () => {
  it('renders the title and body', () => {
    render(<FlushNotice title="Flush your output" body="Interactive judge waiting" />);
    const notice = screen.getByTestId('flush-notice');
    expect(notice).toHaveTextContent('Flush your output');
    expect(notice).toHaveTextContent('Interactive judge waiting');
  });

  it('fires the acknowledge callback', () => {
    const onAcknowledge = vi.fn();
    render(<FlushNotice title="Flush" onAcknowledge={onAcknowledge} />);
    fireEvent.click(screen.getByTestId('flush-notice-ack'));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('omits the acknowledge button when no callback is given', () => {
    render(<FlushNotice title="Flush" />);
    expect(screen.queryByTestId('flush-notice-ack')).not.toBeInTheDocument();
  });
});
