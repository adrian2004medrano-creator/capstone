import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

// TODO: replace with GET /api/youth
const youth = [
  { id: "YT-0231", name: "J. Dela Cruz", age: 15, admitted: "Feb 2025", risk: "high" },
  { id: "YT-0198", name: "M. Santos", age: 13, admitted: "Aug 2024", risk: "medium" },
  { id: "YT-0117", name: "R. Aquino", age: 16, admitted: "Jan 2024", risk: "high" },
  { id: "YT-0304", name: "A. Reyes", age: 14, admitted: "May 2025", risk: "low" },
];

const riskBadge = {
  high: "bg-risk-light text-risk",
  medium: "bg-caution-light text-caution",
  low: "bg-primary-light text-primary-dark",
};

export default function YouthList() {
  return (
    <div className="bg-white rounded-xl2 shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-ink/[0.03] text-muted text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left font-semibold px-5 py-3">Case #</th>
            <th className="text-left font-semibold px-5 py-3">Name</th>
            <th className="text-left font-semibold px-5 py-3">Age</th>
            <th className="text-left font-semibold px-5 py-3">Admitted</th>
            <th className="text-left font-semibold px-5 py-3">Risk level</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {youth.map((y) => (
            <tr key={y.id} className="hover:bg-ink/[0.02]">
              <td className="px-5 py-3.5 text-muted">{y.id}</td>
              <td className="px-5 py-3.5 font-medium text-ink900">{y.name}</td>
              <td className="px-5 py-3.5">{y.age}</td>
              <td className="px-5 py-3.5">{y.admitted}</td>
              <td className="px-5 py-3.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${riskBadge[y.risk]}`}>
                  {y.risk}
                </span>
              </td>
              <td className="px-5 py-3.5 text-right">
                <Link
                  to={`/youth/${y.id}`}
                  className="inline-flex items-center gap-1 text-primary font-semibold hover:text-primary-dark"
                >
                  View <ArrowUpRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
