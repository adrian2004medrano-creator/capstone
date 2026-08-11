export default function StatCard({ label, value, tone = "primary", icon: Icon }) {
  const toneMap = {
    primary: "bg-primary-light text-primary-dark",
    amber: "bg-amber-light text-amber",
    risk: "bg-risk-light text-risk",
  };

  return (
    <div className="bg-white rounded-xl2 shadow-card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${toneMap[tone]}`}>
        {Icon && <Icon size={20} strokeWidth={2} />}
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-ink900 leading-none">{value}</p>
        <p className="text-sm text-muted mt-1">{label}</p>
      </div>
    </div>
  );
}
