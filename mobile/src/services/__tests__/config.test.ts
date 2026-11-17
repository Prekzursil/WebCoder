// config tests: the API base is re-derived from parsed URL components, so a
// non-http(s) scheme or credential-carrying base cannot reach fetch().
jest.mock('expo-constants', () => ({
  Constants: { expoConfig: { extra: {} } },
  default: { expoConfig: { extra: {} } },
}));

describe('API_V1_URL derivation', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_BASE;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.EXPO_PUBLIC_API_BASE;
    else process.env.EXPO_PUBLIC_API_BASE = ORIGINAL_ENV;
    jest.resetModules();
  });

  it('keeps an http base (path preserved, trailing slash trimmed)', () => {
    process.env.EXPO_PUBLIC_API_BASE = 'http://10.0.2.2:8010/api/v1/';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { API_V1_URL } = jest.requireActual('../config');
      expect(API_V1_URL).toBe('http://10.0.2.2:8010/api/v1');
    });
  });

  it('throws on a non-http(s) base', () => {
    process.env.EXPO_PUBLIC_API_BASE = 'ftp://10.0.2.2:8010/api/v1';
    expect(() =>
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        jest.requireActual('../config');
      }),
    ).toThrow(/must be http/);
  });

  it('drops query and fragment from the derived base', () => {
    process.env.EXPO_PUBLIC_API_BASE = 'https://api.example.com/api/v1?token=x#frag';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { API_V1_URL } = jest.requireActual('../config');
      expect(API_V1_URL).toBe('https://api.example.com/api/v1');
    });
  });
});
