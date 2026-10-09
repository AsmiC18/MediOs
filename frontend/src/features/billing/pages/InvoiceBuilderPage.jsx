import React, { useMemo, useState } from "react";

const initialItems = [
  {
    id: 1,
    description: "Doctor Consultation",
    category: "Consultation",
    quantity: 1,
    rate: 800,
    gst: 0,
  },
];

const InvoiceBuilderPage = () => {
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");

  const [items, setItems] = useState(initialItems);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Pending");

  const [payerType, setPayerType] = useState("Self Pay");
  const [insuranceAmount, setInsuranceAmount] = useState(0);

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        id: Date.now(),
        description: "",
        category: "Other",
        quantity: 1,
        rate: 0,
        gst: 0,
      },
    ]);
  };

  const updateItem = (id, field, value) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === "quantity" ||
                field === "rate" ||
                field === "gst"
                  ? Number(value)
                  : value,
            }
          : item
      )
    );
  };

  const removeItem = (id) => {
    setItems((current) =>
      current.filter((item) => item.id !== id)
    );
  };

  const calculations = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;

    items.forEach((item) => {
      const amount = item.quantity * item.rate;
      const gstAmount = (amount * item.gst) / 100;

      subtotal += amount;
      gstTotal += gstAmount;
    });

    const total = subtotal + gstTotal;

    const insurance = Math.min(
      Number(insuranceAmount) || 0,
      total
    );

    const patientPayable = total - insurance;

    return {
      subtotal,
      gstTotal,
      total,
      insurance,
      patientPayable,
    };
  }, [items, insuranceAmount]);

  const handlePayment = () => {
    if (!patientName.trim()) {
      alert("Please enter the patient name.");
      return;
    }

    if (!paymentMethod) {
      alert("Please select a payment method.");
      return;
    }

    setPaymentStatus("Paid");
  };

  return (
    <div className="invoice-builder-page">

      {/* HEADER */}
      <div className="page-title-row">
        <div>
          <h1>Billing & Invoice</h1>
          <p>
            Create invoices, calculate GST and record payments.
          </p>
        </div>

        <div className="invoice-status">
          {paymentStatus}
        </div>
      </div>

      {/* PATIENT DETAILS */}
      <section className="invoice-section">

        <div className="invoice-section-header">
          <div>
            <span className="section-label">
              PATIENT
            </span>
            <h2>Patient Details</h2>
          </div>
        </div>

        <div className="invoice-form-grid">

          <div className="form-field">
            <label>Patient Name</label>

            <input
              type="text"
              value={patientName}
              onChange={(e) =>
                setPatientName(e.target.value)
              }
              placeholder="Enter patient name"
            />
          </div>

          <div className="form-field">
            <label>Patient ID</label>

            <input
              type="text"
              value={patientId}
              onChange={(e) =>
                setPatientId(e.target.value)
              }
              placeholder="e.g. P001"
            />
          </div>

        </div>

      </section>

      {/* BILLING ITEMS */}
      <section className="invoice-section">

        <div className="invoice-section-header">
          <div>
            <span className="section-label">
              CHARGES
            </span>
            <h2>Invoice Items</h2>
          </div>

          <button
            className="primary-action"
            onClick={addItem}
          >
            + Add Item
          </button>
        </div>

        <div className="invoice-table-wrapper">

          <table className="invoice-table">

            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>GST %</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>

            <tbody>

              {items.map((item) => {

                const amount =
                  item.quantity * item.rate;

                return (
                  <tr key={item.id}>

                    <td>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "description",
                            e.target.value
                          )
                        }
                        placeholder="Service / item"
                      />
                    </td>

                    <td>
                      <select
                        value={item.category}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "category",
                            e.target.value
                          )
                        }
                      >
                        <option>Consultation</option>
                        <option>Room</option>
                        <option>Diagnostics</option>
                        <option>Pharmacy</option>
                        <option>Procedure</option>
                        <option>Other</option>
                      </select>
                    </td>

                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "quantity",
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min="0"
                        value={item.rate}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "rate",
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min="0"
                        max="100"
                        value={item.gst}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "gst",
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td>
                      <strong>
                        ₹{amount.toFixed(2)}
                      </strong>
                    </td>

                    <td>
                      <button
                        className="remove-item"
                        onClick={() =>
                          removeItem(item.id)
                        }
                      >
                        ×
                      </button>
                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>

      </section>

      {/* PAYMENT / PAYER */}
      <div className="invoice-bottom-grid">

        <section className="invoice-section">

          <div className="invoice-section-header">
            <div>
              <span className="section-label">
                PAYMENT
              </span>
              <h2>Payment Details</h2>
            </div>
          </div>

          <div className="form-field">

            <label>Payer Type</label>

            <select
              value={payerType}
              onChange={(e) =>
                setPayerType(e.target.value)
              }
            >
              <option>Self Pay</option>
              <option>Insurance</option>
              <option>Corporate</option>
            </select>

          </div>

          {payerType !== "Self Pay" && (
            <div className="form-field">

              <label>
                {payerType} Contribution
              </label>

              <input
                type="number"
                min="0"
                value={insuranceAmount}
                onChange={(e) =>
                  setInsuranceAmount(e.target.value)
                }
              />

            </div>
          )}

          <div className="form-field">

            <label>Payment Method</label>

            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value)
              }
            >
              <option value="">
                Select payment method
              </option>
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
              <option>Net Banking</option>
              <option>Insurance</option>
            </select>

          </div>

        </section>

        {/* TOTAL */}
        <section className="invoice-total-card">

          <div>
            <span>Subtotal</span>
            <strong>
              ₹{calculations.subtotal.toFixed(2)}
            </strong>
          </div>

          <div>
            <span>GST</span>
            <strong>
              ₹{calculations.gstTotal.toFixed(2)}
            </strong>
          </div>

          {calculations.insurance > 0 && (
            <div>
              <span>Payer Contribution</span>
              <strong>
                -₹{calculations.insurance.toFixed(2)}
              </strong>
            </div>
          )}

          <div className="invoice-grand-total">
            <span>Patient Payable</span>
            <strong>
              ₹{calculations.patientPayable.toFixed(2)}
            </strong>
          </div>

          <button
            className="pay-button"
            onClick={handlePayment}
          >
            {paymentStatus === "Paid"
              ? "Payment Recorded"
              : "Record Payment"}
          </button>

        </section>

      </div>

      {/* INVOICE FOOTER */}
      <div className="invoice-footer">

        <div>
          <strong>
            Invoice Preview
          </strong>

          <span>
            {patientName || "No patient selected"}
            {patientId && ` · ${patientId}`}
          </span>
        </div>

        <button
          className="secondary-action"
          onClick={() => window.print()}
        >
          Print Invoice
        </button>

      </div>

    </div>
  );
};

export default InvoiceBuilderPage;