import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ClassQrCard, { buildClassJoinDeepLink } from '@/app/classes/ClassQrCard';

// [Wave G item 99] the teacher-side join QR (web).

const qrMock = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock('qrcode', () => ({
  __esModule: true,
  default: qrMock,
  toDataURL: qrMock.toDataURL,
}));

beforeEach(() => {
  vi.clearAllMocks();
  qrMock.toDataURL.mockResolvedValue('data:image/png;base64,QR');
});

afterEach(cleanup);

describe('buildClassJoinDeepLink', () => {
  it('upper-cases the code and embeds the password when present', () => {
    expect(buildClassJoinDeepLink('ab12cd', '')).toBe('webcoder://join?c=AB12CD');
    expect(buildClassJoinDeepLink('ab12cd', 's3cret')).toBe('webcoder://join?c=AB12CD&p=s3cret');
  });
});

describe('ClassQrCard', () => {
  it('renders the QR image and the code', async () => {
    render(<ClassQrCard code="AB12CD" />);
    const img = await screen.findByRole('img', { name: /class join qr code/i });
    expect(img).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(screen.getByText('AB12CD')).toBeInTheDocument();
    expect(qrMock.toDataURL).toHaveBeenCalledWith('webcoder://join?c=AB12CD', expect.anything());
  });

  it('offers a local password embed for password-guarded classes', async () => {
    render(<ClassQrCard code="XY99" hasPassword />);
    const input = screen.getByTestId('qr-password-XY99');
    fireEvent.change(input, { target: { value: 'pw' } });
    await screen.findByRole('img');
    expect(qrMock.toDataURL).toHaveBeenLastCalledWith(
      'webcoder://join?c=XY99&p=pw',
      expect.anything(),
    );
  });

  it('shows the scan hint for open classes', () => {
    render(<ClassQrCard code="ZZ11" />);
    expect(screen.getByText(/students scan to join/i)).toBeInTheDocument();
  });

  it('survives a QR generation failure', async () => {
    qrMock.toDataURL.mockRejectedValue(new Error('boom'));
    render(<ClassQrCard code="QQ22" />);
    await screen.findByText('QQ22');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
