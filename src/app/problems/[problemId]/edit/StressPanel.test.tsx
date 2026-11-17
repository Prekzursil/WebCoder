import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import StressPanel from './StressPanel';
import * as ApiService from '@/services/ApiService';

// [wave E item 12] The stress-helper surface: run the generator/solution/
// reference triple, render the counterexample or the clean bill.

vi.mock('@/services/ApiService', () => ({
  StressService: { run: vi.fn() },
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 1, role: 'CREATOR' } }),
}));

const { StressService } = ApiService as unknown as {
  StressService: { run: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  StressService.run.mockReset();
});

afterEach(cleanup);

describe('StressPanel', () => {
  it('stays collapsed until toggled, then runs and shows the counterexample', async () => {
    StressService.run.mockResolvedValue({
      id: 1,
      iterations: 7,
      found: true,
      mismatch: {
        phase: 'mismatch',
        input: '3 4',
        solution_output: '6',
        reference_output: '7',
      },
    });
    render(<StressPanel language="python3" />);
    expect(screen.queryByTestId('stress-result')).toBeNull();
    fireEvent.click(screen.getByTestId('stress-toggle'));
    const solution = screen.getByPlaceholderText(/code under test/i);
    const reference = screen.getByPlaceholderText(/brute force/i);
    fireEvent.change(solution, { target: { value: 'print(6)' } });
    fireEvent.change(reference, { target: { value: 'print(7)' } });
    fireEvent.click(screen.getByTestId('stress-run'));
    await waitFor(() => {
      expect(screen.getByTestId('stress-result')).toBeTruthy();
    });
    expect(screen.getByText(/Counterexample found:/i)).toBeTruthy();
    expect(screen.getByText(/yours: 6/)).toBeTruthy();
    expect(StressService.run).toHaveBeenCalledTimes(1);
    expect(StressService.run.mock.calls[0][0]).toMatchObject({
      solution_language: 'python3',
      iterations: 20,
    });
  });

  it('renders the clean result when no mismatch is found', async () => {
    StressService.run.mockResolvedValue({
      id: 2,
      iterations: 50,
      found: false,
      mismatch: null,
    });
    render(<StressPanel language="python3" />);
    fireEvent.click(screen.getByTestId('stress-toggle'));
    fireEvent.change(screen.getByPlaceholderText(/code under test/i), {
      target: { value: 'print(1)' },
    });
    fireEvent.change(screen.getByPlaceholderText(/brute force/i), {
      target: { value: 'print(1)' },
    });
    fireEvent.click(screen.getByTestId('stress-run'));
    await waitFor(() => {
      expect(screen.getByText(/No mismatch in 50 iterations/i)).toBeTruthy();
    });
  });

  it('surfaces API errors', async () => {
    StressService.run.mockRejectedValue(new Error('throttled'));
    render(<StressPanel language="python3" />);
    fireEvent.click(screen.getByTestId('stress-toggle'));
    fireEvent.change(screen.getByPlaceholderText(/code under test/i), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByPlaceholderText(/brute force/i), {
      target: { value: 'y' },
    });
    fireEvent.click(screen.getByTestId('stress-run'));
    await waitFor(() => {
      expect(screen.getByText('throttled')).toBeTruthy();
    });
  });
});
