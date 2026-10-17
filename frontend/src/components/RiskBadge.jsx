const STYLES = {
  high: "bg-risk-light text-risk",
  medium: "bg-caution-light text-caution",
  low: "bg-primary-light text-primary-dark",
};

export default function RiskBadge({ level, score }) {
  if (!level) {
    return <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">Not assessed</span>;
  }

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STYLES[level]}`}>
      {level}
      {score !== undefined && score !== null ? ` · ${score}` : ""}
    </span>
  );
}
