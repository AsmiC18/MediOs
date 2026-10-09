import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import PatientPortalLayout
  from "../layouts/PatientPortalLayout";

import SelfBookingPage
  from "../features/patientPortal/pages/SelfBookingPage";

import MyRecordsPage
  from "../features/patientPortal/pages/MyRecordsPage";

import MyInvoicesPage
  from "../features/patientPortal/pages/MyInvoicesPage";

import AbhaConsentPage
  from "../features/patientPortal/pages/AbhaConsentPage";

const PatientPortalRoutes = () => {
  return (
    <Routes>

      <Route element={<PatientPortalLayout />}>

        <Route
          index
          element={
            <Navigate
              to="/portal/booking"
              replace
            />
          }
        />

        <Route
          path="booking"
          element={<SelfBookingPage />}
        />

        <Route
          path="records"
          element={<MyRecordsPage />}
        />

        <Route
          path="invoices"
          element={<MyInvoicesPage />}
        />

        <Route
          path="abha"
          element={<AbhaConsentPage />}
        />

      </Route>

    </Routes>
  );
};

export default PatientPortalRoutes;