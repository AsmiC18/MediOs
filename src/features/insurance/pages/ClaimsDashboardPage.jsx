
import React, { useMemo, useState } from "react";

const initialClaims = [
  {
    id: "CLM-2026-001",
    patient: "Ananya Sharma",
    patientId: "PT-1024",
    insurer: "Star Health",
    tpa: "Medi Assist",
    admission: "ADM-26091",
    service: "Inpatient care",
    billed: 85000,
    insurerAmount: 68000,
    patientAmount: 17000,
    submitted: "2026-10-20",
    status: "Pending",
    age: 6,
  },
  {
    id: "CLM-2026-002",
    patient: "Rahul Menon",
    patientId: "PT-1031",
    insurer: "HDFC ERGO",
    tpa: "Health India",
    admission: "ADM-26085",
    service: "Surgery",
    billed: 125000,
    insurerAmount: 100000,
    patientAmount: 25000,
    submitted: "2026-10-22",
    status: "Approved",
    age: 4,
  },
  {
    id: "CLM-2026-003",
    patient: "Priya Nair",
    patientId: "PT-1045",
    insurer: "ICICI Lombard",
    tpa: "Medi Assist",
    admission: "ADM-26073",
    service: "Inpatient care",
    billed: 46000,
    insurerAmount: 36800,
    patientAmount: 9200,
    submitted: "2026-10-14",
    status: "Queried",
    age: 12,
  },
  {
    id: "CLM-2026-004",
    patient: "Vikram Patel",
    patientId: "PT-1052",
    insurer: "Star Health",
    tpa: "FHPL",
    admission: "ADM-26061",
    service: "Diagnostics",
    billed: 18000,
    insurerAmount: 14400,
    patientAmount: 3600,
    submitted: "2026-10-10",
    status: "Rejected",
    age: 16,
  },
  {
    id: "CLM-2026-005",
    patient: "Meera Krishnan",
    patientId: "PT-1068",
    insurer: "Niva Bupa",
    tpa: "Health India",
    admission: "ADM-26102",
    service: "Inpatient care",
    billed: 72000,
    insurerAmount: 57600,
    patientAmount: 14400,
    submitted: "2026-10-25",
    status: "Pending",
    age: 1,
  },
];

const insurers = [
  {
    name: "Star Health",
    tpa: "Medi Assist",
    type: "Insurer",
    status: "Active",
    rate: "Package rates configured",
  },
  {
    name: "HDFC ERGO",
    tpa: "Health India",
    type: "Insurer",
    status: "Active",
    rate: "Package rates configured",
  },
  {
    name: "ICICI Lombard",
    tpa: "Medi Assist",
    type: "Insurer",
    status: "Active",
    rate: "Review package rates",
  },
  {
    name: "Niva Bupa",
    tpa: "FHPL",
    type: "Insurer",
    status: "Pending verification",
    rate: "Rates not configured",
  },
];

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const statusClass = (status) =>
  status.toLowerCase().replace(/\s+/g, "-");

const ClaimsDashboardPage = () => {
  const [claims, setClaims] = useState(initialClaims);
  const [activeTab, setActiveTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [notice, setNotice] = useState("");

  const [request, setRequest] = useState({
    patient: "",
    patientId: "",
    insurer: "",
    admission: "",
    service: "Inpatient care",
    billed: "",
    insurerAmount: "",
    patientAmount: "",
  });

  const totals = useMemo(() => {
    const pending = claims.filter(
      (claim) => claim.status === "Pending"
    );
    const approved = claims.filter(
      (claim) => claim.status === "Approved"
    );
    const rejected = claims.filter(
      (claim) => claim.status === "Rejected"
    );

    return {
      total: claims.length,
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      pendingAmount: pending.reduce(
        (sum, claim) => sum + claim.insurerAmount,
        0
      ),
      approvedAmount: approved.reduce(
        (sum, claim) => sum + claim.insurerAmount,
        0
      ),
    };
  }, [claims]);

  const filteredClaims = useMemo(() => {
    const query = search.trim().toLowerCase();

    return claims.filter((claim) => {
      const matchesSearch =
        !query ||
        [
          claim.id,
          claim.patient,
          claim.patientId,
          claim.insurer,
          claim.tpa,
          claim.admission,
        ].some((value) => value.toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "All statuses" ||
        claim.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [claims, search, statusFilter]);

  const ageingClaims = claims.filter(
    (claim) =>
      claim.status !== "Approved" &&
      claim.status !== "Rejected" &&
      claim.age >= 7
  );

  const updateRequest = (event) => {
    const { name, value } = event.target;

    setRequest((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const openRequestForm = () => {
    setNotice("");
    setRequest({
      patient: "",
      patientId: "",
      insurer: "",
      admission: "",
      service: "Inpatient care",
      billed: "",
      insurerAmount: "",
      patientAmount: "",
    });
    setShowRequestForm(true);
  };

  const submitRequest = (event) => {
    event.preventDefault();

    const billed = Number(request.billed);
    const insurerAmount = Number(request.insurerAmount);
    const patientAmount = Number(request.patientAmount);

    if (
      !request.patient.trim() ||
      !request.patientId.trim() ||
      !request.insurer ||
      !request.admission.trim() ||
      !billed ||
      insurerAmount < 0 ||
      patientAmount < 0
    ) {
      setNotice("Complete all required fields with valid amounts.");
      return;
    }

    if (Math.abs(billed - insurerAmount - patientAmount) > 0.01) {
      setNotice(
        "The insurer amount and patient amount must add up to the total bill."
      );
      return;
    }

    const newClaim = {
      id: `CLM-${Date.now().toString().slice(-8)}`,
      patient: request.patient.trim(),
      patientId: request.patientId.trim(),
      insurer: request.insurer,
      tpa: "To be confirmed",
      admission: request.admission.trim(),
      service: request.service,
      billed,
      insurerAmount,
      patientAmount,
      submitted: new Date().toISOString().slice(0, 10),
      status: "Pending",
      age: 0,
    };

    setClaims((previous) => [newClaim, ...previous]);
    setShowRequestForm(false);
    setActiveTab("Claims");
    setSearch("");
    setStatusFilter("All statuses");
    setNotice(
      "A demonstration claim record was added locally. It has not been sent to an insurer."
    );
  };

  const exportClaims = () => {
    const columns = [
      "Claim ID",
      "Patient",
      "Patient ID",
      "Insurer",
      "TPA",
      "Admission ID",
      "Service",
      "Total Bill",
      "Insurer Payable",
      "Patient Payable",
      "Submission Date",
      "Status",
      "Ageing Days",
    ];

    const rows = filteredClaims.map((claim) => [
      claim.id,
      claim.patient,
      claim.patientId,
      claim.insurer,
      claim.tpa,
      claim.admission,
      claim.service,
      claim.billed,
      claim.insurerAmount,
      claim.patientAmount,
      claim.submitted,
      claim.status,
      claim.age,
    ]);

    const csvCell = (value) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [columns, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "medios-insurance-claims.csv";
    link.click();

    URL.revokeObjectURL(url);
  };

  const tabs = [
    "Overview",
    "Claims",
    "Pre-authorization",
    "Insurers & TPAs",
  ];

  return (
    <div className="insurance-page">
      <header className="insurance-page-header">
        <div>
          <div className="insurance-breadcrumb">
            OPERATIONS <span>/</span> INSURANCE
          </div>

          <h1>Insurance &amp; Claims</h1>

          <p>
            Manage cashless approvals, insurance claims and
            insurer settlements in one place.
          </p>
        </div>

        <div className="insurance-header-actions">
          <button
            type="button"
            className="insurance-button insurance-button-secondary"
            onClick={exportClaims}
          >
            Export CSV
          </button>

          <button
            type="button"
            className="insurance-button insurance-button-primary"
            onClick={openRequestForm}
          >
            <span aria-hidden="true">+</span> New pre-authorization
          </button>
        </div>
      </header>

      {notice && (
        <div className="insurance-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <div className="insurance-demo-note">
        <span className="insurance-demo-dot" />
        Demonstration data — not connected to a live insurance system.
      </div>

      <nav className="insurance-tabs" aria-label="Insurance sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={
              activeTab === tab
                ? "insurance-tab insurance-tab-active"
                : "insurance-tab"
            }
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === "Claims" && (
              <span className="insurance-tab-count">
                {claims.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* OVERVIEW */}
      {activeTab === "Overview" && (
        <>
          <section className="insurance-stats">
            <article className="insurance-stat-card">
              <div className="insurance-stat-top">
                <span>Total claims</span>
                <span className="insurance-stat-icon">CL</span>
              </div>
              <strong>{totals.total}</strong>
              <small>All recorded claims</small>
            </article>

            <article className="insurance-stat-card">
              <div className="insurance-stat-top">
                <span>Pending claims</span>
                <span className="insurance-stat-icon insurance-icon-amber">
                  PE
                </span>
              </div>
              <strong>{totals.pending}</strong>
              <small>
                {formatCurrency(totals.pendingAmount)} insurer payable
              </small>
            </article>

            <article className="insurance-stat-card">
              <div className="insurance-stat-top">
                <span>Approved claims</span>
                <span className="insurance-stat-icon insurance-icon-green">
                  AP
                </span>
              </div>
              <strong>{totals.approved}</strong>
              <small>
                {formatCurrency(totals.approvedAmount)} approved amount
              </small>
            </article>

            <article className="insurance-stat-card">
              <div className="insurance-stat-top">
                <span>Rejected claims</span>
                <span className="insurance-stat-icon insurance-icon-red">
                  RE
                </span>
              </div>
              <strong>{totals.rejected}</strong>
              <small>Requires review by authorized staff</small>
            </article>
          </section>

          <section className="insurance-panel">
            <div className="insurance-panel-heading">
              <div>
                <h2>Claims requiring attention</h2>
                <p>
                  Pending and queried claims that may need follow-up.
                </p>
              </div>

              <button
                type="button"
                className="insurance-text-button"
                onClick={() => setActiveTab("Claims")}
              >
                View all claims →
              </button>
            </div>

            {ageingClaims.length > 0 ? (
              <div className="insurance-attention-list">
                {ageingClaims.map((claim) => (
                  <button
                    type="button"
                    className="insurance-attention-row"
                    key={claim.id}
                    onClick={() => setSelectedClaim(claim)}
                  >
                    <span className="insurance-attention-indicator" />

                    <span className="insurance-attention-main">
                      <strong>{claim.patient}</strong>
                      <small>
                        {claim.id} · {claim.insurer}
                      </small>
                    </span>

                    <span className="insurance-attention-age">
                      {claim.age} days
                    </span>

                    <span
                      className={`insurance-status insurance-status-${statusClass(
                        claim.status
                      )}`}
                    >
                      {claim.status}
                    </span>

                    <span className="insurance-row-arrow">→</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="insurance-empty-state">
                No ageing claims require attention.
              </div>
            )}
          </section>

          <section className="insurance-panel">
            <div className="insurance-panel-heading">
              <div>
                <h2>Recent claims</h2>
                <p>Latest claim records across insurers.</p>
              </div>

              <button
                type="button"
                className="insurance-text-button"
                onClick={() => setActiveTab("Claims")}
              >
                Open claims →
              </button>
            </div>

            <ClaimTable
              claims={claims.slice(0, 4)}
              onView={setSelectedClaim}
            />
          </section>

          <section className="insurance-bottom-grid">
            <article className="insurance-panel">
              <div className="insurance-panel-heading">
                <div>
                  <h2>Insurer network</h2>
                  <p>Empanelment status overview.</p>
                </div>
              </div>

              <div className="insurance-network-list">
                {insurers.slice(0, 3).map((insurer) => (
                  <div
                    className="insurance-network-row"
                    key={insurer.name}
                  >
                    <span className="insurance-insurer-avatar">
                      {insurer.name.slice(0, 1)}
                    </span>

                    <span className="insurance-network-info">
                      <strong>{insurer.name}</strong>
                      <small>TPA: {insurer.tpa}</small>
                    </span>

                    <span
                      className={`insurance-status insurance-status-${statusClass(
                        insurer.status
                      )}`}
                    >
                      {insurer.status}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="insurance-text-button insurance-full-link"
                onClick={() => setActiveTab("Insurers & TPAs")}
              >
                Manage insurers &amp; TPAs →
              </button>
            </article>

            <article className="insurance-panel insurance-workflow-panel">
              <div className="insurance-panel-heading">
                <div>
                  <h2>Claim workflow</h2>
                  <p>Track a claim from submission to decision.</p>
                </div>
              </div>

              <div className="insurance-workflow">
                {[
                  ["01", "Submitted", "Request received"],
                  ["02", "Queried", "Additional details requested"],
                  ["03", "Approved", "Coverage approved"],
                  ["04", "Rejected", "Request declined"],
                ].map(([number, title, description]) => (
                  <div className="insurance-workflow-step" key={number}>
                    <span>{number}</span>
                    <div>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}

      {/* CLAIMS */}
      {activeTab === "Claims" && (
        <section className="insurance-panel">
          <div className="insurance-panel-heading insurance-claims-heading">
            <div>
              <h2>All claims</h2>
              <p>
                Search by patient, claim, admission, insurer or TPA.
              </p>
            </div>
          </div>

          <div className="insurance-table-toolbar">
            <div className="insurance-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Search claims"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search claims..."
              />
            </div>

            <select
              aria-label="Filter claims by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All statuses</option>
              <option>Pending</option>
              <option>Queried</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>
          </div>

          <ClaimTable
            claims={filteredClaims}
            onView={setSelectedClaim}
          />

          <div className="insurance-table-footer">
            Showing {filteredClaims.length} of {claims.length} claims
          </div>
        </section>
      )}

      {/* PRE-AUTHORIZATION */}
      {activeTab === "Pre-authorization" && (
        <>
          <section className="insurance-panel insurance-preauth-intro">
            <div>
              <span className="insurance-section-eyebrow">
                CASHLESS CARE
              </span>
              <h2>Pre-authorization requests</h2>
              <p>
                Prepare and track insurer approval requests for
                admissions and procedures.
              </p>
            </div>

            <button
              type="button"
              className="insurance-button insurance-button-primary"
              onClick={openRequestForm}
            >
              + New request
            </button>
          </section>

          <section className="insurance-stats insurance-preauth-stats">
            <article className="insurance-stat-card">
              <span>Submitted / pending</span>
              <strong>
                {
                  claims.filter((claim) =>
                    ["Pending", "Queried"].includes(claim.status)
                  ).length
                }
              </strong>
              <small>Awaiting resolution</small>
            </article>

            <article className="insurance-stat-card">
              <span>Approved</span>
              <strong>{totals.approved}</strong>
              <small>Approval recorded in demo data</small>
            </article>

            <article className="insurance-stat-card">
              <span>Rejected</span>
              <strong>{totals.rejected}</strong>
              <small>Review the insurer's decision</small>
            </article>
          </section>

          <section className="insurance-panel">
            <div className="insurance-panel-heading">
              <div>
                <h2>Request tracker</h2>
                <p>
                  Demo tracker for the required submission and decision
                  workflow.
                </p>
              </div>
            </div>

            <ClaimTable
              claims={claims}
              onView={setSelectedClaim}
            />
          </section>
        </>
      )}

      {/* EMPANELMENT */}
      {activeTab === "Insurers & TPAs" && (
        <>
          <section className="insurance-panel insurance-preauth-intro">
            <div>
              <span className="insurance-section-eyebrow">
                NETWORK MANAGEMENT
              </span>
              <h2>Insurers &amp; TPAs</h2>
              <p>
                Review insurer relationships, third-party administrators
                and procedure package-rate readiness.
              </p>
            </div>
          </section>

          <section className="insurance-panel">
            <div className="insurance-panel-heading">
              <div>
                <h2>Empanelment directory</h2>
                <p>
                  Illustrative entries. Confirm all relationships
                  against the hospital's actual agreements.
                </p>
              </div>
            </div>

            <div className="insurance-table-scroll">
              <table className="insurance-table">
                <thead>
                  <tr>
                    <th>Insurer</th>
                    <th>TPA</th>
                    <th>Relationship</th>
                    <th>Package rates</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {insurers.map((insurer) => (
                    <tr key={insurer.name}>
                      <td>
                        <strong>{insurer.name}</strong>
                      </td>
                      <td>{insurer.tpa}</td>
                      <td>{insurer.type}</td>
                      <td>{insurer.rate}</td>
                      <td>
                        <span
                          className={`insurance-status insurance-status-${statusClass(
                            insurer.status
                          )}`}
                        >
                          {insurer.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="insurance-helper">
              Empanelment editing, contract uploads and procedure-specific
              package-rate configuration require backend support and
              authorized access.
            </p>
          </section>
        </>
      )}

      {/* CLAIM DETAILS MODAL */}
      {selectedClaim && (
        <div
          className="insurance-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedClaim(null);
            }
          }}
        >
          <section
            className="insurance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="insurance-detail-title"
          >
            <div className="insurance-modal-header">
              <div>
                <span className="insurance-section-eyebrow">
                  CLAIM DETAILS
                </span>
                <h2 id="insurance-detail-title">
                  {selectedClaim.id}
                </h2>
              </div>

              <button
                type="button"
                className="insurance-modal-close"
                onClick={() => setSelectedClaim(null)}
                aria-label="Close claim details"
              >
                ×
              </button>
            </div>

            <div className="insurance-detail-patient">
              <strong>{selectedClaim.patient}</strong>
              <span>
                {selectedClaim.patientId} · {selectedClaim.admission}
              </span>
            </div>

            <div className="insurance-detail-grid">
              <div>
                <span>Insurer</span>
                <strong>{selectedClaim.insurer}</strong>
              </div>

              <div>
                <span>TPA</span>
                <strong>{selectedClaim.tpa}</strong>
              </div>

              <div>
                <span>Service</span>
                <strong>{selectedClaim.service}</strong>
              </div>

              <div>
                <span>Submission date</span>
                <strong>{formatDate(selectedClaim.submitted)}</strong>
              </div>

              <div>
                <span>Total bill</span>
                <strong>{formatCurrency(selectedClaim.billed)}</strong>
              </div>

              <div>
                <span>Claim status</span>
                <strong>
                  <span
                    className={`insurance-status insurance-status-${statusClass(
                      selectedClaim.status
                    )}`}
                  >
                    {selectedClaim.status}
                  </span>
                </strong>
              </div>
            </div>

            <div className="insurance-payable-box">
              <div>
                <span>Insurer payable</span>
                <strong>
                  {formatCurrency(selectedClaim.insurerAmount)}
                </strong>
              </div>

              <div>
                <span>Patient payable</span>
                <strong>
                  {formatCurrency(selectedClaim.patientAmount)}
                </strong>
              </div>
            </div>

            <p className="insurance-modal-note">
              This is demonstration information. It is not an insurer
              confirmation, settlement record or coverage guarantee.
            </p>

            <button
              type="button"
              className="insurance-button insurance-button-primary insurance-modal-done"
              onClick={() => setSelectedClaim(null)}
            >
              Close details
            </button>
          </section>
        </div>
      )}

      {/* NEW PRE-AUTHORIZATION MODAL */}
      {showRequestForm && (
        <div
          className="insurance-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowRequestForm(false);
            }
          }}
        >
          <section
            className="insurance-modal insurance-request-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="insurance-request-title"
          >
            <div className="insurance-modal-header">
              <div>
                <span className="insurance-section-eyebrow">
                  CASHLESS CARE
                </span>
                <h2 id="insurance-request-title">
                  New pre-authorization
                </h2>
                <p>
                  Enter the admission and financial details.
                </p>
              </div>

              <button
                type="button"
                className="insurance-modal-close"
                onClick={() => setShowRequestForm(false)}
                aria-label="Close request form"
              >
                ×
              </button>
            </div>

            <form
              className="insurance-request-form"
              onSubmit={submitRequest}
            >
              <div className="insurance-form-grid">
                <label>
                  Patient name *
                  <input
                    name="patient"
                    value={request.patient}
                    onChange={updateRequest}
                    required
                  />
                </label>

                <label>
                  Patient ID *
                  <input
                    name="patientId"
                    value={request.patientId}
                    onChange={updateRequest}
                    required
                  />
                </label>

                <label>
                  Insurer *
                  <select
                    name="insurer"
                    value={request.insurer}
                    onChange={updateRequest}
                    required
                  >
                    <option value="">Select insurer</option>
                    {insurers.map((insurer) => (
                      <option
                        key={insurer.name}
                        value={insurer.name}
                      >
                        {insurer.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Admission / booking ID *
                  <input
                    name="admission"
                    value={request.admission}
                    onChange={updateRequest}
                    required
                  />
                </label>

                <label>
                  Service type *
                  <select
                    name="service"
                    value={request.service}
                    onChange={updateRequest}
                  >
                    <option>Inpatient care</option>
                    <option>Surgery</option>
                    <option>Diagnostics</option>
                    <option>Emergency</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Total bill (₹) *
                  <input
                    name="billed"
                    type="number"
                    min="1"
                    step="0.01"
                    value={request.billed}
                    onChange={updateRequest}
                    required
                  />
                </label>

                <label>
                  Insurer payable (₹) *
                  <input
                    name="insurerAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={request.insurerAmount}
                    onChange={updateRequest}
                    required
                  />
                </label>

                <label>
                  Patient payable / co-pay (₹) *
                  <input
                    name="patientAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={request.patientAmount}
                    onChange={updateRequest}
                    required
                  />
                </label>
              </div>

              <p className="insurance-helper">
                The insurer and patient amounts must equal the total bill.
                Actual coverage and co-pay must be confirmed with the insurer.
              </p>

              {notice && (
                <div className="insurance-form-error" role="alert">
                  {notice}
                </div>
              )}

              <div className="insurance-modal-actions">
                <button
                  type="button"
                  className="insurance-button insurance-button-secondary"
                  onClick={() => setShowRequestForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="insurance-button insurance-button-primary"
                >
                  Create demo record
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

function ClaimTable({ claims, onView }) {
  if (!claims.length) {
    return (
      <div className="insurance-empty-state">
        No claims match your search or filters.
      </div>
    );
  }

  return (
    <div className="insurance-table-scroll">
      <table className="insurance-table">
        <thead>
          <tr>
            <th>Claim / patient</th>
            <th>Insurer / TPA</th>
            <th>Bill amount</th>
            <th>Insurer payable</th>
            <th>Submitted</th>
            <th>Age</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td>
                <div className="insurance-claim-identity">
                  <strong>{claim.id}</strong>
                  <span>{claim.patient}</span>
                  <small>{claim.patientId}</small>
                </div>
              </td>

              <td>
                <div className="insurance-claim-identity">
                  <strong>{claim.insurer}</strong>
                  <small>{claim.tpa}</small>
                </div>
              </td>

              <td>{formatCurrency(claim.billed)}</td>
              <td>
                <strong className="insurance-amount">
                  {formatCurrency(claim.insurerAmount)}
                </strong>
              </td>
              <td>{formatDate(claim.submitted)}</td>
              <td>{claim.age}d</td>

              <td>
                <span
                  className={`insurance-status insurance-status-${statusClass(
                    claim.status
                  )}`}
                >
                  {claim.status}
                </span>
              </td>

              <td>
                <button
                  type="button"
                  className="insurance-view-button"
                  onClick={() => onView(claim)}
                  aria-label={`View claim ${claim.id}`}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ClaimsDashboardPage;
