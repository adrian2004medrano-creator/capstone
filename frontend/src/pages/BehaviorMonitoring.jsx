import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ClipboardList, Database, Download, FileText, HeartHandshake, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import RiskBadge from "../components/RiskBadge.jsx";
import api from "../services/api.js";

const RATINGS = [
  ["mood", "Mood", "1 = very low, 5 = very good"],
  ["participation", "Participation in activities", "1 = none, 5 = full"],
  ["cooperation", "Cooperation with staff", "1 = resistant, 5 = fully cooperative"],
  ["peer_relations", "Peer relationships", "1 = conflict, 5 = positive"],
];
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (clientId = "") => ({
  client_id: clientId, observed_on: today(), mood: 3, participation: 3, cooperation: 3, peer_relations: 3,
  aggression: 0, incident_count: 0, behaviors: [], incident_details: "", activities: "", progress_notes: "", concerns: "", follow_up_needed: false,
});
const daysSince = (date) => (date ? Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000) : null);
const inputClass = "min-h-10 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm";

const SUMMARY_CARDS = [
  ["high", "High risk", "text-risk"],
  ["medium", "Medium risk", "text-caution"],
  ["low", "Low risk", "text-primary-dark"],
];

export default function BehaviorMonitoring() {
  const role = localStorage.getItem("kalakbay_role") || "user";
  const isAdmin = ["superadmin", "admin"].includes(role);
  const canPlan = ["superadmin", "admin", "social_worker"].includes(role);
  const canRespond = ["superadmin", "psychometrician", "user"].includes(role);

  const [catalog, setCatalog] = useState([]);
  const [remarkDrafts, setRemarkDrafts] = useState({});
  const [documentFiles, setDocumentFiles] = useState([]);
  const [uploadKey, setUploadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [datasetFile, setDatasetFile] = useState(null);
  const [datasetKey, setDatasetKey] = useState(0);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const detailRef = useRef(null);

  const loadModelInfo = useCallback(async () => {
    try {
      setModelInfo((await api.get("/ai/model")).data);
    } catch {
      // The overview request reports connection problems.
    }
  }, []);

  // Training runs on the server; keep checking until it finishes.
  useEffect(() => {
    if (!modelInfo?.training) return undefined;
    const timer = window.setTimeout(loadModelInfo, 3000);
    return () => window.clearTimeout(timer);
  }, [modelInfo, loadModelInfo]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewResponse, modelResponse] = await Promise.all([api.get("/behavior/risk-overview"), api.get("/ai/model")]);
      setOverview(overviewResponse.data);
      setModelInfo(modelResponse.data);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load behavior monitoring data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    api.get("/behavior/catalog").then((response) => setCatalog(response.data.groups)).catch(() => {});
  }, [loadOverview]);

  const behaviorLabels = useMemo(() => Object.fromEntries(catalog.flatMap((group) => group.items).map((item) => [item.key, item])), [catalog]);

  const loadDetail = async (clientId) => {
    try {
      const { data } = await api.get(`/behavior/clients/${clientId}`);
      setDetail(data);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not load the client's behavior history.");
    }
  };

  const openDetail = async (clientId) => {
    await loadDetail(clientId);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const visibleClients = useMemo(() => {
    if (!overview) return [];
    const term = search.trim().toLowerCase();
    return overview.clients.filter((client) => {
      return (!levelFilter || client.risk_level === levelFilter) && (!term || client.name.toLowerCase().includes(term) || client.home_name.toLowerCase().includes(term));
    });
  }, [overview, levelFilter, search]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/behavior/observations", {
        ...form,
        mood: Number(form.mood), participation: Number(form.participation), cooperation: Number(form.cooperation),
        peer_relations: Number(form.peer_relations), aggression: Number(form.aggression), incident_count: Number(form.incident_count),
      });
      const noticed = data.note_findings?.length ? ` The AI noticed in your notes: ${data.note_findings.join("; ").toLowerCase()}.` : "";
      setSuccess(`Observation saved. AI risk level: ${data.assessment?.risk_level} (score ${data.assessment?.risk_score}).${noticed}`);
      const clientId = form.client_id;
      setForm(null);
      await loadOverview();
      if (detail && String(detail.client.id) === String(clientId)) await loadDetail(clientId);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not save the observation.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteObservation = async (observation) => {
    if (!window.confirm(`Delete the observation from ${observation.observed_on}?`)) return;
    try {
      await api.delete(`/behavior/observations/${observation.id}`);
      await Promise.all([loadOverview(), loadDetail(detail.client.id)]);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the observation.");
    }
  };

  const refreshAfterChange = async (clientId) => {
    await Promise.all([loadOverview(), loadDetail(clientId)]);
  };

  const handleSaveRemarks = async (observation) => {
    const remarks = (remarkDrafts[observation.id] ?? "").trim();
    if (!remarks) return;
    try {
      await api.put(`/behavior/observations/${observation.id}/remarks`, { remarks });
      setRemarkDrafts((current) => ({ ...current, [observation.id]: "" }));
      await refreshAfterChange(detail.client.id);
      setSuccess("Remarks saved. The observer was notified.");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not save the remarks.");
    }
  };

  const handleDocumentUpload = async (event) => {
    event.preventDefault();
    if (!documentFiles.length) return;
    const payload = new FormData();
    documentFiles.forEach((file) => payload.append("documents", file));
    setUploading(true);
    setError("");
    try {
      const { data } = await api.post(`/behavior/clients/${detail.client.id}/documents`, payload);
      setDocumentFiles([]);
      setUploadKey((key) => key + 1);
      await refreshAfterChange(detail.client.id);
      setSuccess(data.assessment ? `${data.message} Risk level: ${data.assessment.risk_level}.` : data.message);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not upload the documents.");
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentDownload = async (document) => {
    try {
      const response = await api.get(`/behavior/documents/${document.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.original_name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not download the document.");
    }
  };

  const handleDocumentDelete = async (document) => {
    if (!window.confirm(`Delete ${document.original_name}?`)) return;
    try {
      await api.delete(`/behavior/documents/${document.id}`);
      await refreshAfterChange(detail.client.id);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not delete the document.");
    }
  };

  const toggleBehavior = (key) => setForm((current) => ({
    ...current,
    behaviors: current.behaviors.includes(key) ? current.behaviors.filter((item) => item !== key) : [...current.behaviors, key],
  }));

  const handleDatasetUpload = async (event) => {
    event.preventDefault();
    if (!datasetFile) return;
    const payload = new FormData();
    payload.append("dataset", datasetFile);
    setDatasetBusy(true);
    setError("");
    try {
      const { data } = await api.post("/ai/datasets", payload);
      setModelInfo(data.status);
      setSuccess(data.message);
      setDatasetFile(null);
      setDatasetKey((key) => key + 1);
      await loadOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not add the dataset.");
    } finally {
      setDatasetBusy(false);
    }
  };

  const handleDatasetDelete = async (dataset) => {
    if (!window.confirm(`Remove ${dataset.name}? The AI will retrain without it.`)) return;
    setDatasetBusy(true);
    setError("");
    try {
      const { data } = await api.delete(`/ai/datasets/${encodeURIComponent(dataset.name)}`);
      setModelInfo(data.status);
      setSuccess(data.message);
      await loadOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Could not remove the dataset.");
    } finally {
      setDatasetBusy(false);
    }
  };

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
              <Activity size={20} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-ink900">Behavior Monitoring and Risk Alerts</h2>
              <p className="mt-1 text-sm text-muted">
                Record daily observations. The AI model analyzes behavior patterns and flags low, medium, or high risk.
              </p>
              {modelInfo?.training && (
                <p className="mt-1 text-xs text-primary-dark">The AI is training on the latest datasets...</p>
              )}
              {modelInfo && !modelInfo.training && modelInfo.ready && (
                <p className="mt-1 text-xs text-muted">
                  AI trains automatically from datasets · risk model: {modelInfo.risk.samples} rows, {Math.round(modelInfo.risk.test_accuracy * 100)}% test accuracy
                  · text model: {modelInfo.text.samples} rows, {Math.round((modelInfo.text.test_accuracy ?? 0) * 100)}% test accuracy
                </p>
              )}
              {modelInfo?.error && <p className="mt-1 text-xs text-risk">{modelInfo.error}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadOverview} disabled={loading} aria-label="Refresh" title="Refresh"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ink/10 text-muted hover:bg-surface disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button type="button" onClick={() => setForm(emptyForm(detail?.client.id || ""))}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">
              <Plus size={16} /> Record observation
            </button>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-risk-light px-3 py-2 text-sm text-risk">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark">{success}</p>}
      </section>

      {role === "superadmin" && modelInfo && (
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-ink900"><Database size={19} /></span>
            <div>
              <h3 className="font-display text-base font-bold text-ink900">AI training datasets</h3>
              <p className="mt-1 text-sm text-muted">
                Add CSV datasets and the AI trains on them automatically. Use a <strong>text</strong> dataset (a text column such as <code>text</code> or <code>statement</code>, and a label column such as <code>category</code> or <code>status</code>) for mental-health and behavior wording,
                or a <strong>structured</strong> dataset of observation scores with a <code>risk_level</code> column.
              </p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-ink/5 text-sm">
            {modelInfo.datasets.map((dataset) => (
              <li key={dataset.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium text-ink900">{dataset.name}</p>
                  <p className={`text-xs ${dataset.error ? "text-risk" : "text-muted"}`}>
                    {dataset.error || `${dataset.type} dataset · ${dataset.rows} usable rows${dataset.skipped ? ` · ${dataset.skipped} skipped` : ""}`}
                  </p>
                </div>
                <button type="button" onClick={() => handleDatasetDelete(dataset)} disabled={datasetBusy} aria-label={`Remove ${dataset.name}`} className="text-muted hover:text-risk disabled:opacity-50"><Trash2 size={15} /></button>
              </li>
            ))}
            {modelInfo.datasets.length === 0 && <li className="py-2 text-muted">No datasets yet.</li>}
          </ul>
          <form onSubmit={handleDatasetUpload} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input key={datasetKey} type="file" accept=".csv,text/csv" aria-label="Choose a CSV dataset"
              onChange={(event) => setDatasetFile(event.target.files?.[0] || null)}
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
            <button type="submit" disabled={!datasetFile || datasetBusy}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              <Upload size={16} /> {datasetBusy ? "Training..." : "Add dataset"}
            </button>
          </form>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SUMMARY_CARDS.map(([key, label, tone]) => (
          <button key={key} type="button" onClick={() => setLevelFilter(levelFilter === key ? "" : key)}
            className={`rounded-xl2 bg-white p-5 text-left shadow-card transition-shadow ${levelFilter === key ? "ring-2 ring-primary" : ""}`}>
            <p className="text-sm text-muted">{label}</p>
            <p className={`mt-1 font-display text-3xl font-bold ${tone}`}>{overview?.totals[key] ?? "–"}</p>
          </button>
        ))}
      </div>

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-base font-bold text-ink900">Clients by risk</h3>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or home"
            aria-label="Search clients" className={`${inputClass} sm:max-w-xs`} />
        </div>
        {loading && !overview ? (
          <p className="py-8 text-center text-sm text-muted">Loading...</p>
        ) : visibleClients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No clients match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Risk</th>
                  <th className="px-3 py-3">AI-identified factors</th>
                  <th className="px-3 py-3">Last observed</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {visibleClients.map((client) => {
                  const age = daysSince(client.last_observed);
                  return (
                    <tr key={client.id} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink900">{client.name}</p>
                        <p className="text-xs text-muted">{client.home_name}{client.age ? ` · ${client.age} y/o` : ""}</p>
                        {client.awaiting_response > 0 && (
                          <span className="mt-1 inline-block rounded-full bg-caution-light px-2 py-0.5 text-xs font-semibold text-caution">
                            Awaiting psychometrician ({client.awaiting_response})
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3"><RiskBadge level={client.risk_level} score={client.risk_score} /></td>
                      <td className="max-w-sm px-3 py-3 text-muted">
                        {client.factors.length ? client.factors.map((factor) => factor.text).join("; ") : client.risk_level ? "No notable risk factors" : "Record an observation to assess risk"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {client.last_observed ? (
                          <span className={age > 14 ? "text-caution" : ""}>
                            {client.last_observed}{age > 14 ? ` (${age}d ago)` : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <button type="button" onClick={() => openDetail(client.id)} className="font-semibold text-primary hover:text-primary-dark">View</button>
                        {canPlan && (
                          <>
                            <Link to={`/idp?client=${client.id}`} title="Individual development plan" aria-label={`IDP for ${client.name}`} className="ml-3 inline-block align-middle text-muted hover:text-primary"><ClipboardList size={16} /></Link>
                            <Link to={`/counseling?client=${client.id}`} title="Counseling sessions" aria-label={`Counseling for ${client.name}`} className="ml-2 inline-block align-middle text-muted hover:text-primary"><HeartHandshake size={16} /></Link>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <section ref={detailRef} className="scroll-mt-24 rounded-xl2 bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-ink900">{detail.client.name}</h3>
              <p className="text-sm text-muted">{detail.client.home_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setForm(emptyForm(detail.client.id))} className="min-h-9 rounded-lg border border-ink/10 px-3 text-sm font-semibold hover:bg-surface">
                Add observation
              </button>
              <button type="button" onClick={() => setDetail(null)} aria-label="Close details" className="rounded-md p-2 text-muted hover:bg-surface"><X size={16} /></button>
            </div>
          </div>

          {detail.assessment ? (
            <div className="mt-4 rounded-lg bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <RiskBadge level={detail.assessment.risk_level} score={detail.assessment.risk_score} />
                <span className="text-xs text-muted">Based on the latest {detail.assessment.observation_count} observation(s) · score is 0-100</span>
              </div>
              {detail.assessment.factors.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-ink900">
                  {detail.assessment.factors.map((factor) => (
                    <li key={factor.key} className="flex items-start gap-2"><AlertTriangle size={14} className="mt-1 shrink-0 text-caution" />{factor.text}</li>
                  ))}
                </ul>
              )}
              {detail.assessment_history.length > 1 && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Risk score trend</p>
                  <div className="flex h-16 items-end gap-1">
                    {detail.assessment_history.map((point, index) => (
                      <div key={index} title={`${point.risk_level} (${point.risk_score})`} className="flex-1 rounded-t bg-primary"
                        style={{ height: `${Math.max(4, point.risk_score)}%`, opacity: 0.4 + (index / detail.assessment_history.length) * 0.6 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">No observations yet.</p>
          )}

          <h4 className="mt-5 text-sm font-bold text-ink900">Recent observations</h4>
          <ul className="mt-2 divide-y divide-ink/5">
            {detail.observations.map((observation) => (
              <li key={observation.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink900">
                    {observation.observed_on}
                    <span className="ml-2 font-normal text-muted">by {observation.observer_name || "unknown"}</span>
                    {observation.follow_up_needed && <span className="ml-2 rounded-full bg-caution-light px-2 py-0.5 text-xs font-semibold text-caution">Follow-up needed</span>}
                  </p>
                  {isAdmin && (
                    <button type="button" onClick={() => handleDeleteObservation(observation)} aria-label="Delete observation" className="text-muted hover:text-risk"><Trash2 size={15} /></button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  Mood {observation.mood}/5 · Participation {observation.participation}/5 · Cooperation {observation.cooperation}/5 · Peers {observation.peer_relations}/5 · Aggression {observation.aggression}/4 · Incidents {observation.incident_count}
                </p>
                {observation.behaviors.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {observation.behaviors.map((key) => (
                      <span key={key} className={`rounded-full px-2 py-0.5 text-xs ${behaviorLabels[key]?.weight < 0 ? "bg-primary-light text-primary-dark" : "bg-surface text-ink900"}`}>
                        {behaviorLabels[key]?.label || key}
                      </span>
                    ))}
                  </div>
                )}
                {[["Behavior described", observation.incident_details], ["Activities", observation.activities], ["Progress", observation.progress_notes], ["Concerns", observation.concerns]]
                  .filter(([, value]) => value).map(([label, value]) => (
                    <p key={label} className="mt-1 text-ink900"><span className="font-semibold">{label}:</span> {value}</p>
                  ))}

                {observation.psychometrician_remarks ? (
                  <div className="mt-2 rounded-lg border-l-4 border-primary bg-primary-light/50 px-3 py-2">
                    <p className="text-xs font-semibold text-primary-dark">
                      Psychometrician remarks · {observation.remarks_by_name || "unknown"} · {observation.remarks_at}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-ink900">{observation.psychometrician_remarks}</p>
                  </div>
                ) : (observation.follow_up_needed || observation.concerns) && (
                  <p className="mt-2 text-xs font-semibold text-caution">Awaiting psychometrician response</p>
                )}
                {canRespond && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <textarea rows={2} maxLength={2000} value={remarkDrafts[observation.id] ?? ""}
                      onChange={(event) => setRemarkDrafts((current) => ({ ...current, [observation.id]: event.target.value }))}
                      placeholder={observation.psychometrician_remarks ? "Update your remarks..." : "Write your remarks or response to this behavior..."}
                      aria-label="Psychometrician remarks" className={`${inputClass} flex-1`} />
                    <button type="button" onClick={() => handleSaveRemarks(observation)} disabled={!(remarkDrafts[observation.id] ?? "").trim()}
                      className="min-h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
                      Save remarks
                    </button>
                  </div>
                )}
              </li>
            ))}
            {detail.observations.length === 0 && <li className="py-3 text-sm text-muted">Nothing recorded.</li>}
          </ul>

          <h4 className="mt-6 text-sm font-bold text-ink900">Case record documents</h4>
          <p className="mt-1 text-xs text-muted">Upload case records (PDF, DOCX, or TXT). The AI reads each file, flags risk indicators, and includes them in the risk assessment.</p>
          <form onSubmit={handleDocumentUpload} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input key={uploadKey} type="file" multiple accept=".pdf,.docx,.txt" aria-label="Choose case record documents"
              onChange={(event) => setDocumentFiles(Array.from(event.target.files || []))}
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm" />
            <button type="submit" disabled={!documentFiles.length || uploading}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              <Upload size={16} /> {uploading ? "Reading..." : "Upload and read"}
            </button>
          </form>
          <ul className="mt-3 space-y-3">
            {detail.documents.map((document) => (
              <li key={document.id} className="rounded-lg border border-ink/10 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 font-medium text-ink900"><FileText size={15} /> {document.original_name}</p>
                  <div className="flex items-center gap-3 text-muted">
                    {canPlan && <button type="button" onClick={() => handleDocumentDownload(document)} aria-label="Download document" className="hover:text-primary"><Download size={15} /></button>}
                    {isAdmin && <button type="button" onClick={() => handleDocumentDelete(document)} aria-label="Delete document" className="hover:text-risk"><Trash2 size={15} /></button>}
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted">Uploaded {new Date(document.uploaded_at).toLocaleDateString()} by {document.uploaded_by_name || "unknown"}</p>
                {document.status === "unreadable" ? (
                  <p className="mt-2 text-xs text-risk">The AI could not read this file. {document.status_note}</p>
                ) : (
                  <>
                    <p className="mt-2 text-ink900">{document.analysis.summary}</p>
                    {document.analysis.categories.map((category) => (
                      <div key={category.key} className="mt-2">
                        <p className="text-xs font-semibold text-ink900">{category.label} <span className="font-normal text-muted">({category.count} mention{category.count === 1 ? "" : "s"})</span></p>
                        {category.evidence.map((sentence) => <p key={sentence} className="text-xs italic text-muted">&ldquo;{sentence}&rdquo;</p>)}
                      </div>
                    ))}
                    {document.analysis.positives.length > 0 && (
                      <p className="mt-2 text-xs text-primary-dark">Positive notes: {document.analysis.positives.join(" ")}</p>
                    )}
                  </>
                )}
              </li>
            ))}
            {detail.documents.length === 0 && <li className="text-sm text-muted">No case records uploaded.</li>}
          </ul>
        </section>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink900/45 p-4" role="dialog" aria-modal="true" aria-label="Record observation">
          <form onSubmit={handleSubmit} className="my-6 w-full max-w-2xl space-y-4 rounded-xl2 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-ink900">Record observation</h3>
              <button type="button" onClick={() => setForm(null)} aria-label="Close" className="rounded-md p-2 text-muted hover:bg-surface"><X size={16} /></button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink900">Client
                <select required value={form.client_id} onChange={(event) => update("client_id", event.target.value)} className={`${inputClass} mt-1 font-normal`}>
                  <option value="">Select a client...</option>
                  {overview?.clients.map((client) => <option key={client.id} value={client.id}>{client.name} — {client.home_name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-ink900">Date observed
                <input required type="date" max={today()} value={form.observed_on} onChange={(event) => update("observed_on", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
              </label>
              {RATINGS.map(([name, label, hint]) => (
                <label key={name} className="block text-sm font-semibold text-ink900">{label}
                  <select value={form[name]} onChange={(event) => update(name, event.target.value)} className={`${inputClass} mt-1 font-normal`}>
                    {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                  <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>
                </label>
              ))}
              <label className="block text-sm font-semibold text-ink900">Aggression level
                <select value={form.aggression} onChange={(event) => update("aggression", event.target.value)} className={`${inputClass} mt-1 font-normal`}>
                  {[0, 1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <span className="mt-0.5 block text-xs font-normal text-muted">0 = none, 4 = severe</span>
              </label>
              <label className="block text-sm font-semibold text-ink900">Incidents today
                <input type="number" min="0" max="50" value={form.incident_count} onChange={(event) => update("incident_count", event.target.value)} className={`${inputClass} mt-1 font-normal`} />
              </label>
            </div>

            <fieldset className="space-y-3 rounded-lg border border-ink/10 p-4">
              <legend className="px-1 text-sm font-semibold text-ink900">Behavior checklist</legend>
              <p className="text-xs text-muted">Check every behavior you observed. Leave all unchecked if nothing notable happened.</p>
              {catalog.map((group) => (
                <div key={group.group}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.group}</p>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <label key={item.key} className="flex items-start gap-2 text-sm text-ink900">
                        <input type="checkbox" className="mt-1" checked={form.behaviors.includes(item.key)} onChange={() => toggleBehavior(item.key)} />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {catalog.length === 0 && <p className="text-sm text-muted">Loading checklist...</p>}
            </fieldset>

            <label className="block text-sm font-semibold text-ink900">Describe the behavior observed
              <textarea rows={4} maxLength={2000} value={form.incident_details} onChange={(event) => update("incident_details", event.target.value)}
                placeholder="What happened, when, who was involved, and how the youth responded. The psychometrician will read this and respond."
                className={`${inputClass} mt-1 font-normal`} />
            </label>
            {[["activities", "Activities and participation"], ["progress_notes", "Progress"], ["concerns", "Concerns"]].map(([name, label]) => (
              <label key={name} className="block text-sm font-semibold text-ink900">{label}
                <textarea rows={2} maxLength={2000} value={form[name]} onChange={(event) => update(name, event.target.value)} className={`${inputClass} mt-1 font-normal`} />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-ink900">
              <input type="checkbox" checked={form.follow_up_needed} onChange={(event) => update("follow_up_needed", event.target.checked)} />
              Needs follow-up monitoring
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setForm(null)} className="min-h-10 rounded-lg border border-ink/10 px-4 text-sm font-semibold hover:bg-surface">Cancel</button>
              <button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
                {saving ? "Saving..." : "Save and assess"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
