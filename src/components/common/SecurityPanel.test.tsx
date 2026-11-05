// OPS-2 (Wave D): SecurityPanel (TOTP enrollment + personal API token)
// and the warn-phase TwoFactorBanner.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import SecurityPanel, { TwoFactorCard, ApiTokenCard } from "@/components/common/SecurityPanel";
import TwoFactorBanner from "@/components/common/TwoFactorBanner";
import * as ApiService from "@/services/ApiService";

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  user: null as Record<string, unknown> | null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(async () => {}),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => authState,
}));

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    username: "creator",
    email: "c@e.dev",
    role: "CREATOR",
    two_factor_enabled: false,
    two_factor_required: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = user();
});

afterEach(cleanup);

describe("TwoFactorBanner", () => {
  it("warns privileged unenrolled users with a profile link", () => {
    render(<TwoFactorBanner />);
    const banner = screen.getByTestId("two-factor-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/Two-factor authentication is required/i);
    expect(screen.getByRole("link", { name: /Profile → Security/i })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("stays silent for enrolled users", () => {
    authState.user = user({ two_factor_enabled: true, two_factor_required: false });
    render(<TwoFactorBanner />);
    expect(screen.queryByTestId("two-factor-banner")).not.toBeInTheDocument();
  });

  it("stays silent for basic users", () => {
    authState.user = user({ role: "BASIC", two_factor_required: false });
    render(<TwoFactorBanner />);
    expect(screen.queryByTestId("two-factor-banner")).not.toBeInTheDocument();
  });

  it("stays silent when signed out", () => {
    authState.user = null;
    render(<TwoFactorBanner />);
    expect(screen.queryByTestId("two-factor-banner")).not.toBeInTheDocument();
  });
});

describe("TwoFactorCard", () => {
  it("walks the enrollment flow: begin → secret → verify", async () => {
    const begin = vi
      .spyOn(ApiService.AuthService, "totpBegin")
      .mockResolvedValue({ secret: "ABC234DEF", otpauth_uri: "otpauth://totp/x" });
    const verify = vi
      .spyOn(ApiService.AuthService, "totpVerify")
      .mockResolvedValue({ detail: "ok" });

    render(<TwoFactorCard />);

    fireEvent.click(screen.getByRole("button", { name: /Enable two-factor/i }));
    await waitFor(() => expect(begin).toHaveBeenCalled());
    expect(await screen.findByTestId("totp-secret")).toHaveTextContent("ABC234DEF");

    fireEvent.change(screen.getByLabelText(/Authenticator code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verify and enable/i }));
    await waitFor(() => expect(verify).toHaveBeenCalledWith("123456"));
    await waitFor(() =>
      expect(screen.getByText(/Two-factor authentication enabled/i)).toBeInTheDocument(),
    );
    expect(authState.refreshUser).toHaveBeenCalled();
  });

  it("shows the backend error on a bad code", async () => {
    vi.spyOn(ApiService.AuthService, "totpBegin").mockResolvedValue({
      secret: "ABC234DEF",
      otpauth_uri: "otpauth://totp/x",
    });
    vi.spyOn(ApiService.AuthService, "totpVerify").mockRejectedValue(
      new Error("Invalid or expired code."),
    );
    render(<TwoFactorCard />);
    fireEvent.click(screen.getByRole("button", { name: /Enable two-factor/i }));
    await screen.findByTestId("totp-secret");
    fireEvent.change(screen.getByLabelText(/Authenticator code/i), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verify and enable/i }));
    await waitFor(() => expect(screen.getByText(/Invalid or expired code/i)).toBeInTheDocument());
  });

  it("renders the disable form for enrolled users", async () => {
    authState.user = user({ two_factor_enabled: true, two_factor_required: false });
    const disable = vi
      .spyOn(ApiService.AuthService, "totpDisable")
      .mockResolvedValue({ detail: "off" });
    render(<TwoFactorCard />);
    fireEvent.change(screen.getByLabelText(/Authenticator code/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/Current Password/i), {
      target: { value: "secret-pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Disable two-factor/i }));
    await waitFor(() => expect(disable).toHaveBeenCalledWith("123456", "secret-pw"));
  });
});

describe("ApiTokenCard", () => {
  it("mints a token and shows the key exactly once", async () => {
    const state = { key: null as string | null };
    vi.spyOn(ApiService.AuthService, "getApiTokens").mockImplementation(async () => ({
      count: state.key ? 1 : 0,
      results: state.key
        ? [{ key_hint: `…${state.key.slice(-4)}`, created: "2026-10-28T00:00:00Z" }]
        : [],
    }));
    const minted = "a".repeat(36) + "KEY1";
    vi.spyOn(ApiService.AuthService, "createApiToken").mockImplementation(async () => {
      state.key = minted;
      return { detail: "ok", key: minted, created: "2026-10-28T00:00:00Z" };
    });

    render(<ApiTokenCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Create token/i }));
    const fresh = await screen.findByTestId("fresh-token");
    expect(fresh).toHaveTextContent(minted);
    expect(await screen.findByTestId("token-hint")).toHaveTextContent("…KEY1");
  });

  it("offers revoke for an existing token", async () => {
    const state = { key: ("x".repeat(36) + "ABCD") as string | null };
    vi.spyOn(ApiService.AuthService, "getApiTokens").mockImplementation(async () => ({
      count: state.key ? 1 : 0,
      results: state.key
        ? [{ key_hint: `…${state.key.slice(-4)}`, created: "2026-10-28T00:00:00Z" }]
        : [],
    }));
    const revoke = vi
      .spyOn(ApiService.AuthService, "revokeApiToken")
      .mockImplementation(async () => {
        state.key = null;
        return { detail: "revoked" };
      });
    render(<ApiTokenCard />);
    expect(await screen.findByTestId("token-hint")).toHaveTextContent("…ABCD");
    fireEvent.click(screen.getByRole("button", { name: /Revoke/i }));
    await waitFor(() => expect(revoke).toHaveBeenCalled());
    await waitFor(
      () => expect(screen.getByRole("button", { name: /Create token/i })).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("surfaces a 409 rotation hint from the backend", async () => {
    vi.spyOn(ApiService.AuthService, "getApiTokens").mockResolvedValue({
      count: 0,
      results: [],
    });
    vi.spyOn(ApiService.AuthService, "createApiToken").mockRejectedValue(
      new Error("You already have a personal token — revoke it first to rotate the key."),
    );
    render(<ApiTokenCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Create token/i }));
    await waitFor(() => expect(screen.getByText(/revoke it first/i)).toBeInTheDocument());
  });
});

describe("SecurityPanel composition", () => {
  it("renders both cards", () => {
    vi.spyOn(ApiService.AuthService, "getApiTokens").mockResolvedValue({
      count: 0,
      results: [],
    });
    render(<SecurityPanel />);
    expect(screen.getByText(/Two-Factor Authentication \(TOTP\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal API Token/i)).toBeInTheDocument();
  });
});
