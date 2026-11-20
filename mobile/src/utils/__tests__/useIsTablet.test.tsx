// [wave G item 98] The tablet-derivation hook — rendered through a host
// component (the lane stores.test.tsx proves); jest-expo's
// useWindowDimensions mock supplies a fixed preset window.
import React from 'react';
import { render } from '@testing-library/react-native';
import { TABLET_MIN_WIDTH, useIsTablet } from '../useIsTablet';

describe('useIsTablet [item 98]', () => {
  it('is the canonical 768dp breakpoint', () => {
    expect(TABLET_MIN_WIDTH).toBe(768);
  });

  it('derives a boolean from the mocked window width', async () => {
    let captured: boolean | undefined;
    function Host(): null {
      captured = useIsTablet();
      return null;
    }
    const view = await render(<Host />);
    expect(typeof captured).toBe('boolean');
    view.unmount();
  });
});
