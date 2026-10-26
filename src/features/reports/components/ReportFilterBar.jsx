
import React from "react";

export default function ReportFilterBar({
  reportType = "overview",
  onReportTypeChange = () => {},
  startDate = "",
  endDate = "",
  onStartDateChange = () => {},
  onEndDateChange = () => {},
  search = "",
  onSearchChange = () => {},
  onReset = () => {},
}) {
  const options = [
    ["overview", "Daily Activity & Revenue"],
    ["opd", "OPD Metrics"],
    ["ipd", "IPD Occupancy"],
    ["departmentRevenue", "Department Revenue"],
    ["doctorPerformance", "Doctor Performance"],
    ["patientCohort", "Patient Cohorts"],
    ["gst", "GST Compliance"],
    ["attendance", "Staff Attendance"],
    ["pharmacy", "Pharmacy Shrinkage"],
    ["insurance", "Insurance Claims Ageing"],
    ["abdm", "ABDM Adoption"],
  ];

  return (
    <div className="reports-toolbar">
      <label>
        Report
        <select
          value={reportType}
          onChange={(event) => onReportTypeChange(event.target.value)}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        From date
        <input
          type="date"
          value={startDate}
          max={endDate || undefined}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
      </label>

      <label>
        To date
        <input
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(event) => onEndDateChange(event.target.value)}
        />
      </label>

      <label className="reports-search">
        Search
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search records..."
        />
      </label>

      <button
        type="button"
        className="reports-reset-button"
        onClick={onReset}
      >
        Reset filters
      </button>
    </div>
  );
}
