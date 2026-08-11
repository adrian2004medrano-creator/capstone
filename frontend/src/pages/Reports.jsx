export default function Reports() {
  return (
    <div className="bg-white rounded-xl2 shadow-card p-8 text-center">
      <h2 className="font-display text-lg font-bold text-ink900">Reports &amp; Analytics</h2>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">
        Institutional-level charts (risk trends, IDP completion, counseling
        frequency) will render here using Recharts, sourced from
        GET /api/reports.
      </p>
    </div>
  );
}
