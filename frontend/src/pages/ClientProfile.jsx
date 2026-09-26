import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, X, FileText, Upload, Download, Trash2, Pencil } from "lucide-react";
import api from "../services/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const imageUrl = (value) => value?.startsWith("http") ? value : `${API_ORIGIN}${value}`;
const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fullImage, setFullImage] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  const [documentFiles, setDocumentFiles] = useState([]);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const res = await api.get(`/clients/${id}`);
        setClient(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    api.get(`/clients/${id}/documents`)
      .then((response) => {
        if (!cancelled) setDocuments(response.data || []);
      })
      .catch((err) => {
        if (!cancelled) setDocumentsError(err?.response?.data?.message || "Failed to load client documents.");
      })
      .finally(() => {
        if (!cancelled) setDocumentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!fullImage) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFullImage(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullImage]);

  const handleDocumentUpload = async (event) => {
    event.preventDefault();
    if (!documentFiles.length) return;

    const form = event.currentTarget;
    const payload = new FormData();
    documentFiles.forEach((file) => payload.append("documents", file));
    setUploadingDocuments(true);
    setDocumentsError("");

    try {
      await api.post(`/clients/${id}/documents`, payload);
      const response = await api.get(`/clients/${id}/documents`);
      setDocuments(response.data || []);
      setDocumentFiles([]);
      form.reset();
    } catch (err) {
      setDocumentsError(err?.response?.data?.message || "Failed to upload documents.");
    } finally {
      setUploadingDocuments(false);
    }
  };

  const handleDocumentDelete = async (document) => {
    if (!window.confirm(`Delete ${document.original_name}?`)) return;

    try {
      await api.delete(`/clients/${id}/documents/${document.id}`);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setDocumentsError("");
    } catch (err) {
      setDocumentsError(err?.response?.data?.message || "Failed to delete document.");
    }
  };

  const handleDocumentDownload = async (document) => {
    try {
      const response = await api.get(`/clients/${id}/documents/${document.id}/download`, {
        responseType: "blob",
      });
      const downloadUrl = URL.createObjectURL(response.data);
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = document.original_name;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setDocumentsError(err?.response?.data?.message || "Failed to download document.");
    }
  };

  if (loading) {
    return <div className="text-sm text-muted">Loading client profile...</div>;
  }

  if (!client) {
    return (
      <div className="rounded-xl2 bg-white p-6 shadow-card text-sm text-muted">
        Client not found.
      </div>
    );
  }

  const clientName = [client.first_name, client.middle_initial, client.last_name].filter(Boolean).join(" ") || client.name;
  const profileFields = [
    ["First Name", client.first_name],
    ["Middle Initial", client.middle_initial],
    ["Last Name", client.last_name],
    ["Home", client.home_name],
    ["Age", client.age],
    ["Sex", client.sex],
    ["Civil Status", client.civil_status],
    ["Religion", client.religion],
    ["Occupation / Income", client.occupation_income],
    ["Birthdate", client.birthdate],
    ["Birthplace", client.birthplace],
    ["City Address", client.city_address],
    ["Barangay", client.barangay],
    ["Source of Referral", client.source_of_referral],
    ["Date Admitted", client.date_admitted],
    ["Case Category", client.case_category],
    ["Behavior Notes", client.behavior_notes],
    ["Educational Attainment", client.educational_attainment],
    ["School Last Attended", client.school_last_attended],
    ["Grade Level", client.grade_level],
    ["Age When Found", client.age_when_found],
    ["Date & Time When Found", client.date_time_when_found],
    ["Place Where Found", client.place_where_found],
    ["Present Whereabouts", client.present_whereabouts],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="-1" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dark">
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>

      <div className="rounded-xl2 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {client.present_picture ? (
              <img
                src={imageUrl(client.present_picture)}
                alt={`${clientName} profile`}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg font-bold text-primary-dark">
                {clientName?.split(" ").map((word) => word[0]).join(" ").slice(0, 2) || "C"}
              </div>
            )}
            <div>
              <h2 className="font-display text-2xl font-bold text-ink900">{clientName}</h2>
              <p className="text-sm text-muted">Client ID: {client.id} · {client.home_name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(clientHomeRoute(client.home_name), { state: { editClientId: client.id } })}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              <Pencil size={16} /> Edit client
            </button>
          </div>
        </div>
      </div>

      {(client.past_picture || client.present_picture) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {client.past_picture && (
            <figure>
              <button type="button" onClick={() => setFullImage({ src: imageUrl(client.past_picture), label: "Past Picture" })} aria-label="View past picture full size" className="block w-full cursor-zoom-in">
                <img src={imageUrl(client.past_picture)} alt={`${clientName} past`} className="h-64 w-full rounded-xl2 object-cover" />
              </button>
              <figcaption className="mt-2 text-sm text-muted">Past Picture</figcaption>
            </figure>
          )}
          {client.present_picture && (
            <figure>
              <button type="button" onClick={() => setFullImage({ src: imageUrl(client.present_picture), label: "Present Picture" })} aria-label="View present picture full size" className="block w-full cursor-zoom-in">
                <img src={imageUrl(client.present_picture)} alt={`${clientName} present`} className="h-64 w-full rounded-xl2 object-cover" />
              </button>
              <figcaption className="mt-2 text-sm text-muted">Present Picture</figcaption>
            </figure>
          )}
        </div>
      )}

      <section className="rounded-xl2 bg-white p-5 shadow-card">
        <div className="flex items-center gap-3 border-b border-ink/5 pb-4">
          <FileText size={20} className="text-primary" />
          <div>
            <h3 className="font-display text-lg font-bold text-ink900">Client Documents</h3>
            <p className="text-sm text-muted">Files saved for {clientName}</p>
          </div>
        </div>

        {documentsError && (
          <div className="mt-4 rounded-lg border border-risk/20 bg-risk-light px-3 py-2 text-sm text-risk">
            {documentsError}
          </div>
        )}

        <form onSubmit={handleDocumentUpload} className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            multiple
            onChange={(event) => setDocumentFiles(Array.from(event.target.files || []))}
            className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm"
            aria-label="Choose client documents"
          />
          <button
            type="submit"
            disabled={!documentFiles.length || uploadingDocuments}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={16} />
            {uploadingDocuments ? "Uploading..." : `Upload${documentFiles.length ? ` (${documentFiles.length})` : ""}`}
          </button>
        </form>

        <div className="mt-5">
          {documentsLoading ? (
            <p className="py-4 text-sm text-muted">Loading documents...</p>
          ) : documents.length === 0 ? (
            <p className="py-4 text-sm text-muted">No documents uploaded for this client yet.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {documents.map((document) => (
                <li key={document.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={18} className="shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink900">{document.original_name}</p>
                      <p className="text-xs text-muted">
                        {formatFileSize(Number(document.file_size))} · {new Date(document.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDocumentDownload(document)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-primary hover:border-primary"
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDocumentDelete(document)}
                      aria-label={`Delete ${document.original_name}`}
                      className="rounded-lg border border-risk/20 bg-risk-light p-2 text-risk hover:bg-risk hover:text-white"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {profileFields.map(([label, value]) => (
          <div key={label} className="rounded-xl2 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
            <p className="mt-2 text-sm font-medium text-ink900">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      {fullImage && (
        <div
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setFullImage(null);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setFullImage(null)}
            aria-label="Close full-size image"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
          >
            <X size={22} />
          </button>
          <img src={fullImage.src} alt={`${clientName} ${fullImage.label.toLowerCase()}`} className="max-h-[90vh] max-w-[95vw] object-contain" />
        </div>
      )}
    </div>
  );
}

function clientHomeRoute(homeName) {
  const routes = {
    "Girls Home": "/girls-home",
    "Boys Home": "/boys-home",
    "Kids Home": "/kids-home",
    "Home for the Aged": "/aged-home",
    Kamada: "/kamada",
  };
  return routes[homeName] || "/dashboard";
}
