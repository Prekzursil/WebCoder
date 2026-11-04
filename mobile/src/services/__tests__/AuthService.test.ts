// AuthService tests: login captures access (body) + wc_refresh
// (Set-Cookie); register/me/change-password/logout hit the right paths.
import { AuthService, login } from "../AuthService";
import { __resetForTests } from "../ApiClient";

const calls = () => (global.fetch as jest.Mock).mock.calls;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  __resetForTests();
});

const LOGIN_COOKIES =
  "wc_access=acc; Path=/, wc_refresh=REFRESH_TOKEN; Path=/, csrftoken=csrf; Path=/";

const loginResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    access: "BODY_ACCESS",
    refresh: "",
    user: { id: 2, username: "bob", email: "b@x", role: "BASIC" },
  }),
  headers: { get: (name: string) => (name.toLowerCase() === "set-cookie" ? LOGIN_COOKIES : null) },
});

describe("login", () => {
  it("captures the access body token + wc_refresh cookie pair", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(loginResponse());
    const result = await login({ username: "bob", password: "pw" });
    expect(result.user.username).toBe("bob");
    expect(result.tokens).toEqual({
      access: "BODY_ACCESS",
      refresh: "REFRESH_TOKEN",
    });
    const [url, init] = calls()[0];
    expect(url).toContain("/auth/login/");
    expect(JSON.parse(init.body)).toEqual({ username: "bob", password: "pw" });
  });

  it("returns null tokens when the cookie is missing (cookie-only session)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 1, username: "u", email: "e", role: "BASIC" } }),
      headers: { get: () => null },
    });
    const result = await login({ username: "u", password: "p" });
    expect(result.tokens).toBeNull();
  });

  it("surfaces the DRF error message on bad credentials", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({
        non_field_errors: ["Unable to log in with provided credentials."],
      }),
      headers: { get: () => null },
    });
    await expect(login({ username: "x", password: "y" })).rejects.toThrow(
      "Unable to log in with provided credentials.",
    );
  });

  it("falls back to statusText when the error body is unparseable", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => {
        throw new Error("no json");
      },
      headers: { get: () => null },
    });
    await expect(login({ username: "x", password: "y" })).rejects.toThrow("Service Unavailable");
  });
});

describe("AuthService endpoints", () => {
  const ok = () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: { get: () => null },
  });

  it("registers anonymously, reads me, changes password, logs out", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(ok());
    await AuthService.register({
      username: "u",
      email: "e@x",
      password1: "p1",
      password2: "p1",
    });
    let [url, init] = calls()[0];
    expect(url).toContain("/users/register/");
    // The anonymous flag stays inside ApiFetchOptions (it must never leak
    // to fetch); anonymous-ness is observable as the absent auth header.
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.method).toBe("POST");

    await AuthService.getMe();
    [url] = calls()[1];
    expect(url).toContain("/users/me/");

    await AuthService.changePassword({
      new_password1: "a",
      new_password2: "a",
    });
    [, init] = calls()[2];
    expect(init.method).toBe("POST");

    await AuthService.logout();
    [url, init] = calls()[3];
    expect(url).toContain("/auth/logout/");
    expect(init.method).toBe("POST");

    await AuthService.getSolvedIds();
    expect(calls()[4][0]).toContain("/users/me/solved-ids/");
  });
});
