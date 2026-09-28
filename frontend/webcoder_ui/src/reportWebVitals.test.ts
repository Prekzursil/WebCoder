const mockGetCLS = jest.fn();
const mockGetFID = jest.fn();
const mockGetFCP = jest.fn();
const mockGetLCP = jest.fn();
const mockGetTTFB = jest.fn();

jest.mock('web-vitals', () => ({
  getCLS: mockGetCLS,
  getFID: mockGetFID,
  getFCP: mockGetFCP,
  getLCP: mockGetLCP,
  getTTFB: mockGetTTFB,
}));

import reportWebVitals from './reportWebVitals';

describe('reportWebVitals', () => {
  beforeEach(() => {
    mockGetCLS.mockClear();
    mockGetFID.mockClear();
    mockGetFCP.mockClear();
    mockGetLCP.mockClear();
    mockGetTTFB.mockClear();
  });

  it('does nothing when no handler is provided', async () => {
    reportWebVitals();
    await Promise.resolve();
    expect(mockGetCLS).not.toHaveBeenCalled();
  });

  it('does nothing when the argument is not a function', async () => {
    // @ts-expect-error intentionally passing a non-function to exercise the guard
    reportWebVitals('not-a-function');
    await Promise.resolve();
    expect(mockGetCLS).not.toHaveBeenCalled();
  });

  it('imports web-vitals and registers the handler with each metric', async () => {
    // A plain function (not jest.fn) is required: jest.fn instances do not pass
    // the source module's `instanceof Function` guard under CRA's jsdom realm.
    const handler = (): void => undefined;
    reportWebVitals(handler);

    // Flush the dynamic import().then() chain.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockGetCLS).toHaveBeenCalledWith(handler);
    expect(mockGetFID).toHaveBeenCalledWith(handler);
    expect(mockGetFCP).toHaveBeenCalledWith(handler);
    expect(mockGetLCP).toHaveBeenCalledWith(handler);
    expect(mockGetTTFB).toHaveBeenCalledWith(handler);
  });
});
