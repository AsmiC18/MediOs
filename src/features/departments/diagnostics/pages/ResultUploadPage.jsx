
import { useMemo, useState } from "react";

const initialOrders = [
  {
    id: "LAB-1042",
    patient: "Ravi Kumar",
    patientId: "PAT-1001",
    test: "Complete Blood Count",
    doctor: "Dr. Meera Shah",
    orderedAt: "09 Oct 2026",
    status: "Processing",
    result: "",
    notes: "",
    reportName: "",
  },
  {
    id: "LAB-1041",
    patient: "Priya Sharma",
    patientId: "PAT-1002",
    test: "Lipid Profile",
    doctor: "Dr. Arjun Rao",
    orderedAt: "09 Oct 2026",
    status: "Pending",
    result: "",
    notes: "",
    reportName: "",
  },
  {
    id: "LAB-1040",
    patient: "Ananya Reddy",
    patientId: "PAT-1003",
    test: "Blood Glucose, Fasting",
    doctor: "Dr. Meera Shah",
    orderedAt: "08 Oct 2026",
    status: "Ready",
    result: "92 mg/dL",
    notes: "Sample processed. Report ready.",
    reportName: "glucose-report.pdf",
  },
  {
    id: "LAB-1039",
    patient: "Karan Verma",
    patientId: "PAT-1004",
    test: "Thyroid Function Test",
    doctor: "Dr. Nisha Patel",
    orderedAt: "08 Oct 2026",
    status: "Pending",
    result: "",
    notes: "",
    reportName: "",
  },
];

const statusClass = {
  Pending: "diagnostics-status-pending",
  Processing: "diagnostics-status-processing",
  Ready: "diagnostics-status-ready",
};

export default function ResultUploadPage() {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState(null);
  const [notice, setNotice] = useState("");

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !query ||
        order.id.toLowerCase().includes(query) ||
        order.patient.toLowerCase().includes(query) ||
        order.patientId.toLowerCase().includes(query) ||
        order.test.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "All" || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const counts = {
    total: orders.length,
    pending: orders.filter((order) => order.status === "Pending").length,
    processing: orders.filter((order) => order.status === "Processing").length,
    ready: orders.filter((order) => order.status === "Ready").length,
  };

  const openOrder = (order) => {
    setSelectedOrder(order);
    setResult(order.result);
    setNotes(order.notes);
    setReport(null);
    setNotice("");
  };

  const saveResult = (markReady) => {
    if (!selectedOrder) return;

    if (markReady && !result.trim() && !report && !selectedOrder.reportName) {
      setNotice("Enter a result or attach a report before marking it ready.");
      return;
    }

    const reportName = report
      ? report.name
      : selectedOrder.reportName;

    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === selectedOrder.id
          ? {
              ...order,
              result: result.trim(),
              notes: notes.trim(),
              reportName,
              status: markReady ? "Ready" : "Processing",
            }
          : order
      )
    );

    setSelectedOrder(null);
    setNotice(
      markReady
        ? `Result marked ready for ${selectedOrder.patient}. WhatsApp delivery is simulated in this demo.`
        : `Result saved for ${selectedOrder.patient}.`
    );
  };

  return (
    <div className="diagnostics-page">
      <div className="diagnostics-page-header">
        <div>
          <p className="diagnostics-eyebrow">DIAGNOSTICS / LABORATORY</p>
          <h1>Lab Results</h1>
          <p>Review lab orders, enter results and prepare reports for patients.</p>
        </div>
        <div className="diagnostics-header-label">Result management</div>
      </div>

      {notice && (
        <div className="diagnostics-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="diagnostics-stats">
        <div className="diagnostics-stat-card">
          <span>Total orders</span>
          <strong>{counts.total}</strong>
          <small>All lab orders</small>
        </div>
        <div className="diagnostics-stat-card">
          <span>Pending</span>
          <strong>{counts.pending}</strong>
          <small>Awaiting processing</small>
        </div>
        <div className="diagnostics-stat-card">
          <span>Processing</span>
          <strong>{counts.processing}</strong>
          <small>Results in progress</small>
        </div>
        <div className="diagnostics-stat-card">
          <span>Ready</span>
          <strong>{counts.ready}</strong>
          <small>Results prepared</small>
        </div>
      </div>

      <section className="diagnostics-panel">
        <div className="diagnostics-panel-header">
          <div>
            <h2>Lab orders</h2>
            <p>Select an order to enter or update its result.</p>
          </div>
          <span className="diagnostics-count">{filteredOrders.length} orders</span>
        </div>

        <div className="diagnostics-toolbar">
          <input
            type="search"
            placeholder="Search patient, test or order ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search lab orders"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter orders by status"
          >
            <option value="All">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Ready">Ready</option>
          </select>
        </div>

        <div className="diagnostics-table-wrapper">
          <table className="diagnostics-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Patient</th>
                <th>Test</th>
                <th>Ordering doctor</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                  </td>
                  <td>
                    <div className="diagnostics-patient-cell">
                      <strong>{order.patient}</strong>
                      <small>{order.patientId}</small>
                    </div>
                  </td>
                  <td>{order.test}</td>
                  <td>{order.doctor}</td>
                  <td>{order.orderedAt}</td>
                  <td>
                    <span className={`diagnostics-status ${statusClass[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="diagnostics-secondary-button"
                      onClick={() => openOrder(order)}
                    >
                      {order.status === "Ready" ? "View result" : "Enter result"}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="diagnostics-empty">
                    No lab orders match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOrder && (
        <div
          className="diagnostics-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedOrder(null);
            }
          }}
        >
          <section
            className="diagnostics-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-modal-title"
          >
            <div className="diagnostics-modal-header">
              <div>
                <p className="diagnostics-eyebrow">{selectedOrder.id}</p>
                <h2 id="result-modal-title">Lab result</h2>
                <p>{selectedOrder.patient} · {selectedOrder.test}</p>
              </div>
              <button
                type="button"
                className="diagnostics-close-button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close result form"
              >
                ×
              </button>
            </div>

            <div className="diagnostics-modal-body">
              <div className="diagnostics-detail-grid">
                <div>
                  <span>Patient ID</span>
                  <strong>{selectedOrder.patientId}</strong>
                </div>
                <div>
                  <span>Ordering doctor</span>
                  <strong>{selectedOrder.doctor}</strong>
                </div>
              </div>

              <label className="diagnostics-field">
                Result / summary
                <textarea
                  rows="3"
                  value={result}
                  onChange={(event) => setResult(event.target.value)}
                  placeholder="Enter the result or a summary of findings..."
                />
              </label>

              <label className="diagnostics-field">
                Lab notes
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional notes for the report..."
                />
              </label>

              <label className="diagnostics-field">
                Attach report (PDF or image)
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(event) => setReport(event.target.files?.[0] || null)}
                />
                {(report?.name || selectedOrder.reportName) && (
                  <small className="diagnostics-file-name">
                    Selected report: {report?.name || selectedOrder.reportName}
                  </small>
                )}
                <small className="diagnostics-help-text">
                  Demo only: the file name is recorded in page state. No file is uploaded to a server.
                </small>
              </label>

              {selectedOrder.status === "Ready" && (
                <p className="diagnostics-ready-note">
                  This order is already marked ready. Saving changes will update its result in this demo.
                </p>
              )}
            </div>

            <div className="diagnostics-modal-footer">
              <button
                type="button"
                className="diagnostics-secondary-button"
                onClick={() => setSelectedOrder(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="diagnostics-secondary-button"
                onClick={() => saveResult(false)}
              >
                Save result
              </button>
              <button
                type="button"
                className="diagnostics-primary-button"
                onClick={() => {
                  if (window.confirm("Mark this result as ready for the patient?")) {
                    saveResult(true);
                  }
                }}
              >
                Mark ready
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}