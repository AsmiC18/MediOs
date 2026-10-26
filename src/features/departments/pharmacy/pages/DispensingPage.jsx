import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const mockMedicines = [
  {
    id: "MED001",
    name: "Paracetamol 500mg",
    category: "Tablet",
    batch: "PCM24081",
    barcode: "890100100001",
    stock: 120,
    reorderLevel: 30,
    unitPrice: 25,
    gst: 5,
    expiry: "2027-08-31",
    substitute: null,
  },
  {
    id: "MED002",
    name: "Amoxicillin 500mg",
    category: "Capsule",
    batch: "AMX24044",
    barcode: "890100100002",
    stock: 18,
    reorderLevel: 25,
    unitPrice: 85,
    gst: 12,
    expiry: "2027-04-30",
    substitute: "Azithromycin 500mg",
  },
  {
    id: "MED003",
    name: "Cetirizine 10mg",
    category: "Tablet",
    batch: "CTZ24017",
    barcode: "890100100003",
    stock: 65,
    reorderLevel: 20,
    unitPrice: 18,
    gst: 5,
    expiry: "2026-11-30",
    substitute: null,
  },
  {
    id: "MED004",
    name: "Ibuprofen 400mg",
    category: "Tablet",
    batch: "IBU24009",
    barcode: "890100100004",
    stock: 0,
    reorderLevel: 20,
    unitPrice: 40,
    gst: 5,
    expiry: "2027-02-28",
    substitute: "Paracetamol 500mg",
  },
  {
    id: "MED005",
    name: "Omeprazole 20mg",
    category: "Capsule",
    batch: "OMP24061",
    barcode: "890100100005",
    stock: 12,
    reorderLevel: 15,
    unitPrice: 55,
    gst: 12,
    expiry: "2026-10-15",
    substitute: null,
  },
  {
    id: "MED006",
    name: "Insulin Glargine",
    category: "Injection",
    batch: "INS24012",
    barcode: "890100100006",
    stock: 8,
    reorderLevel: 10,
    unitPrice: 650,
    gst: 5,
    expiry: "2026-12-20",
    substitute: null,
  },
  {
    id: "MED007",
    name: "Azithromycin 500mg",
    category: "Tablet",
    batch: "AZI24022",
    barcode: "890100100007",
    stock: 42,
    reorderLevel: 15,
    unitPrice: 95,
    gst: 12,
    expiry: "2027-06-30",
    substitute: null,
  },
];

const formatCurrency = (value) =>
  `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function DispensingPage() {
  const location = useLocation();

  const [medicines, setMedicines] = useState(mockMedicines);

  const [patient, setPatient] = useState({
    name: "",
    id: "",
  });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);

  // Prescription loaded from PrescriptionQueuePage
  useEffect(() => {
    const prescription = location.state?.prescription;

    if (!prescription) return;

    setPatient({
      name: prescription.patient,
      id: prescription.patientId,
    });

    const prescriptionItems = prescription.items
      .map((item) => {
        const medicine = mockMedicines.find(
          (medicine) => medicine.id === item.medicineId
        );

        if (!medicine) return null;

        if (medicine.stock === 0) {
          return null;
        }

        return {
          medicineId: medicine.id,
          name: medicine.name,
          quantity: Math.min(item.quantity, medicine.stock),
          unitPrice: medicine.unitPrice,
          gst: medicine.gst,
          stock: medicine.stock,
        };
      })
      .filter(Boolean);

    setCart(prescriptionItems);
  }, [location.state]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];

    const value = search.toLowerCase();

    return medicines.filter(
      (medicine) =>
        medicine.name.toLowerCase().includes(value) ||
        medicine.barcode.includes(value) ||
        medicine.batch.toLowerCase().includes(value)
    );
  }, [search, medicines]);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  const gst = cart.reduce(
    (sum, item) =>
      sum +
      item.unitPrice * item.quantity * (item.gst / 100),
    0
  );

  const total = subtotal + gst;

  const addMedicine = (medicine) => {
    if (medicine.stock <= 0) {
      alert(
        `${medicine.name} is out of stock.${
          medicine.substitute
            ? ` Suggested substitute: ${medicine.substitute}.`
            : ""
        }`
      );
      return;
    }

    const existing = cart.find(
      (item) => item.medicineId === medicine.id
    );

    if (existing) {
      if (existing.quantity >= medicine.stock) {
        alert("Maximum available stock reached.");
        return;
      }

      setCart((current) =>
        current.map((item) =>
          item.medicineId === medicine.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        )
      );
    } else {
      setCart((current) => [
        ...current,
        {
          medicineId: medicine.id,
          name: medicine.name,
          quantity: 1,
          unitPrice: medicine.unitPrice,
          gst: medicine.gst,
          stock: medicine.stock,
        },
      ]);
    }

    setSearch("");
  };

  const updateQuantity = (medicineId, value) => {
    const quantity = Number(value);

    if (quantity <= 0) {
      setCart((current) =>
        current.filter(
          (item) => item.medicineId !== medicineId
        )
      );
      return;
    }

    const medicine = medicines.find(
      (item) => item.id === medicineId
    );

    if (!medicine) return;

    if (quantity > medicine.stock) {
      alert(`Only ${medicine.stock} units available.`);
      return;
    }

    setCart((current) =>
      current.map((item) =>
        item.medicineId === medicineId
          ? { ...item, quantity }
          : item
      )
    );
  };

  const removeMedicine = (medicineId) => {
    setCart((current) =>
      current.filter(
        (item) => item.medicineId !== medicineId
      )
    );
  };

  const dispenseMedicines = () => {
    if (!patient.name.trim()) {
      alert("Please enter the patient name.");
      return;
    }

    if (cart.length === 0) {
      alert("Please add at least one medicine.");
      return;
    }

    const insufficient = cart.find((item) => {
      const medicine = medicines.find(
        (medicine) => medicine.id === item.medicineId
      );

      return (
        !medicine ||
        medicine.stock < item.quantity
      );
    });

    if (insufficient) {
      alert(
        `Insufficient stock for ${insufficient.name}.`
      );
      return;
    }

    setMedicines((current) =>
      current.map((medicine) => {
        const cartItem = cart.find(
          (item) => item.medicineId === medicine.id
        );

        if (!cartItem) return medicine;

        return {
          ...medicine,
          stock:
            medicine.stock - cartItem.quantity,
        };
      })
    );

    alert(
      `Medicines dispensed successfully.\n\nTotal: ${formatCurrency(
        total
      )}`
    );

    setCart([]);
    setPatient({
      name: "",
      id: "",
    });
  };

  return (
    <div className="pharmacy-page">
      <div className="pharmacy-page-header">
        <div>
          <h1>Pharmacy Dispensing</h1>
          <p>
            Search medicines, prepare prescriptions and dispense
            medicines.
          </p>
        </div>
      </div>

      <div className="pharmacy-dispensing-layout">
        {/* MEDICINE SEARCH */}

        <div className="pharmacy-card">
          <div className="pharmacy-card-header">
            <div>
              <h2>Patient & Medicine Search</h2>
              <p>
                Search using medicine name, barcode or batch
                number.
              </p>
            </div>
          </div>

          <div className="pharmacy-form-grid">
            <label>
              Patient Name
              <input
                value={patient.name}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    name: e.target.value,
                  })
                }
                placeholder="Enter patient name"
              />
            </label>

            <label>
              Patient ID
              <input
                value={patient.id}
                onChange={(e) =>
                  setPatient({
                    ...patient,
                    id: e.target.value,
                  })
                }
                placeholder="P001"
              />
            </label>
          </div>

          <div className="medicine-search-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Scan barcode or search medicine..."
            />

            <button
              className="secondary-pharmacy-button"
              onClick={() => setSearch("")}
            >
              Clear
            </button>
          </div>

          {search && (
            <div className="medicine-results">
              {searchResults.length === 0 ? (
                <div className="pharmacy-empty">
                  No medicine found.
                </div>
              ) : (
                searchResults.map((medicine) => (
                  <div
                    className="medicine-result"
                    key={medicine.id}
                  >
                    <div>
                      <strong>{medicine.name}</strong>

                      <span>
                        {medicine.category} · Batch{" "}
                        {medicine.batch}
                      </span>

                      <small>
                        Stock: {medicine.stock} · Barcode:{" "}
                        {medicine.barcode}
                      </small>
                    </div>

                    <div className="medicine-result-stock">
                      <span
                        className={`pharmacy-status ${
                          medicine.stock === 0
                            ? "danger"
                            : medicine.stock <=
                              medicine.reorderLevel
                            ? "warning"
                            : "success"
                        }`}
                      >
                        {medicine.stock === 0
                          ? "Out of Stock"
                          : medicine.stock <=
                            medicine.reorderLevel
                          ? "Low Stock"
                          : "In Stock"}
                      </span>

                      <button
                        className="small-pharmacy-button"
                        onClick={() =>
                          addMedicine(medicine)
                        }
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* CART */}

          <div className="pharmacy-cart">
            <div className="pharmacy-section-heading">
              <div>
                <h3>Current Prescription</h3>
                <span>
                  {cart.length} medicine(s)
                </span>
              </div>

              {cart.length > 0 && (
                <button
                  className="text-button"
                  onClick={() => setCart([])}
                >
                  Clear
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="pharmacy-empty">
                No medicines added.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  className="cart-item"
                  key={item.medicineId}
                >
                  <div className="cart-item-info">
                    <strong>{item.name}</strong>

                    <span>
                      {formatCurrency(item.unitPrice)} per unit
                    </span>
                  </div>

                  <div className="cart-item-controls">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(
                          item.medicineId,
                          e.target.value
                        )
                      }
                    />

                    <strong>
                      {formatCurrency(
                        item.quantity *
                          item.unitPrice
                      )}
                    </strong>

                    <button
                      className="remove-button"
                      onClick={() =>
                        removeMedicine(
                          item.medicineId
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* BILL */}

        <div className="pharmacy-card pharmacy-bill">
          <div className="pharmacy-card-header">
            <div>
              <h2>Bill Summary</h2>
              <p>Review the bill before dispensing.</p>
            </div>
          </div>

          <div className="bill-summary">
            <div>
              <span>Patient</span>
              <strong>
                {patient.name || "-"}
              </strong>
            </div>

            <div>
              <span>Patient ID</span>
              <strong>
                {patient.id || "-"}
              </strong>
            </div>

            <div>
              <span>Subtotal</span>
              <strong>
                {formatCurrency(subtotal)}
              </strong>
            </div>

            <div>
              <span>GST</span>
              <strong>
                {formatCurrency(gst)}
              </strong>
            </div>

            <div className="bill-total">
              <span>Total</span>
              <strong>
                {formatCurrency(total)}
              </strong>
            </div>
          </div>

          <button
            className="primary-pharmacy-button full-width"
            disabled={cart.length === 0}
            onClick={dispenseMedicines}
          >
            Dispense Medicines
          </button>
        </div>
      </div>
    </div>
  );
}