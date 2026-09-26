import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Users, UserRoundCog, BriefcaseBusiness, BarChart3, ClipboardList } from "lucide-react";
import StatCard from "../components/StatCard.jsx";
import api from "../services/api.js";

const ROLE_LABELS = {
  superadmin: "Superadmin",
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
          { label: "Clients in behavior review", value: summary.totals.clients, tone: "primary", icon: Users },
          { label: "Behavior notes recorded", value: summary.totals.behaviorNotes, tone: "amber", icon: ClipboardList },
        ]
      : [
          { label: "Client records", value: summary.totals.clients, tone: "primary", icon: Users },
          { label: "Homes with clients", value: summary.totals.homes, tone: "amber", icon: Building2 },
          { label: "Largest home caseload", value: Math.max(0, ...summary.clientsByHome.map((home) => home.client_count)), tone: "primary", icon: BriefcaseBusiness },
        ]
    : [];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{ROLE_LABELS[role] || "Staff"} dashboard</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink900">
          {isSuperadmin ? "System overview" : isPsychometrician ? "Behavior overview" : "Home and client overview"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {isSuperadmin
            ? "Live client and staff account totals from the database."
            : isPsychometrician
              ? "This role can see client names, ages, and recorded behavior notes only. Other personal and case details are restricted."
              : "Live client totals grouped by home. Use the home pages to manage individual case records."}
        </p>
      </section>

      {error && <div role="alert" className="rounded-lg border border-risk/20 bg-risk-light px-4 py-3 text-sm text-risk">{error}</div>}

      {loading ? (
        <p className="rounded-xl2 bg-white p-6 text-sm text-muted shadow-card">Loading live dashboard data...</p>
      ) : summary ? (
        <>
          <section className={`grid grid-cols-2 gap-4 ${stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
          </section>

          {isSuperadmin && summary.usersByRole?.length > 0 && (
            <section className="rounded-xl2 bg-white p-5 shadow-card">
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

          <section className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center gap-3 border-b border-ink/5 pb-4">
              {isPsychometrician ? <ClipboardList size={19} className="text-primary" /> : <BarChart3 size={19} className="text-primary" />}
              <div>
                <h3 className="font-display text-lg font-bold text-ink900">
                  {isPsychometrician ? "Client behavior notes" : "Client records by home"}
                </h3>
                <p className="text-sm text-muted">
                  {isPsychometrician ? "Only name, age, and behavior notes are included." : "Counts are read directly from current database records."}
                </p>
              </div>
            </div>
            {isPsychometrician ? (
              summary.behaviorClients.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted">No client records have been added yet.</p>
              ) : (
                <div className="divide-y divide-ink/5">
                  {summary.behaviorClients.map((client, index) => (
                    <article key={`${client.name}-${client.age}-${index}`} className="py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="font-semibold text-ink900">{client.name}</h4>
                        <span className="text-sm text-muted">Age {client.age ?? "not recorded"}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                        {client.behavior_notes?.trim() || "No behavior notes recorded yet."}
                      </p>
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
