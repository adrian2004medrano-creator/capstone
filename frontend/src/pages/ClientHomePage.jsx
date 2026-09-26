import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Eye, X, FileText, Upload, Download } from "lucide-react";
import api from "../services/api.js";

const INITIAL_FORM = {
  home_name: "",
  past_picture: "",
  present_picture: "",
  first_name: "",
  middle_initial: "",
  last_name: "",
  age: "",
  sex: "",
  civil_status: "",
  religion: "",
  occupation_income: "",
  birthdate: "",
  birthplace: "",
  city_address: "",
  barangay: "",
  source_of_referral: "",
  date_admitted: "",
  case_category: "",
  educational_attainment: "",
  school_last_attended: "",
  grade_level: "",
  age_when_found: "",
  date_time_when_found: "",
  place_where_found: "",
  present_whereabouts: "",
  behavior_notes: "",
};
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const imageUrl = (value) => value?.startsWith("http") ? value : `${API_ORIGIN}${value}`;
const clientFullName = (client) => [client.first_name, client.middle_initial, client.last_name].filter(Boolean).join(" ") || client.name;
const clientFormValues = (client, homeName) => ({
  ...INITIAL_FORM,
  ...client,
  home_name: homeName,
  middle_initial: client.middle_initial ?? "",
  age: client.age ?? "",
  age_when_found: client.age_when_found ?? "",
  birthdate: client.birthdate ? String(client.birthdate).slice(0, 10) : "",
  date_admitted: client.date_admitted ? String(client.date_admitted).slice(0, 10) : "",
  date_time_when_found: client.date_time_when_found ? String(client.date_time_when_found).replace(" ", "T").slice(0, 16) : "",
});

export default function ClientHomePage({ homeName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...INITIAL_FORM, home_name: homeName });
  const [selectedImages, setSelectedImages] = useState({});
  const [imagePreviews, setImagePreviews] = useState({});
  const [activeView, setActiveView] = useState("clients");
  const [reportMonth, setReportMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportFiles, setReportFiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsUploading, setReportsUploading] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const reportType = activeView === "yearly" ? "yearly" : "monthly";
  const reportPeriod = reportType === "monthly" ? reportMonth : reportYear;

  const fetchClients = async () => {
    try {
      setLoading(true);
      const res = await api.get("/clients", { params: { home_name: homeName } });
      setClients(res.data || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [homeName]);

  useEffect(() => {
    if (activeView === "clients") return undefined;

    let cancelled = false;
    setReportsLoading(true);
    setReportsError("");
    api.get("/home-reports", {
      params: { home_name: homeName, report_type: reportType, report_period: reportPeriod },
    })
      .then((response) => {
        if (!cancelled) setReports(response.data || []);
      })
      .catch((err) => {
        if (!cancelled) setReportsError(err?.response?.data?.message || "Failed to load home reports.");
      })
      .finally(() => {
        if (!cancelled) setReportsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeView, homeName, reportPeriod, reportType]);

  useEffect(() => {
    const clientId = location.state?.editClientId;
    if (!clientId || loading) return;

    const client = clients.find((item) => String(item.id) === String(clientId));
    if (!client) return;

    setForm(clientFormValues(client, homeName));
    setEditingId(client.id);
    setShowForm(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [clients, homeName, loading, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!showForm) {
      setForm({ ...INITIAL_FORM, home_name: homeName });
      setEditingId(null);
      Object.values(imagePreviews).forEach((preview) => URL.revokeObjectURL(preview));
      setSelectedImages({});
      setImagePreviews({});
    }
  }, [showForm, homeName]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const { name, files } = e.target;
    const file = files?.[0];
    if (!file) return;

    setImagePreviews((prev) => {
      if (prev[name]) URL.revokeObjectURL(prev[name]);
      return { ...prev, [name]: URL.createObjectURL(file) };
    });
    setSelectedImages((prev) => ({ ...prev, [name]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = new FormData();
      Object.entries({
        ...form,
        home_name: homeName,
        age: form.age === "" ? "" : Number(form.age),
        age_when_found: form.age_when_found === "" ? "" : Number(form.age_when_found),
      }).forEach(([key, value]) => payload.append(key, value ?? ""));
      Object.entries(selectedImages).forEach(([key, file]) => payload.append(key, file));

      if (editingId) {
        await api.put(`/clients/${editingId}`, payload);
      } else {
        await api.post("/clients", payload);
      }

      setShowForm(false);
      fetchClients();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save client record.");
    }
  };

  const handleEdit = (client) => {
    setForm(clientFormValues(client, homeName));
    setEditingId(client.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this client record?")) return;

    try {
      await api.delete(`/clients/${id}`);
      fetchClients();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete client.");
    }
  };

  const handleReportUpload = async (event) => {
    event.preventDefault();
    if (!reportFiles.length) return;

    const formElement = event.currentTarget;
    const payload = new FormData();
    payload.append("home_name", homeName);
    payload.append("report_type", reportType);
    payload.append("report_period", reportPeriod);
    reportFiles.forEach((file) => payload.append("documents", file));
    setReportsUploading(true);
    setReportsError("");

    try {
      await api.post("/home-reports", payload);
      const response = await api.get("/home-reports", {
        params: { home_name: homeName, report_type: reportType, report_period: reportPeriod },
      });
      setReports(response.data || []);
      setReportFiles([]);
      formElement.reset();
    } catch (err) {
      setReportsError(err?.response?.data?.message || "Failed to upload home reports.");
    } finally {
      setReportsUploading(false);
    }
  };

  const handleReportDownload = async (report) => {
    try {
      const response = await api.get(`/home-reports/${report.id}/download`, { responseType: "blob" });
      const downloadUrl = URL.createObjectURL(response.data);
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = report.original_name;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setReportsError(err?.response?.data?.message || "Failed to download report file.");
    }
  };

  const handleReportDelete = async (report) => {
    if (!window.confirm(`Delete ${report.original_name}?`)) return;

    try {
      await api.delete(`/home-reports/${report.id}`);
      setReports((current) => current.filter((item) => item.id !== report.id));
      setReportsError("");
    } catch (err) {
      setReportsError(err?.response?.data?.message || "Failed to delete report file.");
    }
  };

  const totalClients = useMemo(() => clients.length, [clients]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl2 bg-white p-5 shadow-card md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Facility</p>
          <h2 className="font-display text-2xl font-bold text-ink900">{homeName}</h2>
        </div>

        <button
          type="button"
          hidden={activeView !== "clients"}
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          <Plus size={16} />
          Add Client
        </button>
      </div>

      <div role="tablist" aria-label={`${homeName} sections`} className="flex gap-5 border-b border-ink/10">
        {[
          ["clients", "Clients"],
          ["monthly", "Monthly Reports"],
          ["yearly", "Yearly Reports"],
        ].map(([view, label]) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={activeView === view}
            onClick={() => setActiveView(view)}
            className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${activeView === view ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink900"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeView === "clients" && error && (
        <div className="rounded-xl border border-risk/20 bg-risk-light px-4 py-3 text-sm text-risk">
          {error}
        </div>
      )}

      {activeView === "clients" ? <div className="rounded-xl2 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between border-b border-ink/5 pb-3">
          <h3 className="font-display text-lg font-bold text-ink900">Client List</h3>
          <span className="rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary-dark">
            {totalClients} client(s)
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">
            No clients added yet for {homeName}.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Age</th>
                  <th className="px-3 py-3">Sex</th>
                  <th className="px-3 py-3">Barangay</th>
                  <th className="px-3 py-3">Case Category</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-ink/[0.02]">
                    <td className="px-3 py-3 font-medium text-ink900">{clientFullName(client)}</td>
                    <td className="px-3 py-3">{client.age ?? "-"}</td>
                    <td className="px-3 py-3">{client.sex ?? "-"}</td>
                    <td className="px-3 py-3">{client.barangay ?? "-"}</td>
                    <td className="px-3 py-3">{client.case_category ?? "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/clients/${client.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-primary hover:border-primary hover:text-primary-dark"
                        >
                          <Eye size={14} />
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleEdit(client)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink900 hover:border-primary hover:text-primary"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(client.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-risk/20 bg-risk-light px-2.5 py-1.5 text-xs font-semibold text-risk hover:bg-risk hover:text-white"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div> : (
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <div className="flex flex-col gap-4 border-b border-ink/5 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{homeName}</p>
              <h3 className="mt-1 font-display text-lg font-bold text-ink900">
                {reportType === "monthly" ? "Monthly admissions reports" : "Yearly admissions reports"}
              </h3>
              <p className="mt-1 text-sm text-muted">Upload and keep the report files for this care home.</p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-ink900">
              <span>{reportType === "monthly" ? "Month" : "Year"}</span>
              {reportType === "monthly" ? (
                <input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="rounded-lg border border-ink/10 bg-white px-3 py-2 outline-none focus:border-primary" />
              ) : (
                <input type="number" min="2000" max="2100" value={reportYear} onChange={(event) => setReportYear(event.target.value)} className="w-28 rounded-lg border border-ink/10 bg-white px-3 py-2 outline-none focus:border-primary" />
              )}
            </label>
          </div>

          <form onSubmit={handleReportUpload} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              multiple
              onChange={(event) => setReportFiles(Array.from(event.target.files || []))}
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm"
              aria-label={`Choose ${reportType} report files`}
            />
            <button
              type="submit"
              disabled={!reportFiles.length || reportsUploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={16} />
              {reportsUploading ? "Uploading..." : `Upload${reportFiles.length ? ` (${reportFiles.length})` : ""}`}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">You can upload up to 10 files at a time, 20 MB per file.</p>

          {reportsError && <p role="alert" className="mt-4 rounded-lg border border-risk/20 bg-risk-light px-3 py-2 text-sm text-risk">{reportsError}</p>}

          <div className="mt-5 border-t border-ink/5 pt-2">
            {reportsLoading ? (
              <p className="py-4 text-sm text-muted">Loading reports...</p>
            ) : reports.length === 0 ? (
              <p className="py-4 text-sm text-muted">No reports uploaded for {reportPeriod || "this period"} yet.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {reports.map((report) => (
                  <li key={report.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText size={18} className="shrink-0 text-muted" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink900">{report.original_name}</p>
                        <p className="text-xs text-muted">
                          {formatFileSize(Number(report.file_size))} · {new Date(report.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => handleReportDownload(report)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-primary hover:border-primary">
                        <Download size={14} /> Download
                      </button>
                      <button type="button" onClick={() => handleReportDelete(report)} aria-label={`Delete ${report.original_name}`} className="rounded-lg border border-risk/20 bg-risk-light p-2 text-risk hover:bg-risk hover:text-white">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {activeView === "clients" && showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-ink900">
                {editingId ? "Edit Client" : "Add Client"}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">First Name</span>
                <input name="first_name" value={form.first_name} onChange={handleChange} required maxLength={100} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Middle Initial</span>
                <input name="middle_initial" value={form.middle_initial} onChange={handleChange} maxLength={30} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Last Name</span>
                <input name="last_name" value={form.last_name} onChange={handleChange} required maxLength={150} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Age</span>
                <input name="age" type="number" value={form.age} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Sex</span>
                <input name="sex" value={form.sex} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Civil Status</span>
                <input name="civil_status" value={form.civil_status} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Religion</span>
                <input name="religion" value={form.religion} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Occupation / Income</span>
                <input name="occupation_income" value={form.occupation_income} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Birthdate</span>
                <input name="birthdate" type="date" value={form.birthdate} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Birthplace</span>
                <input name="birthplace" value={form.birthplace} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">City Address</span>
                <input name="city_address" value={form.city_address} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Barangay</span>
                <input name="barangay" value={form.barangay} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-ink900">Source of Referral</span>
                <input name="source_of_referral" value={form.source_of_referral} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Date Admitted</span>
                <input name="date_admitted" type="date" value={form.date_admitted} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Case Category</span>
                <input name="case_category" value={form.case_category} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-ink900">Behavior Notes (Optional)</span>
                <textarea name="behavior_notes" value={form.behavior_notes} onChange={handleChange} rows={4} maxLength={10000} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Educational Attainment</span>
                <input name="educational_attainment" value={form.educational_attainment} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">School Last Attended</span>
                <input name="school_last_attended" value={form.school_last_attended} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Grade Level</span>
                <input name="grade_level" value={form.grade_level} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Age When Found</span>
                <input name="age_when_found" type="number" value={form.age_when_found} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Date &amp; Time When Found</span>
                <input name="date_time_when_found" type="datetime-local" value={form.date_time_when_found} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-ink900">Place Where Found</span>
                <input name="place_where_found" value={form.place_where_found} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium text-ink900">Present Whereabouts</span>
                <input name="present_whereabouts" value={form.present_whereabouts} onChange={handleChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Past Picture</span>
                <input name="past_picture" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary" />
                {(imagePreviews.past_picture || form.past_picture) && <img src={imagePreviews.past_picture || imageUrl(form.past_picture)} alt="Past client" className="mt-2 h-24 w-24 rounded-lg object-cover" />}
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-ink900">Present Picture</span>
                <input name="present_picture" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageChange} className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary" />
                {(imagePreviews.present_picture || form.present_picture) && <img src={imagePreviews.present_picture || imageUrl(form.present_picture)} alt="Present client" className="mt-2 h-24 w-24 rounded-lg object-cover" />}
              </label>

              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-ink/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  {editingId ? "Save Changes" : "Add Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
