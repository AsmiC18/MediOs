import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "../features/auth/pages/LoginPage";
import StaffRoutes from "./StaffRoutes";

const AppRoutes = () => {
  return (
    <Routes>

      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/staff/*"
        element={<StaffRoutes />}
      />

      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />

    </Routes>
  );
};

export default AppRoutes;