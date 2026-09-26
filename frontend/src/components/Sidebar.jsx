import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  House,
  ShieldCheck,
  X,
  Building2,
} from "lucide-react";

const navItems = [
  { section: "Workspace", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "Care homes", to: "/girls-home", label: "Girls Home", icon: House },
  { section: "Care homes", to: "/boys-home", label: "Boys Home", icon: Building2 },
  { section: "Care homes", to: "/kids-home", label: "Kids Home", icon: House },
  { section: "Care homes", to: "/aged-home", label: "Home for the Aged", icon: Building2 },
  { section: "Care homes", to: "/kamada", label: "Kamada", icon: House },
  { section: "Administration", to: "/admin", label: "Admin Management", icon: ShieldCheck },
];

export default function Sidebar({ isOpen, onClose }) {
  const role = localStorage.getItem("kalakbay_role") || "user";
  const isPsychometrician = role === "psychometrician" || role === "user";
  const visibleNavItems = navItems.filter(({ to }) => {
    if (to === "/admin") return role === "superadmin";
    if (isPsychometrician) return to === "/dashboard";
    return true;
  });
  const navLinkClass = ({ isActive }) =>
    `flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors ${
      isActive
        ? "bg-[#343638] text-white shadow-sm"
        : "text-[#68717a] hover:bg-[#f0f1f2] hover:text-[#292d31]"
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[282px] shrink-0 flex-col border-r border-[#e3e6e9] bg-white text-[#30353a] transition-transform duration-200 md:sticky md:top-[88px] md:h-[calc(100vh-88px)] md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-end px-4 pt-4 md:hidden">
          <button
            type="button"
            className="rounded-md border border-[#e3e6e9] p-1.5 text-[#68717a] transition-colors hover:bg-[#f0f1f2] hover:text-[#30353a]"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto px-[18px] pb-5 pt-5">
          {[...new Set(visibleNavItems.map(({ section }) => section))].map((section) => (
            <div key={section}>
              <h2 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#929ba3]">{section}</h2>
              <div className="space-y-1">
                {visibleNavItems.filter((item) => item.section === section).map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={navLinkClass} onClick={onClose}>
                    <Icon size={17} strokeWidth={2} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
