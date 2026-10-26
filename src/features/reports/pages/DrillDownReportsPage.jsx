
import React, { useMemo, useState } from "react";
import ReportFilterBar from "../components/ReportFilterBar";
import ExportButtons from "../components/ExportButtons";

const REPORTS = {
  overview: {
    title: "Daily Activity & Revenue",
    description: "Hospital activity, collections, and revenue breakdowns.",
    columns: ["date", "branch", "department", "doctor", "paymentMethod", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "Cardiology", doctor: "Dr. Meera Nair", paymentMethod: "UPI", metric: "Revenue", value: 42500 },
      { date: "2026-10-26", branch: "Main Branch", department: "General OPD", doctor: "Dr. Vikram Rao", paymentMethod: "Cash", metric: "Revenue", value: 18500 },
      { date: "2026-10-26", branch: "North Branch", department: "Diagnostics", doctor: "Dr. Anjali Sharma", paymentMethod: "Card", metric: "Revenue", value: 31200 },
      { date: "2026-10-25", branch: "Main Branch", department: "Pharmacy", doctor: "—", paymentMethod: "UPI", metric: "Revenue", value: 12750 },
      { date: "2026-10-25", branch: "North Branch", department: "General OPD", doctor: "Dr. Karthik", paymentMethod: "Cash", metric: "Appointments", value: 34 },
    ],
  },
  opd: {
    title: "OPD Metrics",
    description: "Outpatient visits, appointment activity, and no-shows.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "General OPD", metric: "Patients seen", value: 86 },
      { date: "2026-10-26", branch: "Main Branch", department: "Cardiology", metric: "Appointments completed", value: 42 },
      { date: "2026-10-25", branch: "North Branch", department: "Orthopaedics", metric: "No-shows", value: 5 },
      { date: "2026-10-24", branch: "Main Branch", department: "General OPD", metric: "Appointments booked", value: 94 },
    ],
  },
  ipd: {
    title: "IPD Occupancy",
    description: "Bed occupancy and inpatient capacity.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "General Ward", metric: "Occupied beds", value: 42 },
      { date: "2026-10-26", branch: "Main Branch", department: "ICU", metric: "Occupied beds", value: 12 },
      { date: "2026-10-26", branch: "North Branch", department: "Maternity", metric: "Occupied beds", value: 18 },
      { date: "2026-10-25", branch: "Main Branch", department: "General Ward", metric: "Available beds", value: 16 },
    ],
  },
  departmentRevenue: {
    title: "Department Revenue",
    description: "Revenue by department and branch.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "Cardiology", metric: "Revenue (INR)", value: 68500 },
      { date: "2026-10-26", branch: "Main Branch", department: "Diagnostics", metric: "Revenue (INR)", value: 42500 },
      { date: "2026-10-26", branch: "North Branch", department: "Pharmacy", metric: "Revenue (INR)", value: 31500 },
      { date: "2026-10-25", branch: "Main Branch", department: "General OPD", metric: "Revenue (INR)", value: 28700 },
    ],
  },
  doctorPerformance: {
    title: "Doctor Performance",
    description: "Appointment completion and activity by doctor.",
    columns: ["date", "branch", "doctor", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", doctor: "Dr. Meera Nair", department: "Cardiology", metric: "Appointments completed", value: 24 },
      { date: "2026-10-26", branch: "Main Branch", doctor: "Dr. Vikram Rao", department: "General OPD", metric: "Appointments completed", value: 31 },
      { date: "2026-10-25", branch: "North Branch", doctor: "Dr. Anjali Sharma", department: "Diagnostics", metric: "Appointments completed", value: 18 },
    ],
  },
  patientCohort: {
    title: "Patient Cohorts",
    description: "New and returning patient trends.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "All departments", metric: "New patients", value: 32 },
      { date: "2026-10-26", branch: "Main Branch", department: "All departments", metric: "Returning patients", value: 67 },
      { date: "2026-10-25", branch: "North Branch", department: "All departments", metric: "New patients", value: 24 },
    ],
  },
  gst: {
    title: "GST Compliance",
    description: "Tax reporting and invoice review figures.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "Billing", metric: "Invoices reviewed", value: 120 },
      { date: "2026-10-26", branch: "Main Branch", department: "Billing", metric: "Invoices pending review", value: 8 },
      { date: "2026-10-25", branch: "North Branch", department: "Billing", metric: "Taxable sales (INR)", value: 152000 },
    ],
  },
  attendance: {
    title: "Staff Attendance",
    description: "Staff attendance, absences, and monthly summaries.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "Nursing", metric: "Present", value: 48 },
      { date: "2026-10-26", branch: "Main Branch", department: "Administration", metric: "Late arrivals", value: 3 },
      { date: "2026-10-26", branch: "North Branch", department: "Diagnostics", metric: "Absent", value: 2 },
    ],
  },
  pharmacy: {
    title: "Pharmacy Shrinkage",
    description: "Stock variances and items requiring investigation.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "Pharmacy", metric: "Stock variance items", value: 4 },
      { date: "2026-10-26", branch: "Main Branch", department: "Pharmacy", metric: "Items below reorder level", value: 7 },
      { date: "2026-10-25", branch: "North Branch", department: "Pharmacy", metric: "Expiry review items", value: 5 },
    ],
  },
  insurance: {
    title: "Insurance Claims Ageing",
    description: "Claim statuses, ageing, and turnaround tracking.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "Insurance", metric: "Claims awaiting review", value: 12 },
      { date: "2026-10-26", branch: "Main Branch", department: "Insurance", metric: "Claims overdue", value: 3 },
      { date: "2026-10-25", branch: "North Branch", department: "Insurance", metric: "Approved claims", value: 18 },
      { date: "2026-10-25", branch: "Main Branch", department: "Insurance", metric: "Average turnaround (days)", value: 4 },
    ],
  },
  abdm: {
    title: "ABDM Adoption",
    description: "ABHA linking and consent-based record sharing.",
    columns: ["date", "branch", "department", "metric", "value"],
    rows: [
      { date: "2026-10-26", branch: "Main Branch", department: "ABDM", metric: "ABHA-linked patients", value: 64 },
      { date: "2026-10-26", branch: "Main Branch", department: "ABDM", metric: "Records shared with consent", value: 21 },
      { date: "2026-10-25", branch: "North Branch", department: "ABDM", metric: "Records received with consent", value: 13 },
    ],
  },
};

const REPORT_OPTIONS = [
  { value: "overview", label: "Daily Activity & Revenue" },
  { value: "opd", label: "OPD Metrics" },
  { value: "ipd", label: "IPD Occupancy" },
  { value: "departmentRevenue", label: "Department Revenue" },
  { value: "doctorPerformance", label: "Doctor Performance" },
  { value: "patientCohort", label: "Patient Cohorts" },
  { value: "gst", label: "GST Compliance" },
  { value: "attendance", label: "Staff Attendance" },
  { value: "pharmacy", label: "Pharmacy Shrinkage" },
  { value: "insurance", label: "Insurance Claims Ageing" },
  { value: "abdm", label: "ABDM Adoption" },
];

const formatValue = (value) => {
  if (typeof value === "number") {
    return value.toLocaleString("en-IN");
  }
  return value ?? "—";
};

export default function DrillDownReportsPage() {
  const [reportType, setReportType] = useState("overview");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("2026-10-26");
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("all");
  const [department, setDepartment] = useState("all");

  const report = REPORTS[reportType] || REPORTS.overview;

  const branchOptions = useMemo(
    () => [...new Set(report.rows.map((row) => row.branch).filter(Boolean))],
    [report]
  );

  const departmentOptions = useMemo(
    () => [...new Set(report.rows.map((row) => row.department).filter(Boolean))],
    [report]
  );

  const filteredRows = useMemo(() => {
    return report.rows.filter((row) => {
      if (startDate && row.date < startDate) return false;
      if (endDate && row.date > endDate) return false;
      if (branch !== "all" && row.branch !== branch) return false;
      if (department !== "all" && row.department !== department) return false;

      const searchableText = Object.values(row).join(" ").toLowerCase();
      return searchableText.includes(search.trim().toLowerCase());
    });
  }, [report, startDate, endDate, branch, department, search]);

  const numericTotal = filteredRows.reduce(
    (sum, row) => sum + (typeof row.value === "number" ? row.value : 0),
    0
  );

  const revenueTotal =
    reportType === "overview" || reportType === "departmentRevenue"
      ? filteredRows.reduce(
          (sum, row) =>
            String(row.metric).toLowerCase().includes("revenue")
              ? sum + Number(row.value || 0)
              : sum,
          0
        )
      : null;

  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearch("");
    setBranch("all");
    setDepartment("all");
  };

  const displayedRows = filteredRows.map((row) =>
    Object.fromEntries(
      report.columns.map((column) => [column, row[column] ?? "—"])
    )
  );

  return (
    <main className="reports-page">
      <header className="reports-page-header">
        <div>
          <span className="reports-eyebrow">MEDIOS / ANALYTICS</span>
          <h1>Reports &amp; Analytics</h1>
          <p>
            Hospital activity, financial performance, compliance, and operational
            reports in one place.
          </p>
        </div>

        <ExportButtons
          rows={displayedRows}
          reportTitle={report.title}
          columns={report.columns}
        />
      </header>

      <section className="reports-toolbar">
        <label>
          Report
          <select
            value={reportType}
            onChange={(event) => setReportType(event.target.value)}
          >
            {REPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Location
          <select
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          >
            <option value="all">All locations</option>
            {branchOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Department
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="all">All departments</option>
            {departmentOptions.map((option) => (
              <option key={option} value={option}>
                {option}
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
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label>
          To date
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>

        <label className="reports-search">
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search records..."
          />
        </label>

        <button
          type="button"
          className="reports-reset-button"
          onClick={resetFilters}
        >
          Reset filters
        </button>
      </section>

      <section className="reports-summary-grid">
        <article className="reports-summary-card">
          <span>Selected report</span>
          <strong>{report.title}</strong>
          <small>Report category</small>
        </article>

        <article className="reports-summary-card">
          <span>Records displayed</span>
          <strong>{filteredRows.length}</strong>
          <small>After applying filters</small>
        </article>

        <article className="reports-summary-card">
          <span>
            {revenueTotal !== null ? "Revenue in displayed rows" : "Sum of displayed values"}
          </span>
          <strong>
            {revenueTotal !== null
              ? `₹${revenueTotal.toLocaleString("en-IN")}`
              : numericTotal.toLocaleString("en-IN")}
          </strong>
          <small>
            {revenueTotal !== null ? "Sample revenue figures" : "Metric values may use different units"}
          </small>
        </article>
      </section>

      <section className="reports-results">
        <div className="reports-results-header">
          <div>
            <span className="reports-eyebrow">REPORT DETAILS</span>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
          </div>
          <span className="reports-record-count">
            {filteredRows.length} records
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="reports-empty-state">
            <h3>No matching records</h3>
            <p>Change your filters or reset them to see the available sample data.</p>
            <button
              type="button"
              className="reports-reset-button"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  {report.columns.map((column) => (
                    <th key={column}>
                      {column === "paymentMethod"
                        ? "Payment Method"
                        : column.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={`${row.date}-${row.department}-${index}`}>
                    {report.columns.map((column) => (
                      <td key={column}>
                        {column === "value" && String(row.metric).toLowerCase().includes("revenue")
                          ? `₹${formatValue(row[column])}`
                          : formatValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="reports-demo-note">
          Demonstration data only. Connect these reports to your hospital API
          before using the figures for financial, clinical, payroll, tax, or
          compliance decisions.
        </p>
      </section>
    </main>
  );
}
