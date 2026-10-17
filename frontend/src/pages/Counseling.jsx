import { useCallback, useEffect, useState } from "react";
import { HeartHandshake, Pencil, Sparkles, Trash2 } from "lucide-react";
import ClientPicker from "../components/ClientPicker.jsx";
import RiskBadge from "../components/RiskBadge.jsx";
import api from "../services/api.js";

const STATUS_STYLES = {
  scheduled: "bg-caution-light text-caution",
  completed: "bg-primary-light text-primary-dark",
  cancelled: "bg-surface text-muted",
};
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (plan = null) => ({
  id: null,
  session_date: today(),
  session_type: plan?.session_type || "Supportive counseling",
  status: "scheduled",
  focus: plan ? plan.focus_areas.join("; ").slice(0, 255) : "",
  notes: "",
  outcome: "",
  next_session_date: "",
  ai_plan: plan,
});
const inputClass = "min-h-10 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm";

function PlanList({ title, items }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink900">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export default function Counseling() {
  const isAdmin = ["superadmin", "admin"].includes(localStorage.getItem("kalakbay_role"));
  const [client, setClient] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clientId = client?.id;

  const load = useCallback(async () => {
    setSuccess("");
    setForm(null);
    if (!clientId) {
      setSessions([]);
      setSuggestion(null);
      return;
    }
    setLoading(true);
    try {
      const [sessionResponse, suggestionResponse] = await Promise.all([
        api.get("/counseling/sessions", { params: { client_id: clientId } }),
        api.get("/counseling/suggest", { params: { client_id: clientId } }),
      ]);
      setSessions(sessionResponse.data);
      setSuggestion(suggestionResponse.data);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load counseling data.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshSessions = async () => {
    const { data } = await api.get("/counseling/sessions", { params: { client_id: clientId } });
    setSessions(data);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const { id, ...payload } = form;
    try {
      if (id) await api.put(`/counseling/sessions/${id}`, payload);
      else await api.post("/counseling/sessions", { ...payload, client_id: clientId });
      setForm(null);
      await refreshSessions();
      setSuccess("Session saved.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not save the session.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (session) => {
    if (!window.confirm("Delete this session record?")) return;
    try {
      await api.delete(`/counseling/sessions/${session.id}`);
      await refreshSessions();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the session.");
    }
  };

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const plan = suggestion?.plan;

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark"><HeartHandshake size={20} /></span>
          <div>
            <h2 className="font-display text-lg font-bold text-ink900">AI Counseling Sessions</h2>
            <p className="mt-1 text-sm text-muted">
              AI suggests session type, timing, focus areas, and talking points from the client&apos;s behavior risk. Log each session below.
            </p>
          </div>
        </div>
        <div className="mt-5"><ClientPicker onChange={setClient} /></div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}
      </section>

      {!client ? (
        <p className="py-6 text-center text-sm text-muted">Select a client to see AI session suggestions and counseling records.</p>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading...</p>
      ) : (
        <>
          {plan && (
            <section className="space-y-4 rounded-xl2 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="inline-flex items-center gap-2 font-display text-base font-bold text-ink900"><Sparkles size={16} /> AI session suggestion</h3>
                  <RiskBadge level={suggestion.assessment?.risk_level} score={suggestion.assessment?.risk_score} />
                </div>
                <button type="button" onClick={() => setForm(emptyForm(plan))}
                  className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">
                  Schedule from suggestion
                </button>
              </div>
              {!suggestion.assessment && <p className="text-sm text-muted">No behavior observations yet, so this is a general suggestion. Record observations to personalize it.</p>}
              <div className="grid gap-4 text-sm sm:grid-cols-3">
                <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted">Session type</span>{plan.session_type}</p>
                <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted">Suggested timing</span>{plan.suggested_timing}</p>
                <p><span className="block text-xs font-semibold uppercase tracking-wide text-muted">Frequency</span>{plan.suggested_frequency}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <PlanList title="Focus areas" items={plan.focus_areas} />
                <PlanList title="Techniques" items={plan.techniques} />
                <PlanList title="Talking points" items={plan.talking_points} />
              </div>
              <p className="rounded-lg bg-surface px-3 py-2 text-sm text-ink900">{plan.safety_note}</p>
              <p className="text-xs text-muted">{plan.disclaimer}</p>
            </section>
          )}

          <section className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink900">Sessions</h3>
              <button type="button" onClick={() => setForm(emptyForm())} className="min-h-9 rounded-lg border border-ink/10 px-3 text-sm font-semibold hover:bg-surface">Log session</button>
            </div>

            {form && (
              <form onSubmit={handleSubmit} className="mb-5 space-y-4 rounded-lg border border-ink/10 p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-semibold text-ink900">Date
                    <input required type="date" value={form.session_date} onChange={(event) => update("session_date", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                  </label>
                  <label className="block text-sm font-semibold text-ink900">Session type
                    <input required maxLength={60} value={form.session_type} onChange={(event) => update("session_type", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                  </label>
                  <label className="block text-sm font-semibold text-ink900">Status
                    <select value={form.status} onChange={(event) => update("status", event.target.value)} className={`${inputClass} mt-1 font-normal`}>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-semibold text-ink900">Focus
                  <input maxLength={255} value={form.focus} onChange={(event) => update("focus", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                </label>
                <label className="block text-sm font-semibold text-ink900">Session notes
                  <textarea rows={4} maxLength={4000} value={form.notes} onChange={(event) => update("notes", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                </label>
                <label className="block text-sm font-semibold text-ink900">Outcome
                  <textarea rows={2} maxLength={2000} value={form.outcome} onChange={(event) => update("outcome", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                </label>
                <label className="block text-sm font-semibold text-ink900 sm:max-w-xs">Next session
                  <input type="date" value={form.next_session_date || ""} onChange={(event) => update("next_session_date", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setForm(null)} className="min-h-10 rounded-lg border border-ink/10 px-4 text-sm font-semibold hover:bg-surface">Cancel</button>
                  <button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">{saving ? "Saving..." : "Save session"}</button>
                </div>
              </form>
            )}

            {sessions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">No counseling sessions recorded.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {sessions.map((session) => (
                  <li key={session.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink900">
                        {session.session_date} · {session.session_type}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[session.status]}`}>{session.status}</span>
                      </p>
                      <div className="flex items-center gap-3 text-muted">
                        <button type="button" aria-label="Edit session" onClick={() => setForm({ ...session, next_session_date: session.next_session_date || "", focus: session.focus || "", notes: session.notes || "", outcome: session.outcome || "" })} className="hover:text-primary"><Pencil size={15} /></button>
                        {isAdmin && <button type="button" aria-label="Delete session" onClick={() => handleDelete(session)} className="hover:text-risk"><Trash2 size={15} /></button>}
                      </div>
                    </div>
                    {session.focus && <p className="mt-1 text-muted">Focus: {session.focus}</p>}
                    {session.notes && <p className="mt-1 whitespace-pre-wrap text-ink900">{session.notes}</p>}
                    {session.outcome && <p className="mt-1 text-ink900"><span className="font-semibold">Outcome:</span> {session.outcome}</p>}
                    {session.next_session_date && <p className="mt-1 text-xs text-muted">Next session: {session.next_session_date}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
