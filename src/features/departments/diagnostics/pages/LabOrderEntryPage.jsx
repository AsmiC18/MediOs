
import { useMemo, useState } from "react";

const patients = [
  { id: "PAT-1001", name: "Ravi Kumar", visit: "VIS-2041" },
  { id: "PAT-1002", name: "Priya Sharma", visit: "VIS-2042" },
  { id: "PAT-1003", name: "Ananya Reddy", visit: "VIS-2043" },
  { id: "PAT-1004", name: "Karan Verma", visit: "VIS-2044" },
];

const availableTests = [
  { id: "CBC", name: "Complete Blood Count", category: "Haematology", price: 450 },
  { id: "LIPID", name: "Lipid Profile", category: "Biochemistry", price: 700 },
  { id: "FBS", name: "Blood Glucose, Fasting", category: "Biochemistry", price: 150 },
  { id: "THYROID", name: "Thyroid Function Test", category: "Hormones", price: 650 },
  { id: "LFT", name: "Liver Function Test", category: "Biochemistry", price: 600 },
  { id: "KFT", name: "Kidney Function Test", category: "Biochemistry", price: 550 },
  { id: "URINE", name: "Urine Routine Examination", category: "Pathology", price: 200 },
  { id: "HB1AC", name: "HbA1c", category: "Biochemistry", price: 500 },
];

const initialRecentOrders = [
  {
    id: "LAB-1042",
    patient: "Ravi Kumar",
    patientId: "PAT-1001",
    visit: "VIS-2041",
    tests: ["Complete Blood Count"],
    total: 450,
    doctor: "Dr. Meera Shah",
    status: "Processing",
  },
  {
    id: "LAB-1041",
    patient: "Priya Sharma",
    patientId: "PAT-1002",
    visit: "VIS-2042",
    tests: ["Lipid Profile"],
    total: 700,
    doctor: "Dr. Arjun Rao",
    status: "Pending",
  },
];

export default function LabOrderEntryPage() {
  const [patientId, setPatientId] = useState("");
  const [doctor, setDoctor] = useState("");
  const [selectedTests, setSelectedTests] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [recentOrders, setRecentOrders] = useState(initialRecentOrders);
  const [notice, setNotice] = useState("");

  const selectedPatient = patients.find((patient) => patient.id === patientId);

  const filteredTests = useMemo(() => {
    const query = testSearch.trim().toLowerCase();

    return availableTests.filter(
      (test) =>
        test.name.toLowerCase().includes(query) ||
        test.category.toLowerCase().includes(query)
    );
  }, [testSearch]);

  const selectedTestDetails = availableTests.filter((test) =>
    selectedTests.includes(test.id)
  );

  const total = selectedTestDetails.reduce((sum, test) => sum + test.price, 0);

  const toggleTest = (testId) => {
    setSelectedTests((current) =>
      current.includes(testId)
        ? current.filter((id) => id !== testId)
        : [...current, testId]
    );
    setNotice("");
  };

  const placeOrder = (event) => {
    event.preventDefault();

    if (!selectedPatient) {
      setNotice("Select a patient before placing the order.");
      return;
    }

    if (!doctor.trim()) {
      setNotice("Enter the ordering doctor's name.");
      return;
    }

    if (selectedTests.length === 0) {
      setNotice("Select at least one lab test.");
      return;
    }

    const newOrder = {
      id: `LAB-${Date.now().toString().slice(-6)}`,
      patient: selectedPatient.name,
      patientId: selectedPatient.id,
      visit: selectedPatient.visit,
      tests: selectedTestDetails.map((test) => test.name),
      total,
      doctor: doctor.trim(),
      status: "Pending",
      clinicalNotes: clinicalNotes.trim(),
    };

    setRecentOrders((current) => [newOrder, ...current]);
    setNotice(`Lab order ${newOrder.id} created successfully in this demo.`);

    setPatientId("");
    setDoctor("");
    setSelectedTests([]);
    setClinicalNotes("");
    setTestSearch("");
  };

  return (
    <div className="diagnostics-page">
      <div className="diagnostics-page-header">
        <div>
          <p className="diagnostics-eyebrow">DIAGNOSTICS / LABORATORY</p>
          <h1>Lab Order Entry</h1>
          <p>Create laboratory orders linked to a patient's visit.</p>
        </div>
        <div className="diagnostics-header-label">New lab order</div>
      </div>

      {notice && (
        <div className="diagnostics-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <form onSubmit={placeOrder}>
        <div className="diagnostics-order-layout">
          <div className="diagnostics-order-main">
            <section className="diagnostics-panel">
              <div className="diagnostics-panel-header">
                <div>
                  <h2>Patient and visit</h2>
                  <p>Choose the patient for whom the tests are being ordered.</p>
                </div>
                <span className="diagnostics-step-number">01</span>
              </div>

              <div className="diagnostics-form-grid">
                <label className="diagnostics-field">
                  Patient <span className="diagnostics-required">*</span>
                  <select
                    value={patientId}
                    onChange={(event) => setPatientId(event.target.value)}
                    required
                  >
                    <option value="">Select a patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} ({patient.id})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="diagnostics-field">
                  Visit ID
                  <input
                    value={selectedPatient?.visit || ""}
                    placeholder="Selected automatically"
                    readOnly
                  />
                </label>

                <label className="diagnostics-field diagnostics-field-full">
                  Ordering doctor <span className="diagnostics-required">*</span>
                  <input
                    value={doctor}
                    onChange={(event) => setDoctor(event.target.value)}
                    placeholder="e.g. Dr. Meera Shah"
                    required
                  />
                </label>
              </div>

              {selectedPatient && (
                <div className="diagnostics-selected-patient">
                  <div className="diagnostics-patient-avatar">
                    {selectedPatient.name.charAt(0)}
                  </div>
                  <div>
                    <strong>{selectedPatient.name}</strong>
                    <span>{selectedPatient.id} · Visit {selectedPatient.visit}</span>
                  </div>
                  <span className="diagnostics-status diagnostics-status-ready">
                    Patient selected
                  </span>
                </div>
              )}
            </section>

            <section className="diagnostics-panel">
              <div className="diagnostics-panel-header">
                <div>
                  <h2>Select laboratory tests</h2>
                  <p>Choose all tests required for this visit.</p>
                </div>
                <span className="diagnostics-step-number">02</span>
              </div>

              <input
                className="diagnostics-test-search"
                type="search"
                value={testSearch}
                onChange={(event) => setTestSearch(event.target.value)}
                placeholder="Search by test name or category..."
                aria-label="Search laboratory tests"
              />

              <div className="diagnostics-test-list">
                {filteredTests.map((test) => {
                  const checked = selectedTests.includes(test.id);

                  return (
                    <label
                      key={test.id}
                      className={`diagnostics-test-option ${checked ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTest(test.id)}
                      />
                      <span className="diagnostics-test-check">
                        {checked ? "✓" : ""}
                      </span>
                      <span className="diagnostics-test-info">
                        <strong>{test.name}</strong>
                        <small>{test.category}</small>
                      </span>
                      <strong className="diagnostics-test-price">
                        ₹{test.price.toLocaleString("en-IN")}
                      </strong>
                    </label>
                  );
                })}

                {filteredTests.length === 0 && (
                  <p className="diagnostics-empty">No tests match your search.</p>
                )}
              </div>
            </section>

            <section className="diagnostics-panel">
              <div className="diagnostics-panel-header">
                <div>
                  <h2>Clinical notes</h2>
                  <p>Add any relevant information for the laboratory team.</p>
                </div>
                <span className="diagnostics-step-number">03</span>
              </div>

              <label className="diagnostics-field">
                Notes <span className="diagnostics-optional">(optional)</span>
                <textarea
                  rows="3"
                  value={clinicalNotes}
                  onChange={(event) => setClinicalNotes(event.target.value)}
                  placeholder="Relevant symptoms, fasting status, or special instructions..."
                />
              </label>
            </section>
          </div>

          <aside className="diagnostics-order-summary">
            <p className="diagnostics-eyebrow">ORDER SUMMARY</p>
            <h2>Selected tests</h2>
            <p className="diagnostics-summary-caption">
              {selectedTestDetails.length} test
              {selectedTestDetails.length === 1 ? "" : "s"} selected
            </p>

            <div className="diagnostics-summary-tests">
              {selectedTestDetails.length === 0 ? (
                <p className="diagnostics-summary-empty">
                  Your selected tests will appear here.
                </p>
              ) : (
                selectedTestDetails.map((test) => (
                  <div className="diagnostics-summary-item" key={test.id}>
                    <div>
                      <strong>{test.name}</strong>
                      <button type="button" onClick={() => toggleTest(test.id)}>
                        Remove
                      </button>
                    </div>
                    <span>₹{test.price.toLocaleString("en-IN")}</span>
                  </div>
                ))
              )}
            </div>

            <div className="diagnostics-summary-total">
              <span>Estimated total</span>
              <strong>₹{total.toLocaleString("en-IN")}</strong>
            </div>

            <button type="submit" className="diagnostics-primary-button diagnostics-place-order">
              Place lab order
            </button>
            <p className="diagnostics-summary-footnote">
              The order will be marked pending. Billing and backend order creation are not connected in this demo.
            </p>
          </aside>
        </div>
      </form>

      <section className="diagnostics-panel diagnostics-recent-orders">
        <div className="diagnostics-panel-header">
          <div>
            <h2>Recent lab orders</h2>
            <p>Orders currently shown in this page session.</p>
          </div>
          <span className="diagnostics-count">{recentOrders.length} orders</span>
        </div>

        <div className="diagnostics-table-wrapper">
          <table className="diagnostics-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Patient</th>
                <th>Tests</th>
                <th>Doctor</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.id}</strong></td>
                  <td>
                    <div className="diagnostics-patient-cell">
                      <strong>{order.patient}</strong>
                      <small>{order.patientId}</small>
                    </div>
                  </td>
                  <td>{order.tests.join(", ")}</td>
                  <td>{order.doctor}</td>
                  <td>₹{order.total.toLocaleString("en-IN")}</td>
                  <td>
                    <span className={`diagnostics-status ${statusClassForOrder(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function statusClassForOrder(status) {
  if (status === "Ready") return "diagnostics-status-ready";
  if (status === "Processing") return "diagnostics-status-processing";
  return "diagnostics-status-pending";
}