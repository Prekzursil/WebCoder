// OPS-6 (Wave D): the service-worker registrar — production-only
// registration, silent elsewhere.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ServiceWorkerRegistrar from '@/components/common/ServiceWorkerRegistrar';

const registerMock = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

function stubServiceWorker() {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: registerMock },
    configurable: true,
  });
}

describe('ServiceWorkerRegistrar [OPS-6]', () => {
  it('registers /sw.js in production when the browser supports it', () => {
    stubServiceWorker();
    vi.stubEnv('NODE_ENV', 'production');
    // document.readyState is 'complete' under jsdom? Not guaranteed —
    // drive both paths via the load event; fire it if needed.
    render(<ServiceWorkerRegistrar />);
    if (registerMock.mock.calls.length === 0) {
      window.dispatchEvent(new Event('load'));
    }
    expect(registerMock).toHaveBeenCalledWith('/sw.js');
  });

  it('stays dormant outside production (next-dev HMR safety)', () => {
    stubServiceWorker();
    vi.stubEnv('NODE_ENV', 'development');
    render(<ServiceWorkerRegistrar />);
    window.dispatchEvent(new Event('load'));
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('is a no-op when serviceWorker is unsupported', () => {
    // No stub: navigator.serviceWorker absent.
    vi.stubEnv('NODE_ENV', 'production');
    render(<ServiceWorkerRegistrar />);
    window.dispatchEvent(new Event('load'));
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<ServiceWorkerRegistrar />);
    expect(container).toBeEmptyDOMElement();
  });
});
