import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, KeyRound, Lock, Mail } from "lucide-react";
import api from "../services/api.js";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recoveryView, setRecoveryView] = useState("login");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("kalakbay_auth") === "true" && localStorage.getItem("kalakbay_token")) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleChange = (e) => setForm((current) => ({ ...current, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/login", form);
      const { user, accessToken } = response.data;
      localStorage.setItem("kalakbay_auth", "true");
      localStorage.setItem("kalakbay_role", user.role);
      localStorage.setItem("kalakbay_token", accessToken);
      localStorage.setItem("kalakbay_user", JSON.stringify(user));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Could not sign in. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestResetCode = async (event) => {
    event.preventDefault();
    setRecoveryLoading(true);
    setRecoveryError("");
    setRecoveryMessage("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email: recoveryEmail });
      setRecoveryMessage(data.message);
      setRecoveryView("verify");
    } catch (requestError) {
      setRecoveryError(requestError?.response?.data?.message || "Could not send a reset code.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setRecoveryError("");
    setRecoveryMessage("");
    if (newPassword !== confirmPassword) {
      setRecoveryError("The new password and confirmation do not match.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        email: recoveryEmail,
        code: resetCode,
        new_password: newPassword,
      });
      setRecoveryMessage(data.message);
      setNewPassword("");
      setConfirmPassword("");
      setRecoveryView("complete");
    } catch (requestError) {
      setRecoveryError(requestError?.response?.data?.message || "Could not reset the password.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const backToLogin = () => {
    setRecoveryView("login");
    setRecoveryError("");
    setRecoveryMessage("");
  };

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(440px,0.9fr)_1.1fr]">
      {/* Left: form */}
      <div className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[390px]">
          <div className="mb-12 flex items-center gap-3">
            <div className="h-12 w-12 shrink-0">
              <img src="/manila-dsw-logo.svg" alt="Department of Social Welfare, City of Manila" className="h-full w-full object-contain" />
            </div>
            <p className="font-display font-bold text-lg text-ink900">
              KALAKBAY <span className="text-primary">AI</span>
            </p>
          </div>

          <h1 className="font-display text-[27px] font-semibold tracking-normal text-ink900">
            {recoveryView === "login" ? "Welcome back" : recoveryView === "complete" ? "Password updated" : recoveryView === "verify" ? "Create a new password" : "Forgot your password?"}
          </h1>
          <p className="mb-8 mt-2 text-sm text-muted">
            {recoveryView === "login" ? "Sign in to your account." : recoveryView === "verify" ? `Enter the 6-digit code sent to ${recoveryEmail}.` : recoveryView === "complete" ? "You can now sign in using your new password." : "Enter your account email and we’ll send a reset code if it matches an account."}
          </p>

          {recoveryView === "login" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink900">Email address</label>
                <div className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3.5 py-3 transition-colors focus-within:border-primary">
                  <Mail size={16} className="text-muted" />
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="Enter Your Email"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink900">Password</label>
                <div className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3.5 py-3 transition-colors focus-within:border-primary">
                  <Lock size={16} className="text-muted" />
                  <input
                    type="password"
                    name="password"
                    required
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Enter Your Password"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                  />
                </div>
              </div>

              {error && <p className="text-sm font-medium text-risk">{error}</p>}

              <div className="flex justify-end">
                <button type="button" onClick={() => { setRecoveryEmail(form.email); setRecoveryError(""); setRecoveryView("request"); }} className="text-xs font-semibold text-primary hover:text-primary-dark">
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={loading} className="mt-2 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}

          {recoveryView === "request" && (
            <form onSubmit={handleRequestResetCode} className="space-y-4">
              <label className="block text-xs font-semibold text-ink900">
                Email address
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3.5 py-3 focus-within:border-primary">
                  <Mail size={16} className="text-muted" />
                  <input type="email" required value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="Enter Your Email" className="w-full bg-transparent text-sm font-normal outline-none placeholder:text-muted" />
                </div>
              </label>
              {recoveryError && <p role="alert" className="text-sm font-medium text-risk">{recoveryError}</p>}
              <button type="submit" disabled={recoveryLoading} className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
                {recoveryLoading ? "Sending code..." : "Send reset code"}
              </button>
              <button type="button" onClick={backToLogin} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink900"><ArrowLeft size={15} /> Back to sign in</button>
            </form>
          )}

          {recoveryView === "verify" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {recoveryMessage && <p role="status" className="rounded-lg border border-primary/15 bg-primary-light px-3 py-2 text-sm text-primary-dark">{recoveryMessage}</p>}
              <label className="block text-xs font-semibold text-ink900">
                6-digit reset code
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3.5 py-3 focus-within:border-primary">
                  <KeyRound size={16} className="text-muted" />
                  <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={resetCode} onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" className="w-full bg-transparent text-sm tracking-[0.2em] outline-none" />
                </div>
              </label>
              <label className="block text-xs font-semibold text-ink900">
                New password
                <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-primary" />
              </label>
              <label className="block text-xs font-semibold text-ink900">
                Confirm new password
                <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3.5 py-3 text-sm font-normal outline-none focus:border-primary" />
              </label>
              {recoveryError && <p role="alert" className="text-sm font-medium text-risk">{recoveryError}</p>}
              <button type="submit" disabled={recoveryLoading} className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
                {recoveryLoading ? "Updating password..." : "Reset password"}
              </button>
              <button type="button" onClick={handleRequestResetCode} disabled={recoveryLoading} className="text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-50">Send another code</button>
              <button type="button" onClick={backToLogin} className="ml-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink900"><ArrowLeft size={15} /> Back to sign in</button>
            </form>
          )}

          {recoveryView === "complete" && (
            <div className="space-y-5">
              <p role="status" className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary-light px-3 py-3 text-sm text-primary-dark"><Check size={16} />{recoveryMessage}</p>
              <button type="button" onClick={backToLogin} className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark">Back to sign in</button>
            </div>
          )}

          {(recoveryView === "login" || recoveryView === "request") && (
            <p className="mt-8 text-center text-xs text-muted">
              Access is limited to authorized Psychometricians and Social Workers of Manila Boys&apos; Town Complex.
            </p>
          )}
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden overflow-hidden bg-ink p-16 text-white lg:flex lg:items-end">
        <div className="absolute inset-0 opacity-[0.1]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)", backgroundSize: "52px 52px", maskImage: "linear-gradient(to bottom right, black, transparent 75%)" }} />
        <div className="absolute right-[-8rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="absolute right-[-3rem] top-[-5rem] h-[24rem] w-[24rem] rounded-full border border-white/10" />
        <div className="relative max-w-xl pb-4">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-[#E4B968]">Manila Boys&apos; Town Complex</p>
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Care begins with seeing the whole person.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/65">
            A shared workspace for client records, development plans, counseling documentation, and coordinated care.
          </p>
          <div className="mt-14 flex items-center gap-3 text-xs text-white/45">
            <span className="h-px w-10 bg-[#E4B968]" />
            KALAKBAY AI <span className="text-white/25">/</span> Manila Boys&apos; Town Complex
          </div>
        </div>
      </div>
    </div>
  );
}
