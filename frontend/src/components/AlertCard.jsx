import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const RISK_STYLES = {
  high: { dot: "bg-risk", badge: "bg-risk-light text-risk", label: "High risk" },
  medium: { dot: "bg-caution", badge: "bg-caution-light text-caution", label: "Medium risk" },
  low: { dot: "bg-primary", badge: "bg-primary-light text-primary-dark", label: "Low risk" },
};

export default function AlertCard({ youthId, name, age, flag, risk = "medium", updatedAt }) {
  const style = RISK_STYLES[risk];

  return (
    <Link
      to={`/youth/${youthId}`}
      className="flex items-center justify-between gap-4 bg-white rounded-xl2 shadow-card p-4 hover:shadow-lg transition-shadow group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink900 truncate">
            {name} <span className="text-muted font-normal">· {age} y/o</span>
          </p>
          <p className="text-sm text-muted truncate">{flag}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${style.badge}`}>
          {style.label}
        </span>
        <span className="hidden sm:block text-xs text-muted">{updatedAt}</span>
        <ArrowUpRight
          size={16}
          className="text-muted group-hover:text-primary transition-colors"
        />
      </div>
    </Link>
  );
}
