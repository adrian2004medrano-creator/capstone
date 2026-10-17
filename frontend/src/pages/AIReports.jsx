import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, BrainCircuit, CheckCircle2, ClipboardList, FileText, HeartHandshake, Info, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../services/api.js";

const INSIGHT_STYLES = {
  info: { icon: Info, className: "bg-primary-light text-primary-dark" },
  warning: { icon: AlertTriangle, className: "bg-amber-50 text-amber-700" },
  success: { icon: CheckCircle2, className: "bg-primary-light text-primary-dark" },
};

function BarList({ title, rows, framed = true }) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className={framed ? "rounded-xl2 bg-white p-5 shadow-card" : "min-w-0"}>
      <h3 className="font-display text-base font-bold text-ink900">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No data available.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink900">{row.label}</span>
                <span className="font-semibold text-ink900">{row.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-xl2 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 font-display text-3xl font-bold text-ink900">{value}</p>
          {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark"><Icon size={18} /></span>
      </div>
    </div>
  );
}

function ModuleSection({ title, href, children }) {
  return (
    <section className="rounded-xl2 bg-white p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold text-ink900">{title}</h3>
        <Link to={href} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-ink/10 px-3 py-1.5 text-sm font-semibold text-ink900 transition-colors hover:bg-surface">
          Open module <ArrowUpRight size={15} />
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function AIReports() {
  const [data, setData] = useState(null);
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [response, modelResponse] = await Promise.all([
        api.get("/analytics/overview"),
        api.get("/ai/model").catch(() => null),
      ]);
      setData(response.data);
      setModel(modelResponse?.data || null);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const maxAdmissions = Math.max(1, ...(data?.admissionsByMonth || []).map((item) => item.count));

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-ink900">AI Reports and Analytics</h2>
              <p className="mt-1 text-sm text-muted">
                Automated insights generated from current client and report records.
                {data && ` Updated ${new Date(data.generated_at).toLocaleString()}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            title="Regenerate analysis"
            aria-label="Regenerate analysis"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-ink/10 px-4 py-2 text-sm font-semibold text-ink900 transition-colors hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Regenerate
          </button>
        </div>
        {error && <p role="alert" className="mt-5 rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
      </section>

      {loading && !data ? (
        <p className="py-8 text-center text-sm text-muted">Analyzing records...</p>
      ) : data && (
        <>
          <section className="rounded-xl2 bg-white p-5 shadow-card">
            <h3 className="font-display text-base font-bold text-ink900">Key insights</h3>
            <ul className="mt-4 space-y-2">
              {data.insights.map((insight) => {
                const { icon: Icon, className } = INSIGHT_STYLES[insight.level] || INSIGHT_STYLES.info;
                return (
                  <li key={insight.text} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm ${className}`}>
                    <Icon size={17} className="mt-0.5 shrink-0" />
                    <span>{insight.text}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <BrainCircuit size={19} className="text-primary-dark" />
              <h3 className="font-display text-base font-bold text-ink900">AI workflow overview</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Assessed clients" value={data.ai.risk.assessed_clients} detail="Clients with a recorded risk assessment" icon={ShieldAlert} />
              <Metric label="Development plans" value={data.ai.idp.total} detail={`${data.ai.idp.ai_generated} generated with AI`} icon={ClipboardList} />
              <Metric label="Counseling sessions" value={data.ai.counseling.total} detail={`${data.ai.counseling.ai_assisted} with an AI plan`} icon={HeartHandshake} />
              <Metric label="AI-read case documents" value={data.ai.documents.analyzed} detail={`${data.ai.documents.total} documents recorded`} icon={FileText} />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ModuleSection title="Behavior & Risk Alerts" href="/behavior-monitoring">
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-muted">Observations</p><p className="mt-1 font-semibold text-ink900">{data.ai.behavior.observations}</p></div>
                <div><p className="text-muted">Pending follow-ups</p><p className="mt-1 font-semibold text-ink900">{data.ai.behavior.pending_follow_ups}</p></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <BarList title="Current assessed risk levels" rows={data.ai.risk.levels} framed={false} />
                <BarList title="Recent assessments by month and risk" rows={data.ai.risk.recent_trend} framed={false} />
              </div>
            </ModuleSection>

            <ModuleSection title="Individual Development Plans" href="/idp">
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-muted">Average goal progress</p><p className="mt-1 font-semibold text-ink900">{data.ai.idp.goals.average}%</p></div>
                <div><p className="text-muted">Goals achieved</p><p className="mt-1 font-semibold text-ink900">{data.ai.idp.goals.achieved} / {data.ai.idp.goals.total}</p></div>
              </div>
              <BarList title="Plans by status" rows={data.ai.idp.statuses} framed={false} />
            </ModuleSection>

            <ModuleSection title="AI Counseling Sessions" href="/counseling">
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-muted">Upcoming</p><p className="mt-1 font-semibold text-ink900">{data.ai.counseling.upcoming}</p></div>
                <div><p className="text-muted">AI-assisted</p><p className="mt-1 font-semibold text-ink900">{data.ai.counseling.ai_assisted}</p></div>
              </div>
              <BarList title="Sessions by status" rows={data.ai.counseling.statuses} framed={false} />
            </ModuleSection>

            <ModuleSection title="AI document analysis" href="/behavior-monitoring">
              <BarList title="Case documents by analysis status" rows={data.ai.documents.statuses} framed={false} />
            </ModuleSection>
          </div>

          <section className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark"><BrainCircuit size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-bold text-ink900">AI model status</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${model?.ready ? "bg-primary-light text-primary-dark" : "bg-amber-50 text-amber-700"}`}>
                    {model?.training ? "Training" : model?.ready ? "Ready" : "Unavailable"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Automatic training: {model?.auto_training ? "on" : "unavailable"}. {model?.datasets?.length || 0} dataset(s); {model?.risk?.samples || 0} risk samples and {model?.text?.samples || 0} text samples.
                </p>
                {model?.error && <p className="mt-2 text-sm text-amber-700">{model.error}</p>}
              </div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Client records", data.totals.clients],
              ["Care homes with records", data.totals.homes],
              ["Returning clients", data.totals.returning],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl2 bg-white p-5 shadow-card">
                <p className="text-sm text-muted">{label}</p>
                <p className="mt-1 font-display text-3xl font-bold text-ink900">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl2 bg-white p-5 shadow-card">
            <h3 className="font-display text-base font-bold text-ink900">Admissions, last 12 months</h3>
            <div className="mt-4 flex h-44 items-end gap-2">
              {data.admissionsByMonth.map((item) => (
                <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-semibold text-ink900">{item.count}</span>
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: `${(item.count / maxAdmissions) * 100}%`, minHeight: item.count ? 4 : 2 }}
                    title={`${item.label}: ${item.count}`}
                  />
                  <span className="text-[10px] text-muted">{item.label.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarList title="Clients by care home" rows={data.byHome} />
            <BarList title="Top case categories" rows={data.byCategory} />
            <BarList title="Age groups" rows={data.ageGroups} />
            <BarList title="Sex" rows={data.bySex} />
            <BarList title="Source of referral" rows={data.byReferral} />
            <BarList title="Top barangays" rows={data.byBarangay} />
          </div>
        </>
      )}
    </div>
  );
}
