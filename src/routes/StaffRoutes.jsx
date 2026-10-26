
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import StaffConsoleLayout from "../layouts/StaffConsoleLayout";

// Reports
import DailyDashboardPage
  from "../features/reports/pages/DailyDashboardPage";


import DrillDownReportsPage
  from "../features/reports/pages/DrillDownReportsPage";


// Patient CRM
import PatientSearchPage
  from "../features/patientCrm/pages/PatientSearchPage";

import NewPatientPage
  from "../features/patientCrm/pages/NewPatientPage";

import PatientProfilePage
  from "../features/patientCrm/pages/PatientProfilePage";

// Scheduling
import CalendarPage
  from "../features/scheduling/pages/CalendarPage";

// WhatsApp
import WhatsAppModuleLayout
  from "../features/whatsapp/layouts/WhatsAppModuleLayout";

import InboxPage
  from "../features/whatsapp/pages/InboxPage";

import TemplateManagerPage
  from "../features/whatsapp/pages/TemplateManagerPage";

import BroadcastComposerPage
  from "../features/whatsapp/pages/BroadcastComposerPage";

// Billing
import InvoiceBuilderPage
  from "../features/billing/pages/InvoiceBuilderPage";

// Attendance
import AttendanceDashboardPage
  from "../features/attendance/pages/AttendanceDashboardPage";

// Departments
import DepartmentsOverviewPage
  from "../features/departments/pages/DepartmentsOverviewPage";

import LiveQueueBoardPage
  from "../features/departments/opd/pages/LiveQueueBoardPage";

import BedBoardPage
  from "../features/departments/ipd/pages/BedBoardPage";

import PharmacyDashboardPage
  from "../features/departments/pharmacy/pages/PharmacyDashboardPage";

import DispensingPage
  from "../features/departments/pharmacy/pages/DispensingPage";

import PrescriptionQueuePage
  from "../features/departments/pharmacy/pages/PrescriptionQueuePage";

import StockManagementPage
  from "../features/departments/pharmacy/pages/StockManagementPage";

import ResultUploadPage
  from "../features/departments/diagnostics/pages/ResultUploadPage";

import EmergencyPage
  from "../features/departments/emergency/pages/EmergencyPage";

import TriageIntakePage
  from "../features/departments/emergency/pages/TriageIntakePage";

import OtSchedulingPage
  from "../features/departments/surgery/pages/OtSchedulingPage";

import PreOpChecklistPage
  from "../features/departments/surgery/pages/PreOpChecklistPage";

// ABDM
import AbhaLinkingPage
  from "../features/abdm/pages/AbhaLinkingPage";

import ConsentRequestPage
  from "../features/abdm/pages/ConsentRequestPage";

import ComplianceSettingsPage
  from "../features/abdm/pages/ComplianceSettingsPage";

// Clinical records
import SoapNoteEntryPage
  from "../features/clinicalRecords/pages/SoapNoteEntryPage";

import PrescriptionBuilderPage
  from "../features/clinicalRecords/pages/PrescriptionBuilderPage";

import ClinicalRecordsPage
  from "../features/clinicalRecords/pages/ClinicalRecordsPage";

// Insurance
import ClaimsDashboardPage
  from "../features/insurance/pages/ClaimsDashboardPage";

// Follow-up
import AtRiskListPage
  from "../features/followUp/pages/AtRiskListPage";

import NpsResultsPage
  from "../features/followUp/pages/NpsResultsPage";

import WinBackCampaignPage
  from "../features/followUp/pages/WinBackCampaignPage";

// Shared
import ComingSoonPage
  from "../components/common/ComingSoonPage";


const StaffRoutes = () => {
  return (
    <Routes>
      <Route element={<StaffConsoleLayout />}>

        {/* Default route */}
        <Route
          index
          element={
            <Navigate
              to="/staff/dashboard"
              replace
            />
          }
        />

        {/* Dashboard */}
        <Route
          path="dashboard"
          element={<DailyDashboardPage />}
        />

        {/* Patient CRM */}
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

        {/* Scheduling */}
        <Route
          path="scheduling"
          element={<CalendarPage />}
        />

        {/* WhatsApp */}
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

        {/* Billing */}
        <Route
          path="billing"
          element={<InvoiceBuilderPage />}
        />

        {/* ABDM */}
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

        {/* Attendance */}
        <Route
          path="attendance"
          element={<AttendanceDashboardPage />}
        />

        {/* Insurance */}
        <Route
          path="insurance"
          element={<ClaimsDashboardPage />}
        />

        {/* Departments */}
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

        <Route
          path="departments/emergency"
          element={<EmergencyPage />}
        />

        <Route
          path="departments/emergency/triage-intake"
          element={<TriageIntakePage />}
        />

        <Route
          path="departments/surgery"
          element={<OtSchedulingPage />}
        />

        <Route
          path="departments/surgery/pre-op-checklist"
          element={<PreOpChecklistPage />}
        />

        {/* Clinical records */}
        <Route
          path="clinical-records"
          element={<ClinicalRecordsPage />}
        />

        <Route
          path="clinical-records/notes"
          element={<SoapNoteEntryPage />}
        />

        <Route
          path="clinical-records/prescriptions"
          element={<PrescriptionBuilderPage />}
        />

        {/* Follow-up */}
        <Route
          path="follow-up"
          element={<AtRiskListPage />}
        />

        <Route
          path="follow-up/nps"
          element={<NpsResultsPage />}
        />

        <Route
          path="follow-up/win-back"
          element={<WinBackCampaignPage />}
        />

        {/* Reports */}
        

{/* Reports & Analytics */}

<Route
  path="reports"
  element={<DrillDownReportsPage />}
/>

<Route
  path="reports/details"
  element={<DrillDownReportsPage />}
/>

<Route
  path="reports/revenue"
  element={<DrillDownReportsPage />}
/>



      </Route>
    </Routes>
  );
};

export default StaffRoutes;
