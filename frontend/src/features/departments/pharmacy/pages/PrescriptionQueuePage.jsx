import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const mockMedicines = [
  {
    id: "MED001",
    name: "Paracetamol 500mg",
    stock: 120,
    substitute: null,
  },
  {
    id: "MED002",
    name: "Amoxicillin 500mg",
    stock: 18,
    substitute: "Azithromycin 500mg",
  },
  {
    id: "MED003",
    name: "Cetirizine 10mg",
    stock: 65,
    substitute: null,
  },
  {
    id: "MED004",
    name: "Ibuprofen 400mg",
    stock: 0,
    substitute: "Paracetamol 500mg",
  },
  {
    id: "MED005",
    name: "Omeprazole 20mg",
    stock: 12,
    substitute: null,
  },
];

const initialPrescriptions = [
  {
    id: "RX001",
    patient: "Priya Menon",
    patientId: "P002",
    doctor: "Dr. Mehta",
    date: "20 Sep 2026",
    status: "Pending",
    items: [
      {
        medicineId: "MED001",
        quantity: 10,
      },
      {
        medicineId: "MED003",
        quantity: 5,
      },
    ],
  },
  {
    id: "RX002",
    patient: "Arun Kumar",
    patientId: "P001",
    doctor: "Dr. Sharma",
    date: "20 Sep 2026",
    status: "Pending",
    items: [
      {
        medicineId: "MED002",
        quantity: 10,
      },
      {
        medicineId: "MED005",
        quantity: 5,
      },
    ],
  },
  {
    id: "RX003",
    patient: "Rahul Singh",
    patientId: "P003",
    doctor: "Dr. Rao",
    date: "20 Sep 2026",
    status: "Pending",
    items: [
      {
        medicineId: "MED004",
        quantity: 5,
      },
    ],
  },
];

export default function PrescriptionQueuePage() {
  const navigate = useNavigate();

  const [prescriptions, setPrescriptions] =
    useState(initialPrescriptions);

  const getMedicine = (id) =>
    mockMedicines.find(
      (medicine) => medicine.id === id
    );

  const loadIntoPOS = (prescription) => {
    navigate("/staff/departments/pharmacy/dispensing", {
      state: {
        prescription,
      },
    });
  };

  const markReady = (id) => {
    setPrescriptions((current) =>
      current.map((prescription) =>
        prescription.id === id
          ? {
              ...prescription,
              status: "Ready",
            }
          : prescription
      )
    );
  };

  const pendingCount = prescriptions.filter(
    (prescription) =>
      prescription.status === "Pending"
  ).length;

  return (
    <div className="pharmacy-page">
      <div className="pharmacy-page-header">
        <div>
          <h1>Prescription Queue</h1>
          <p>
            Prescriptions received from OPD and clinical
            records.
          </p>
        </div>

        <span className="pharmacy-status warning">
          {pendingCount} Pending
        </span>
      </div>

      <div className="pharmacy-card">
        <div className="pharmacy-card-header">
          <div>
            <h2>Incoming Prescriptions</h2>
            <p>
              Check medicine availability before dispensing.
            </p>
          </div>
        </div>

        <div className="prescription-list">
          {prescriptions.map((prescription) => (
            <div
              className="prescription-card"
              key={prescription.id}
            >
              <div className="prescription-main">
                <div>
                  <span className="prescription-id">
                    {prescription.id}
                  </span>

                  <h3>{prescription.patient}</h3>

                  <p>
                    Patient ID:{" "}
                    {prescription.patientId}
                  </p>

                  <p>
                    Doctor: {prescription.doctor}
                  </p>

                  <p>
                    Date: {prescription.date}
                  </p>
                </div>

                <span
                  className={`pharmacy-status ${
                    prescription.status === "Pending"
                      ? "warning"
                      : "success"
                  }`}
                >
                  {prescription.status}
                </span>
              </div>

              <div className="prescription-medicines">
                {prescription.items.map((item) => {
                  const medicine = getMedicine(
                    item.medicineId
                  );

                  if (!medicine) return null;

                  const available =
                    medicine.stock >= item.quantity;

                  return (
                    <div
                      className="prescription-medicine"
                      key={item.medicineId}
                    >
                      <div>
                        <strong>
                          {medicine.name}
                        </strong>

                        <span>
                          Required: {item.quantity}
                        </span>

                        <span>
                          Available: {medicine.stock}
                        </span>
                      </div>

                      {available ? (
                        <span className="pharmacy-status success">
                          Available
                        </span>
                      ) : (
                        <div className="prescription-substitute">
                          <strong>
                            Stock Issue
                          </strong>

                          <span>
                            Only {medicine.stock} available
                          </span>

                          {medicine.substitute && (
                            <span>
                              Suggested substitute:{" "}
                              {medicine.substitute}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="prescription-actions">
                <button
                  className="secondary-pharmacy-button"
                  onClick={() =>
                    loadIntoPOS(prescription)
                  }
                >
                  Load into POS
                </button>

                {prescription.status === "Pending" && (
                  <button
                    className="primary-pharmacy-button"
                    onClick={() =>
                      markReady(prescription.id)
                    }
                  >
                    Mark Ready
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}