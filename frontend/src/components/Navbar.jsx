import { Bell, Search, LogOut, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";

function readCachedProfile() {
  try {
    return JSON.parse(localStorage.getItem("kalakbay_user") || "null");
  } catch {
    return null;
  }
}

export default function Navbar({ title, subtitle, onToggleSidebar }) {
  const navigate = useNavigate();
  const [clientName, setClientName] = useState("");
  const [clientResults, setClientResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState(readCachedProfile);
  const searchRole = localStorage.getItem("kalakbay_role") || "user";
  const isPsychometrician = searchRole === "psychometrician" || searchRole === "user";
  const role = user?.role || localStorage.getItem("kalakbay_role") || "user";
  const roleLabel = user?.position || (role === "superadmin" ? "Officer-in-Charge" : role.replaceAll("_", " "));
  const initials = `${user?.first_name?.split(/\s+/).map((part) => part[0]).join("") || "S"}${user?.last_name?.[0] || ""}`.slice(0, 3).toUpperCase();
  const profileImage = user?.profile_picture
    ? new URL(user.profile_picture, api.defaults.baseURL).href
    : "";

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/me")
      .then(({ data }) => {
        if (cancelled) return;
        localStorage.setItem("kalakbay_user", JSON.stringify(data));
        setUser(data);
      })
      .catch(() => {});

    const syncProfile = () => setUser(readCachedProfile());
    window.addEventListener("profile-updated", syncProfile);
    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", syncProfile);
    };
  }, []);

  useEffect(() => {
    const name = clientName.trim();
    if (name.length < 2) {
      setClientResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const timeoutId = window.setTimeout(() => {
      api.get("/search/clients", { params: { name } })
        .then((response) => {
          if (!cancelled) setClientResults(response.data || []);
        })
        .catch(() => {
          if (!cancelled) setClientResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [clientName]);

  const handleLogout = () => {
    localStorage.removeItem("kalakbay_auth");
    localStorage.removeItem("kalakbay_role");
    localStorage.removeItem("kalakbay_token");
    localStorage.removeItem("kalakbay_user");
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-ink/[0.08] bg-surface/95 px-4 py-3.5 backdrop-blur-md sm:px-6 lg:px-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ink/10 bg-white text-ink900 md:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar navigation"
        >
          <Menu size={18} />
        </button>

        <div>
          <h1 className="font-display text-lg font-semibold text-ink900 sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 hidden text-xs text-muted sm:block sm:text-sm">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3.5 py-2 focus-within:border-primary">
            <Search size={16} className="text-muted" />
            <input
              type="search"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search client name..."
              aria-label="Search by client name"
              aria-expanded={searchOpen && clientName.trim().length >= 2}
              className="w-44 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          {searchOpen && clientName.trim().length >= 2 && (
            <div className="absolute right-0 top-full z-30 mt-2 max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-ink/10 bg-white p-2 shadow-card">
              {searching ? (
                <p className="px-3 py-4 text-sm text-muted">Searching client names...</p>
              ) : clientResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted">No clients found with that name.</p>
              ) : clientResults.map((client, index) => isPsychometrician ? (
                <div key={`${client.name}-${client.age}-${index}`} className="border-b border-ink/5 px-3 py-3 last:border-0">
                  <p className="text-sm font-semibold text-ink900">{client.name}</p>
                  <p className="mt-0.5 text-xs text-muted">Age {client.age ?? "not recorded"}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink/75">
                    {client.behavior_notes?.trim() || "No behavior notes recorded yet."}
                  </p>
                </div>
              ) : (
                <button
                  key={client.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setClientName("");
                    setSearchOpen(false);
                    navigate(`/clients/${client.id}`);
                  }}
                  className="block w-full rounded-lg px-3 py-3 text-left hover:bg-surface"
                >
                  <span className="block text-sm font-semibold text-ink900">{client.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">Age {client.age ?? "not recorded"} · {client.home_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-ink/10 bg-white transition-colors hover:bg-surface"
        >
          <Bell size={17} className="text-ink900" />
          <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-risk" />
        </button>

        <button
          type="button"
          onClick={() => navigate("/profile")}
          aria-label="Open your profile settings"
          title="Edit profile"
          className="flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-white focus-visible:outline-offset-1"
        >
          {profileImage ? (
            <img src={profileImage} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light font-display text-xs font-semibold text-primary-dark">
              {initials}
            </span>
          )}
          <div className="hidden lg:block leading-tight">
            <p className="max-w-40 truncate text-sm font-semibold text-ink900">{user ? `${user.first_name} ${user.last_name}` : "Staff Account"}</p>
            <p className="text-xs capitalize text-muted">{roleLabel}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white hover:text-risk"
          title="Log out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
