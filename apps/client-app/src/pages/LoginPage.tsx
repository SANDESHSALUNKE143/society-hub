import { FormEvent, useCallback, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiClientError } from "@society-hub/sdk";
import { GoogleSignInButton, googleSignInMode } from "@society-hub/ui";
import { useAuth } from "../auth";
import { LEGAL_LINKS } from "../lib/legal-links";

type Mode = "password" | "otp" | "pin" | "google";

const MANAGE_URL = import.meta.env.VITE_MANAGE_URL ?? "http://manage.localhost:5174";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const googleMode = googleSignInMode(GOOGLE_CLIENT_ID);

export function LoginPage() {
  const { user, client, setSession } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/select-society" replace />;

  async function applySession(
    login: () => Promise<{
      user: Parameters<typeof setSession>[0];
      tokens: Parameters<typeof setSession>[1];
    }>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await login();
      try {
        setSession(res.user, res.tokens);
        navigate("/select-society", { replace: true });
      } catch {
        setError("This account cannot use the Client App.");
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function loginPassword(e: FormEvent) {
    e.preventDefault();
    await applySession(() => client.loginPassword(email, password));
  }

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await client.requestOtp(phone);
      setOtpSent(true);
      if (res.devCode) setDevHint(`Dev OTP: ${res.devCode}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    await applySession(() => client.verifyOtp(phone, code));
  }

  async function loginPin(e: FormEvent) {
    e.preventDefault();
    await applySession(() => client.loginPin(phone, pin));
  }

  async function loginGoogle(e: FormEvent) {
    e.preventDefault();
    await applySession(() => client.loginGoogle(`dev:${phone}`));
  }

  const onGoogleCredential = useCallback(
    (idToken: string) => {
      void applySession(() => client.loginGoogle(idToken));
    },
    [client],
  );

  const modeLabel: Record<Mode, string> = {
    password: "Email",
    otp: "OTP",
    pin: "PIN",
    google: "Google",
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--saffron)] to-[var(--leaf-dark)] text-lg font-bold text-white">
            SH
          </div>
          <div className="text-left">
            <p className="font-display text-2xl leading-tight text-[var(--leaf-dark)]">
              SocietyHub
            </p>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
              Resident sign-in
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-black/60">
          Sign in to raise complaints, pay dues and stay updated.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {(["password", "otp", "pin", "google"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`login-mode-${m}`}
              className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode(m)}
            >
              {modeLabel[m]}
            </button>
          ))}
        </div>

        {mode === "password" && (
          <form className="mt-6 space-y-4" onSubmit={loginPassword}>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                data-testid="login-email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                data-testid="login-password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm text-[var(--leaf)]">
                Forgot password?
              </Link>
            </div>
            <button
              className="btn btn-primary w-full"
              data-testid="login-submit"
              disabled={busy}
              type="submit"
            >
              Sign in
            </button>
          </form>
        )}

        {mode === "otp" && (
          <form className="mt-6 space-y-4" onSubmit={otpSent ? verifyOtp : requestOtp}>
            <div>
              <label className="label" htmlFor="phone">
                Mobile
              </label>
              <input
                id="phone"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {otpSent && (
              <div>
                <label className="label" htmlFor="code">
                  OTP
                </label>
                <input
                  id="code"
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
            )}
            <button className="btn btn-primary w-full" disabled={busy} type="submit">
              {otpSent ? "Verify & continue" : "Send OTP"}
            </button>
          </form>
        )}

        {mode === "pin" && (
          <form className="mt-6 space-y-4" onSubmit={loginPin}>
            <div>
              <label className="label" htmlFor="phone-pin">
                Mobile
              </label>
              <input
                id="phone-pin"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="pin">
                PIN
              </label>
              <input
                id="pin"
                className="input"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary w-full" disabled={busy} type="submit">
              Sign in with PIN
            </button>
          </form>
        )}

        {mode === "google" && googleMode === "gis" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-black/60">
              Continue with the Google account that matches your onboarded email.
            </p>
            <GoogleSignInButton
              clientId={GOOGLE_CLIENT_ID}
              disabled={busy}
              onCredential={onGoogleCredential}
            />
          </div>
        )}

        {mode === "google" && googleMode === "dev" && (
          <form className="mt-6 space-y-4" onSubmit={loginGoogle}>
            <p className="text-sm text-black/60">
              Dev Google SSO uses your onboarded phone as{" "}
              <code>dev:&lt;phone&gt;</code>.
            </p>
            <div>
              <label className="label" htmlFor="phone-g">
                Mobile (dev)
              </label>
              <input
                id="phone-g"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary w-full" disabled={busy} type="submit">
              Continue with Google (dev)
            </button>
          </form>
        )}

        {devHint && <p className="mt-3 text-center text-sm text-[var(--alert)]">{devHint}</p>}
        {error && (
          <p className="mt-3 text-center text-sm text-[var(--danger)]" data-testid="login-error">
            {error}
          </p>
        )}
        <p className="mt-6 text-center text-sm text-black/50">
          Platform ops (societies, platform team)?{" "}
          <a className="text-[var(--leaf)]" href={MANAGE_URL}>
            Open Manage
          </a>
        </p>
        <p className="mt-3 flex justify-center gap-3 text-center text-xs text-black/45">
          <Link className="text-[var(--leaf)]" to={LEGAL_LINKS.home}>
            Home
          </Link>
          <Link className="text-[var(--leaf)]" to={LEGAL_LINKS.privacy}>
            Privacy
          </Link>
          <Link className="text-[var(--leaf)]" to={LEGAL_LINKS.terms}>
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
