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
    <div className="min-h-screen flex bg-surface">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Compass size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <p className="font-display font-bold text-lg text-ink900">
              KALAKBAY <span className="text-primary">AI</span>
            </p>
          </div>

          <h1 className="font-display text-2xl font-bold text-ink900">Welcome back</h1>
          <p className="text-sm text-muted mt-1.5 mb-8">
            Sign in here.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink900 mb-1.5 block">Email</label>
              <div className="flex items-center gap-2 bg-white border border-ink/10 rounded-lg px-3.5 py-2.5 shadow-card focus-within:border-primary">
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
              <label className="text-sm font-medium text-ink900 mb-1.5 block">Password</label>
              <div className="flex items-center gap-2 bg-white border border-ink/10 rounded-lg px-3.5 py-2.5 shadow-card focus-within:border-primary">
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
              className="w-full bg-primary hover:bg-primary-dark transition-colors text-white font-semibold text-sm rounded-lg py-3 mt-2 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-ink/10 bg-white/60 p-3 text-xs text-muted space-y-1.5">
            <p className="font-semibold text-ink900">Initial superadmin account</p>
            <p>superadmin@boystown.org / superadmin123</p>
            <p>Superadmin can create the rest of the staff accounts in Admin Management.</p>
          </div>

          <p className="text-xs text-muted text-center mt-8">
            Access is limited to authorized Psychometricians and Social Workers of
            Manila Boys&apos; Town Complex.
          </p>
        </div>
      </div>

      {/* Right: brand panel */}
      <div className="hidden lg:flex flex-1 bg-ink relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
        <div className="relative max-w-md text-white">
          <h2 className="font-display text-3xl font-bold mt-4 leading-tight">
            Welcome to Manila Boys&apos; Town Complex
          </h2>
          <p className="text-white/60 text-sm mt-4 leading-relaxed">
            KALAKBAY AI is a case management website that helps staff organize client records,
            care plans, counseling documentation, and reports.
          </p>
        </div>
      </div>
    </div>
  );
}
