import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  House,
  ClipboardList,
  MessageSquareText,
  BarChart3,
  ShieldCheck,
  Compass,
  X,
  Building2,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/girls-home", label: "Girls Home", icon: House },
  { to: "/boys-home", label: "Boys Home", icon: Building2 },
  { to: "/kids-home", label: "Kids Home", icon: House },
  { to: "/aged-home", label: "Home for the Aged", icon: Building2 },
  { to: "/kamada", label: "Kamada", icon: House },
  { to: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { to: "/admin", label: "Admin Management", icon: ShieldCheck },
];

export default function Sidebar({ isOpen, onClose }) {
  const role = localStorage.getItem("kalakbay_role") || "user";
  const isPsychometrician = role === "psychometrician" || role === "user";
  const visibleNavItems = navItems.filter(({ to }) => {
    if (to === "/admin") return role === "superadmin";
    if (isPsychometrician) return ["/dashboard", "/reports"].includes(to);
    return true;
  });
  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-primary text-white"
        : "text-white/65 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <>
      <div
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-30 bg-ink900/45 transition-opacity md:hidden ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col bg-ink text-white/90 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.09] px-5 py-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Compass size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-display text-[14px] font-bold leading-none tracking-[0.04em] text-white">
                KALAKBAY <span className="text-[#E4B968]">AI</span>
              </p>
              <p className="mt-1.5 text-[11px] text-white/50">Manila Boys&apos; Town Complex</p>
            </div>
          </div>

          <button
            type="button"
            className="rounded-lg border border-white/10 p-1.5 text-white/70 transition-colors hover:bg-white/5 hover:text-white md:hidden"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Workspace</div>
        <nav className="flex-1 space-y-1 px-3">
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={onClose}>
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mx-3 mb-4 rounded-lg border border-white/[0.08] bg-white/[0.035] px-4 py-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#E4B968]">Clinical reminder</p>
          <p className="text-[11px] leading-relaxed text-white/55">
            Predictive alerts are guidance only, every flagged case still needs a
            professional&apos;s judgment.
          </p>
        </div>
      </aside>
    </>
  );
}
