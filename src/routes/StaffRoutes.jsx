import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import StaffConsoleLayout from "../layouts/StaffConsoleLayout";

import DailyDashboardPage
  from "../features/reports/pages/DailyDashboardPage";

import PharmacyDashboardPage
  from "../features/departments/pharmacy/pages/PharmacyDashboardPage";

import PatientSearchPage
  from "../features/patientCrm/pages/PatientSearchPage";

import NewPatientPage
  from "../features/patientCrm/pages/NewPatientPage";

import PatientProfilePage
  from "../features/patientCrm/pages/PatientProfilePage";

import CalendarPage
  from "../features/scheduling/pages/CalendarPage";

import WhatsAppModuleLayout
  from "../features/whatsapp/layouts/WhatsAppModuleLayout";

import InboxPage
  from "../features/whatsapp/pages/InboxPage";

import TemplateManagerPage
  from "../features/whatsapp/pages/TemplateManagerPage";

import BroadcastComposerPage
  from "../features/whatsapp/pages/BroadcastComposerPage";

import InvoiceBuilderPage
  from "../features/billing/pages/InvoiceBuilderPage";

import AttendanceDashboardPage
  from "../features/attendance/pages/AttendanceDashboardPage";
  
import DepartmentsOverviewPage
  from "../features/departments/pages/DepartmentsOverviewPage";

import ClaimsDashboardPage
  from "../features/insurance/pages/ClaimsDashboardPage";

import LiveQueueBoardPage
  from "../features/departments/opd/pages/LiveQueueBoardPage";

import BedBoardPage
  from "../features/departments/ipd/pages/BedBoardPage";

import DispensingPage
  from "../features/departments/pharmacy/pages/DispensingPage";

import PrescriptionQueuePage
  from "../features/departments/pharmacy/pages/PrescriptionQueuePage";

import StockManagementPage
  from "../features/departments/pharmacy/pages/StockManagementPage";


import ResultUploadPage
  from "../features/departments/diagnostics/pages/ResultUploadPage";
  import AbhaLinkingPage
  from "../features/abdm/pages/AbhaLinkingPage";

import ConsentRequestPage
  from "../features/abdm/pages/ConsentRequestPage";

import ComplianceSettingsPage
  from "../features/abdm/pages/ComplianceSettingsPage";

const StaffRoutes = () => {
  return (
    <Routes>

      <Route element={<StaffConsoleLayout />}>

        <Route
          index
          element={
            <Navigate
              to="/staff/dashboard"
              replace
            />
          }
        />

        <Route
          path="dashboard"
          element={<DailyDashboardPage />}
        />

        <Route
          path="patients"
          element={<PatientSearchPage />}
        />

        <Route
          path="patients/new"
          element={<NewPatientPage />}
        />

        <Route
          path="patients/:patientId"
          element={<PatientProfilePage />}
        />

        <Route
          path="scheduling"
          element={<CalendarPage />}
        />

        <Route
          path="whatsapp"
          element={<WhatsAppModuleLayout />}
        >

          <Route
            index
            element={
              <Navigate
                to="/staff/whatsapp/inbox"
                replace
              />
            }
          />

          <Route
            path="inbox"
            element={<InboxPage />}
          />

          <Route
            path="templates"
            element={<TemplateManagerPage />}
          />

          <Route
            path="broadcasts"
            element={<BroadcastComposerPage />}
          />

        </Route>

        <Route
          path="billing"
          element={<InvoiceBuilderPage />}
        />
        <Route
          path="abdm"
          element={<AbhaLinkingPage />}
        />

        <Route
          path="abdm/consent"
          element={<ConsentRequestPage />}
        />

        <Route
          path="abdm/compliance"
          element={<ComplianceSettingsPage />}
        />

        <Route
          path="attendance"
          element={<AttendanceDashboardPage />}
        />

        <Route
          path="insurance"
          element={<ClaimsDashboardPage />}
        />

       <Route
          path="departments"
          element={<DepartmentsOverviewPage />}
        />  

        <Route
          path="departments/opd"
          element={<LiveQueueBoardPage />}
        />

        <Route
          path="departments/ipd"
          element={<BedBoardPage />}
        />

        <Route 
          path="departments/pharmacy" 
          element={<PharmacyDashboardPage />} 
        /> 

        <Route 
          path="departments/pharmacy/dispensing" 
          element={<DispensingPage />} 
        /> 

        <Route 
          path="departments/pharmacy/prescriptions" 
          element={<PrescriptionQueuePage />} 
        /> 

        <Route 
          path="departments/pharmacy/stock" 
          element={<StockManagementPage />} 
        />

        <Route
          path="departments/diagnostics"
          element={<ResultUploadPage />}
        />

      </Route>

    </Routes>
  );
};

export default StaffRoutes;