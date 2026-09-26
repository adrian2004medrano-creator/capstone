import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Eye, X } from "lucide-react";
import api from "../services/api.js";

const INITIAL_FORM = {
  home_name: "",
  past_picture: "",
  present_picture: "",
  name: "",
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

const imageUrl = (value) => value?.startsWith("http") ? value : `${API_ORIGIN}${value}`;

export default function ClientHomePage({ homeName }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...INITIAL_FORM, home_name: homeName });
  const [selectedImages, setSelectedImages] = useState({});
  const [imagePreviews, setImagePreviews] = useState({});

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
    setForm({
      ...INITIAL_FORM,
      home_name: homeName,
      ...client,
      age: client.age ?? "",
      age_when_found: client.age_when_found ?? "",
    });
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
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          <Plus size={16} />
          Add Client
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-risk/20 bg-risk-light px-4 py-3 text-sm text-risk">
          {error}
        </div>
      )}

      <div className="rounded-xl2 bg-white p-4 shadow-card">
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
                    <td className="px-3 py-3 font-medium text-ink900">{client.name}</td>
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
      </div>

      {showForm && (
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
                <span className="text-sm font-medium text-ink900">Name</span>
                <input name="name" value={form.name} onChange={handleChange} required className="w-full rounded-lg border border-ink/10 bg-surface px-3 py-2.5 outline-none focus:border-primary" />
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
                <span className="text-sm font-medium text-ink900">Behavior Notes</span>
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
