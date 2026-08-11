import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  MessageSquareText,
  BarChart3,
  ShieldCheck,
  Compass,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/youth", label: "Youth Profiles", icon: Users },
  { to: "/idp", label: "Individual Dev. Plans", icon: ClipboardList },
  { to: "/counseling", label: "Counseling Records", icon: MessageSquareText },
  { to: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { to: "/admin", label: "Admin Management", icon: ShieldCheck },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-ink text-white/90 min-h-screen sticky top-0">
      <div className="flex items-center gap-2 px-6 py-6">
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

      <nav className="flex-1 px-3 mt-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-5 mx-3 mb-4 rounded-xl bg-white/5">
        <p className="text-[11px] text-white/50 leading-relaxed">
          Predictive alerts are guidance only — every flagged case still needs a
          social worker&apos;s judgment.
        </p>
      </div>
    </aside>
  );
}
