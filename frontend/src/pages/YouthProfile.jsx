import { useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

export default function YouthProfile() {
  const { id } = useParams();

  // TODO: replace with GET /api/youth/:id
  const youth = {
    id,
    name: "J. Dela Cruz",
    age: 15,
    admitted: "February 2025",
    risk: "high",
    riskNote: "Sudden drop in group participation across the last 3 sessions.",
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl2 shadow-card p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-light text-primary-dark flex items-center justify-center font-display font-bold text-lg">
            {youth.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-ink900">{youth.name}</h2>
            <p className="text-sm text-muted">
              Case #{youth.id} · {youth.age} y/o · Admitted {youth.admitted}
            </p>
          </div>
        </div>

        {youth.risk === "high" && (
          <div className="flex items-start gap-2 bg-risk-light text-risk px-4 py-3 rounded-xl max-w-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">High risk flag</p>
              <p className="text-xs mt-0.5 leading-relaxed">{youth.riskNote}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-xl2 shadow-card p-6">
          <h3 className="font-display font-bold text-ink900 mb-3">Case history</h3>
          <p className="text-sm text-muted leading-relaxed">
            Case records, prior interventions, and family background will render
            here once connected to the backend (GET /api/youth/:id/case-history).
          </p>
        </div>

        <div className="bg-white rounded-xl2 shadow-card p-6">
          <h3 className="font-display font-bold text-ink900 mb-3">Quick links</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a className="text-primary font-medium hover:text-primary-dark" href="/idp">
                View Individual Development Plan →
              </a>
            </li>
            <li>
              <a className="text-primary font-medium hover:text-primary-dark" href="/counseling">
                View counseling records →
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
