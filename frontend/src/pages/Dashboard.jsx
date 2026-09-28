import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Users, UserRoundCog, BriefcaseBusiness, BarChart3 } from "lucide-react";
import StatCard from "../components/StatCard.jsx";
import api from "../services/api.js";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
const imageUrl = (value) => value?.startsWith("http") ? value : `${API_ORIGIN}${value}`;

const ROLE_LABELS = {
  superadmin: "Officer-in-Charge",
  admin: "Admin",
  social_worker: "Social Worker",
  psychometrician: "Psychometrician",
  user: "Psychometrician",
};

const ROLE_NAMES = {
  superadmin: "Superadmins",
  admin: "Admins",
  social_worker: "Social Workers",
  psychometrician: "Psychometricians",
  user: "Users",
};

export default function Dashboard() {
  const role = localStorage.getItem("kalakbay_role") || "user";
  const isSuperadmin = role === "superadmin";
  const isPsychometrician = role === "psychometrician" || role === "user";
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    api.get("/dashboard")
      .then((response) => {
        if (!cancelled) setSummary(response.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load live dashboard data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = summary ? isSuperadmin
    ? [
        { label: "Client records", value: summary.totals.clients, tone: "primary", icon: Users },
        { label: "Staff accounts", value: summary.totals.accounts, tone: "amber", icon: UserRoundCog },
        { label: "Homes with records", value: summary.totals.homes, tone: "primary", icon: Building2 },
      ]
    : isPsychometrician
      ? [
          { label: "Clients assigned", value: summary.totals.clients, tone: "primary", icon: Users },
          { label: "Homes represented", value: summary.totals.homes, tone: "amber", icon: Building2 },
        ]
      : [
          { label: "Client records", value: summary.totals.clients, tone: "primary", icon: Users },
          { label: "Homes with clients", value: summary.totals.homes, tone: "amber", icon: Building2 },
          { label: "Largest home caseload", value: Math.max(0, ...summary.clientsByHome.map((home) => home.client_count)), tone: "primary", icon: BriefcaseBusiness },
        ]
    : [];

  return (
    <div className="space-y-7">
      <section>
        <h2 className="font-display text-[25px] font-semibold uppercase leading-tight text-[#262b30]">
          My dashboard
        </h2>
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#7f8992]">
          {isSuperadmin
            ? "Live system and staff account overview"
              : isPsychometrician
                ? "Client and behavior-note overview"
              : "Live home and client overview"}
        </p>
      </section>

      {error && <div role="alert" className="rounded-lg border border-risk/20 bg-risk-light px-4 py-3 text-sm text-risk">{error}</div>}

      {loading ? (
        <p className="rounded-lg border border-[#e3e6e9] bg-white p-6 text-sm text-muted">Loading live dashboard data...</p>
      ) : summary ? (
        <>
          <section className={`grid grid-cols-2 gap-4 ${stats.length >= 4 ? "lg:grid-cols-3 xl:grid-cols-5" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </section>

          {isSuperadmin && summary.usersByRole?.length > 0 && (
            <section className="rounded-lg border border-[#e3e6e9] bg-white p-5 shadow-[0_1px_2px_rgba(22,28,33,0.04)]">
              <div className="mb-4 flex items-center gap-3 border-b border-ink/5 pb-4">
                <UserRoundCog size={19} className="text-primary" />
                <h3 className="font-display text-lg font-bold text-ink900">Accounts by role</h3>
              </div>
              <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {summary.usersByRole.map((item) => (
                  <div key={item.role} className="flex items-center justify-between border-b border-ink/5 py-3 text-sm">
                    <span className="capitalize text-muted">{ROLE_NAMES[item.role] || item.role.replaceAll("_", " ")}</span>
                    <span className="font-semibold text-ink900">{item.account_count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-[#e3e6e9] bg-white p-5 shadow-[0_1px_2px_rgba(22,28,33,0.04)]">
            <div className="mb-4 flex items-center gap-3 border-b border-ink/5 pb-4">
              <BarChart3 size={19} className="text-primary" />
              <div>
                <h3 className="font-display text-lg font-bold text-ink900">
                  {isPsychometrician ? "Client records" : "Client Records of Home Cares"}
                </h3>
                <p className="text-sm text-muted">
                  {isPsychometrician ? "Client name, age, and home." : "Counts are read directly from current database records."}
                </p>
              </div>
            </div>
            {isPsychometrician ? (
              summary.psychometricianClients.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted">No client records have been added yet.</p>
              ) : (
                <div className="divide-y divide-ink/5">
                  {summary.psychometricianClients.map((client, index) => (
                    <article key={client.id || `${client.name}-${client.age}-${index}`} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {client.present_picture ? (
                            <img src={imageUrl(client.present_picture)} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary-dark">
                              {client.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join("") || "C"}
                            </span>
                          )}
                          <h4 className="truncate font-semibold text-ink900">{client.name}</h4>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                          <span>Age {client.age ?? "not recorded"}</span>
                          <span className="rounded-md bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary-dark">{client.home_name}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : summary.clientsByHome.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted">No client records are in the database yet.</p>
            ) : (
              <div className="divide-y divide-ink/5">
                {summary.clientsByHome.map((home) => (
                  <div key={home.home_name} className="flex items-center justify-between gap-4 py-3">
                    <Link to={homeRoute(home.home_name)} className="text-sm font-medium text-primary hover:text-primary-dark">
                      {home.home_name}
                    </Link>
                    <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary-dark">
                      {home.client_count} record(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function homeRoute(homeName) {
  const routes = {
    "Girls Home": "/girls-home",
    "Boys Home": "/boys-home",
    "Kids Home": "/kids-home",
    "Home for the Aged": "/aged-home",
    Kamada: "/kamada",
  };
  return routes[homeName] || "/dashboard";
}
