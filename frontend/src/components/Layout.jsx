import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Navbar from "./Navbar.jsx";

const PAGE_META = {
  "/dashboard": { title: "Dashboard", subtitle: "Live monitoring for risk alerts and behavioral trends" },
  "/youth": { title: "Client Profiles", subtitle: "Case records for all clients currently in care" },
  "/idp": { title: "Individual Development Plans", subtitle: "Track goals and progress per client" },
  "/counseling": { title: "Counseling Records", subtitle: "Session logs and behavioral notes" },
  "/admin": { title: "Admin Management", subtitle: "Accounts, task assignment, and audit logs" },
  "/profile": { title: "My Profile", subtitle: "Your account details and profile photo" },
};

export default function Layout() {
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const role = localStorage.getItem("kalakbay_role") || "user";

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  const meta = pathname === "/dashboard"
    ? {
        title: "Dashboard",
        subtitle: role === "superadmin"
          ? "Live system and staff account overview"
          : role === "psychometrician" || role === "user"
            ? "Anonymized, aggregate case overview"
            : "Live home and client overview",
      }
    :
    PAGE_META[pathname] ??
    (pathname.startsWith("/youth/")
      ? { title: "Client Profile", subtitle: "Case history, IDP, and counseling logs" }
      : { title: "" });

  return (
    <div className="min-h-screen bg-surface md:flex">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="min-w-0 flex-1">
        <Navbar
          title={meta.title}
          subtitle={meta.subtitle}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
