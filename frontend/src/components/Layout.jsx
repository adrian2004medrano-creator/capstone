import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Navbar from "./Navbar.jsx";

const PAGE_META = {
  "/dashboard": { title: "Dashboard", subtitle: "Live monitoring for risk alerts and behavioral trends" },
  "/youth": { title: "Youth Profiles", subtitle: "Case records for all youth currently in care" },
  "/idp": { title: "Individual Development Plans", subtitle: "Track goals and progress per youth" },
  "/counseling": { title: "Counseling Records", subtitle: "Session logs and behavioral notes" },
  "/reports": { title: "Reports & Analytics", subtitle: "Institutional insights generated from case data" },
  "/admin": { title: "Admin Management", subtitle: "Accounts, task assignment, and audit logs" },
};

export default function Layout() {
  const { pathname } = useLocation();
  const meta =
    PAGE_META[pathname] ??
    (pathname.startsWith("/youth/")
      ? { title: "Youth Profile", subtitle: "Case history, IDP, and counseling logs" }
      : { title: "" });

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Navbar title={meta.title} subtitle={meta.subtitle} />
        <main className="px-6 md:px-10 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
