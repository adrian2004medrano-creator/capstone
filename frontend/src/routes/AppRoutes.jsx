import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import YouthList from "../pages/YouthList.jsx";
import YouthProfile from "../pages/YouthProfile.jsx";
import IDP from "../pages/IDP.jsx";
import Counseling from "../pages/Counseling.jsx";
import Reports from "../pages/Reports.jsx";
import Admin from "../pages/Admin.jsx";

// TODO: swap this for real auth state (e.g. from a context/AuthProvider
// backed by Supabase session or a JWT stored after /api/auth/login)
const isAuthenticated = () => true;

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected — all share the Sidebar + Navbar layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/youth" element={<YouthList />} />
        <Route path="/youth/:id" element={<YouthProfile />} />
        <Route path="/idp" element={<IDP />} />
        <Route path="/counseling" element={<Counseling />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/admin" element={<Admin />} />
      </Route>

      {/* Fallbacks */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
