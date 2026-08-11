import { Bell, Search, LogOut } from "lucide-react";

export default function Navbar({ title, subtitle }) {
  return (
    <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-ink/5 px-6 md:px-10 py-5 flex items-center justify-between gap-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink900">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 bg-white border border-ink/10 rounded-full px-4 py-2 shadow-card">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            placeholder="Search youth, case #..."
            className="bg-transparent text-sm outline-none w-44 placeholder:text-muted"
          />
        </div>

        <button
          type="button"
          className="relative w-10 h-10 rounded-full bg-white border border-ink/10 shadow-card flex items-center justify-center"
        >
          <Bell size={17} className="text-ink900" />
          <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-risk" />
        </button>

        <div className="flex items-center gap-2 pl-2">
          <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-display text-sm font-semibold">
            PS
          </div>
          <div className="hidden lg:block leading-tight">
            <p className="text-sm font-semibold text-ink900">Dr. P. Santos</p>
            <p className="text-xs text-muted">Psychometrician</p>
          </div>
        </div>

        <button
          type="button"
          className="w-10 h-10 rounded-full hover:bg-white hover:shadow-card flex items-center justify-center text-muted hover:text-risk transition-colors"
          title="Log out"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
