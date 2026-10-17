import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api.js";

// Keeps the selected client in the URL (?client=ID) so other pages can deep-link here.
export default function ClientPicker({ onChange }) {
  const [params, setParams] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");
  const selected = params.get("client") || "";

  useEffect(() => {
    api.get("/clients")
      .then((response) => {
        setClients([...response.data].sort((first, second) => first.name.localeCompare(second.name)));
      })
      .catch((requestError) => setError(requestError?.response?.data?.message || "Could not load clients."));
  }, []);

  useEffect(() => {
    onChange(selected ? clients.find((client) => String(client.id) === selected) || null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, clients]);

  return (
    <div>
      <label htmlFor="client-picker" className="mb-1.5 block text-sm font-semibold text-ink900">Client</label>
      <select
        id="client-picker"
        value={selected}
        onChange={(event) => setParams(event.target.value ? { client: event.target.value } : {}, { replace: true })}
        className="min-h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-sm sm:max-w-md"
      >
        <option value="">Select a client...</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.name} — {client.home_name}</option>
        ))}
      </select>
      {error && <p role="alert" className="mt-2 text-sm text-risk">{error}</p>}
    </div>
  );
}
