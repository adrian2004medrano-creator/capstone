import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";

import Login from "../pages/Login.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import GirlsHome from "../pages/GirlsHome.jsx";
import BoysHome from "../pages/BoysHome.jsx";
import KidsHome from "../pages/KidsHome.jsx";
import HomefortheAged from "../pages/HomefortheAged.jsx";
import Kamada from "../pages/Kamada.jsx";
import YouthList from "../pages/YouthList.jsx";
import YouthProfile from "../pages/YouthProfile.jsx";
import ClientProfile from "../pages/ClientProfile.jsx";
import IDP from "../pages/IDP.jsx";
import Counseling from "../pages/Counseling.jsx";
import Reports from "../pages/Reports.jsx";
import Admin from "../pages/Admin.jsx";
import Profile from "../pages/Profile.jsx";

const isAuthenticated = () => localStorage.getItem("kalakbay_auth") === "true";
const getUserRole = () => localStorage.getItem("kalakbay_role") || "user";
const CASE_ROLES = ["superadmin", "admin", "social_worker"];
const DASHBOARD_ROLES = [...CASE_ROLES, "psychometrician", "user"];

function ProtectedRoute({ children, allowedRoles = DASHBOARD_ROLES }) {
  const authenticated = isAuthenticated();
  const userRole = getUserRole();

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={DASHBOARD_ROLES}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/girls-home"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <GirlsHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/boys-home"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <BoysHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kids-home"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <KidsHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/aged-home"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <HomefortheAged />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kamada"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <Kamada />
            </ProtectedRoute>
          }
        />
        <Route
          path="/youth"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <YouthList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/youth/:id"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <YouthProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <ClientProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/idp"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <IDP />
            </ProtectedRoute>
          }
        />
        <Route
          path="/counseling"
          element={
            <ProtectedRoute allowedRoles={CASE_ROLES}>
              <Counseling />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute allowedRoles={DASHBOARD_ROLES}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["superadmin"]}>
              <Admin />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
