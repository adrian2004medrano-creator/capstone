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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-ink text-white/90 transition-transform duration-200 md:static md:z-auto md:w-64 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Compass size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="font-display font-bold text-[15px] leading-none text-white">
                KALAKBAY <span className="text-amber">AI</span>
              </p>
              <p className="text-[11px] text-white/50 mt-1">Manila Boys&apos; Town Complex</p>
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

        <nav className="flex-1 px-3 mt-2 space-y-1">
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={onClose}>
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-5 mx-3 mb-4 rounded-xl bg-white/5">
          <p className="text-[11px] text-white/50 leading-relaxed">
            Predictive alerts are guidance only, every flagged case still needs a
            professional&apos;s judgment.
          </p>
        </div>
      </aside>
    </>
  );
}
