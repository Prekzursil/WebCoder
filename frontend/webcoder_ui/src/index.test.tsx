const mockRender = jest.fn();
const mockCreateRoot = jest.fn();
const mockReportWebVitals = jest.fn();

jest.mock('react-dom/client', () => ({
  __esModule: true,
  default: { createRoot: (...args: unknown[]) => mockCreateRoot(...args) },
  createRoot: (...args: unknown[]) => mockCreateRoot(...args),
}));

// App and i18n pull in heavy trees / side effects we don't need for this smoke test.
jest.mock('./App', () => () => null);
jest.mock('./i18n', () => ({}));

jest.mock('./reportWebVitals', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockReportWebVitals(...args),
}));

describe('index entrypoint', () => {
  it('mounts the app into the #root element and calls reportWebVitals', () => {
    // NB: react-scripts sets resetMocks:true, so implementations must be (re)set
    // inside the test body, after the per-test mock reset has run.
    mockCreateRoot.mockReturnValue({ render: mockRender });

    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    require('./index');

    expect(mockCreateRoot).toHaveBeenCalledWith(root);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockReportWebVitals).toHaveBeenCalledTimes(1);

    document.body.removeChild(root);
  });
});
