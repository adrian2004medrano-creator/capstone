import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Plus, Sparkles, Trash2 } from "lucide-react";
import ClientPicker from "../components/ClientPicker.jsx";
import RiskBadge from "../components/RiskBadge.jsx";
import api from "../services/api.js";

const STATUS_STYLES = {
  draft: "bg-caution-light text-caution",
  approved: "bg-primary-light text-primary-dark",
  completed: "bg-surface text-muted",
};
const GOAL_STATUS_LABELS = { not_started: "Not started", in_progress: "In progress", achieved: "Achieved" };
const inputClass = "min-h-10 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm";

const toEditable = (plan) => ({
  ...plan,
  summary: plan.summary || "",
  review_date: plan.review_date || "",
  goals: plan.goals.map((goal) => ({ ...goal, strategiesText: (goal.strategies || []).join("\n") })),
});

export default function IDP() {
  const isAdmin = ["superadmin", "admin"].includes(localStorage.getItem("kalakbay_role"));
  const [client, setClient] = useState(null);
  const [plans, setPlans] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clientId = client?.id;

  const loadPlans = useCallback(async (selectId) => {
    if (!clientId) {
      setPlans([]);
      setActiveId(null);
      setDraft(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/idp", { params: { client_id: clientId } });
      setPlans(data);
      const active = data.find((plan) => plan.id === selectId) || data[0] || null;
      setActiveId(active?.id ?? null);
      setDraft(active ? toEditable(active) : null);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load plans.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setSuccess("");
    loadPlans();
  }, [loadPlans]);

  const selectPlan = (plan) => {
    setActiveId(plan.id);
    setDraft(toEditable(plan));
    setSuccess("");
  };

  const handleGenerate = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/idp/generate", { client_id: clientId });
      await loadPlans(data.id);
      setSuccess("AI drafted a new plan. Review and edit it before approval.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not generate a plan.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (status) => {
    setBusy(true);
    setError("");
    try {
      await api.put(`/idp/${draft.id}`, {
        status,
        summary: draft.summary,
        review_date: draft.review_date || null,
        recommendations: draft.recommendations,
        goals: draft.goals.map(({ strategiesText, ...goal }) => ({
          ...goal,
          progress: Number(goal.progress) || 0,
          strategies: strategiesText.split("\n").map((line) => line.trim()).filter(Boolean),
        })),
      });
      await loadPlans(draft.id);
      setSuccess(status === "approved" ? "Plan approved." : status === "completed" ? "Plan marked completed." : "Plan saved.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not save the plan.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this plan permanently?")) return;
    try {
      await api.delete(`/idp/${draft.id}`);
      await loadPlans();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the plan.");
    }
  };

  const setField = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const setGoal = (index, name, value) => setDraft((current) => ({
    ...current,
    goals: current.goals.map((goal, goalIndex) => (goalIndex === index ? { ...goal, [name]: value } : goal)),
  }));
  const addGoal = () => setDraft((current) => ({
    ...current,
    goals: [...current.goals, { area: "", goal: "", strategiesText: "", target_date: "", status: "not_started", progress: 0 }],
  }));
  const removeGoal = (index) => setDraft((current) => ({ ...current, goals: current.goals.filter((_, goalIndex) => goalIndex !== index) }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark"><ClipboardList size={20} /></span>
          <div>
            <h2 className="font-display text-lg font-bold text-ink900">Individual Development Plans</h2>
            <p className="mt-1 text-sm text-muted">
              AI drafts goals and recommendations from each client&apos;s profile and behavior risk. Staff review and edit; an admin approves.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ClientPicker onChange={setClient} />
          {client && (
            <button type="button" onClick={handleGenerate} disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              <Sparkles size={16} /> Generate AI plan
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}
      </section>

      {!client ? (
        <p className="py-6 text-center text-sm text-muted">Select a client to view or create an individual development plan.</p>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading plans...</p>
      ) : plans.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No plan yet for {client.name}. Generate an AI plan to start.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => (
              <button key={plan.id} type="button" onClick={() => selectPlan(plan)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${plan.id === activeId ? "border-primary bg-primary-light" : "border-ink/10 bg-white hover:bg-surface"}`}>
                <span className="block font-semibold text-ink900">{new Date(plan.created_at).toLocaleDateString()}</span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[plan.status]}`}>{plan.status}</span>
              </button>
            ))}
          </div>

          {draft && (
            <section className="space-y-5 rounded-xl2 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[draft.status]}`}>{draft.status}</span>
                {draft.generated_by_ai && <span className="inline-flex items-center gap-1 text-xs text-muted"><Sparkles size={12} /> AI-drafted</span>}
                {draft.risk_level && <RiskBadge level={draft.risk_level} score={draft.risk_score} />}
              </div>

              <label className="block text-sm font-semibold text-ink900">Summary
                <textarea rows={3} maxLength={2000} value={draft.summary} onChange={(event) => setField("summary", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
              </label>
              <label className="block text-sm font-semibold text-ink900 sm:max-w-xs">Next review date
                <input type="date" value={draft.review_date} onChange={(event) => setField("review_date", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-ink900">Goals</h3>
                  <button type="button" onClick={addGoal} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dark"><Plus size={14} /> Add goal</button>
                </div>
                <div className="space-y-4">
                  {draft.goals.map((goal, index) => (
                    <div key={index} className="space-y-3 rounded-lg border border-ink/10 p-4">
                      <div className="flex items-start gap-3">
                        <input value={goal.area} maxLength={100} onChange={(event) => setGoal(index, "area", event.target.value)} placeholder="Area (e.g. Education)" aria-label="Goal area" className={`${inputClass} font-semibold`} />
                        <button type="button" onClick={() => removeGoal(index)} aria-label="Remove goal" className="mt-2 text-muted hover:text-risk"><Trash2 size={16} /></button>
                      </div>
                      <textarea rows={2} maxLength={500} value={goal.goal} onChange={(event) => setGoal(index, "goal", event.target.value)} placeholder="Goal" aria-label="Goal" className={inputClass} />
                      <label className="block text-xs font-semibold text-muted">Strategies (one per line)
                        <textarea rows={3} value={goal.strategiesText} onChange={(event) => setGoal(index, "strategiesText", event.target.value)} className={`${inputClass} mt-1 font-normal text-ink900`} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block text-xs font-semibold text-muted">Target date
                          <input type="date" value={goal.target_date} onChange={(event) => setGoal(index, "target_date", event.target.value)} className={`${inputClass} mt-1 font-normal text-ink900`} />
                        </label>
                        <label className="block text-xs font-semibold text-muted">Status
                          <select value={goal.status} onChange={(event) => setGoal(index, "status", event.target.value)} className={`${inputClass} mt-1 font-normal text-ink900`}>
                            {Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-muted">Progress ({goal.progress}%)
                          <input type="range" min="0" max="100" step="5" value={goal.progress} onChange={(event) => setGoal(index, "progress", event.target.value)} className="mt-3 w-full" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-display text-base font-bold text-ink900">AI recommendations</h3>
                {draft.recommendations.length === 0 ? (
                  <p className="text-sm text-muted">None.</p>
                ) : (
                  <ul className="space-y-2">
                    {draft.recommendations.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-ink900">
                        <span className="flex-1">
                          {item.text}
                          {item.basis && <span className="mt-0.5 block text-xs text-muted">Because: {item.basis}</span>}
                        </span>
                        <button type="button" aria-label="Remove recommendation" onClick={() => setField("recommendations", draft.recommendations.filter((_, itemIndex) => itemIndex !== index))} className="text-muted hover:text-risk"><Trash2 size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/5 pt-4">
                <p className="text-xs text-muted">AI output is decision support. Staff remain responsible for the final plan.</p>
                <div className="flex flex-wrap gap-2">
                  {isAdmin && <button type="button" onClick={handleDelete} className="min-h-10 rounded-lg border border-risk/25 px-4 text-sm font-semibold text-risk hover:bg-risk-light">Delete</button>}
                  <button type="button" disabled={busy} onClick={() => save(isAdmin ? draft.status : "draft")} className="min-h-10 rounded-lg border border-ink/10 px-4 text-sm font-semibold hover:bg-surface disabled:opacity-50">Save changes</button>
                  {isAdmin && draft.status !== "approved" && <button type="button" disabled={busy} onClick={() => save("approved")} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">Approve</button>}
                  {isAdmin && draft.status === "approved" && <button type="button" disabled={busy} onClick={() => save("completed")} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">Mark completed</button>}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
