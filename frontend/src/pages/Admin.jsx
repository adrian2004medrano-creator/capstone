export default function Admin() {
  return (
    <div className="bg-white rounded-xl2 shadow-card p-8 text-center">
      <h2 className="font-display text-lg font-bold text-ink900">Admin Management</h2>
      <p className="text-sm text-muted mt-2 max-w-md mx-auto">
        Manage social worker accounts, assign tasks, and review audit logs here.
        Wire up to GET/POST /api/admin next (Super Admin only).
      </p>
    </div>
  );
}
