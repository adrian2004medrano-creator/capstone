import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Lock, Mail } from "lucide-react";
import api from "../services/api.js";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(440px,0.9fr)_1.1fr]">
      {/* Left: form */}
      <div className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[390px]">
          <div className="mb-12 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink">
              <Compass size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <p className="font-display font-bold text-lg text-ink900">
              KALAKBAY <span className="text-primary">AI</span>
            </p>
          </div>

          <h1 className="font-display text-[27px] font-semibold tracking-normal text-ink900">Welcome back</h1>
          <p className="mb-8 mt-2 text-sm text-muted">
            Sign in to your staff account.
          </p>

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
                  placeholder="you@manilaboystown.org"
                  className="bg-transparent text-sm outline-none w-full placeholder:text-muted"
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
                  placeholder="••••••••"
                  className="bg-transparent text-sm outline-none w-full placeholder:text-muted"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-risk font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="text-xs text-muted text-center mt-8">
            Access is limited to authorized Psychometricians and Social Workers of
            Manila Boys&apos; Town Complex.
          </p>
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
            KALAKBAY AI <span className="text-white/25">/</span> Staff portal
          </div>
        </div>
      </div>
    </div>
  );
}
