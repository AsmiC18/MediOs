import React, { useMemo, useState } from "react";

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
    expiry: "2027-08-31",
    supplier: "MediSupply Pvt Ltd",
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
    expiry: "2027-04-30",
    supplier: "PharmaCare",
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
    expiry: "2026-11-30",
    supplier: "MediSupply Pvt Ltd",
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
    expiry: "2027-02-28",
    supplier: "PharmaCare",
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
    expiry: "2026-10-15",
    supplier: "HealthPlus Distributors",
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
    expiry: "2026-12-20",
    supplier: "MediSupply Pvt Ltd",
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
    expiry: "2027-06-30",
    supplier: "PharmaCare",
  },
];

const formatCurrency = (value) =>
  `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const getDaysUntilExpiry = (expiry) => {
  const today = new Date();
  const expiryDate = new Date(expiry);

  return Math.ceil(
    (expiryDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
};

export default function StockManagementPage() {
  const [medicines, setMedicines] =
    useState(mockMedicines);

  const [purchaseOrders, setPurchaseOrders] = useState(
    []
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [showModal, setShowModal] =
    useState(false);

  const [supplier, setSupplier] = useState("");
  const [expectedDate, setExpectedDate] =
    useState("");

  const [poItems, setPoItems] = useState([]);

  const lowStock = medicines.filter(
    (medicine) =>
      medicine.stock > 0 &&
      medicine.stock <= medicine.reorderLevel
  );

  const outOfStock = medicines.filter(
    (medicine) => medicine.stock === 0
  );

  const expiringSoon = medicines.filter((medicine) => {
    const days = getDaysUntilExpiry(
      medicine.expiry
    );

    return days >= 0 && days <= 90;
  });

  const filteredMedicines = useMemo(() => {
    const value = search.toLowerCase().trim();

    return medicines.filter((medicine) => {
      const matchesSearch =
        !value ||
        medicine.name.toLowerCase().includes(value) ||
        medicine.batch.toLowerCase().includes(value) ||
        medicine.barcode.includes(value);

      const days = getDaysUntilExpiry(
        medicine.expiry
      );

      let matchesFilter = true;

      if (filter === "low") {
        matchesFilter =
          medicine.stock > 0 &&
          medicine.stock <= medicine.reorderLevel;
      }

      if (filter === "out") {
        matchesFilter = medicine.stock === 0;
      }

      if (filter === "expiry") {
        matchesFilter =
          days >= 0 && days <= 90;
      }

      return matchesSearch && matchesFilter;
    });
  }, [medicines, search, filter]);

  const openPurchaseOrder = (medicine = null) => {
    if (medicine) {
      setSupplier(medicine.supplier);

      setPoItems([
        {
          medicineId: medicine.id,
          name: medicine.name,
          quantity: Math.max(
            medicine.reorderLevel * 2,
            10
          ),
          unitPrice: medicine.unitPrice,
        },
      ]);
    } else {
      setSupplier("");
      setPoItems([]);
    }

    setExpectedDate("");
    setShowModal(true);
  };

  const addToPO = (medicine) => {
    const existing = poItems.find(
      (item) =>
        item.medicineId === medicine.id
    );

    if (existing) {
      setPoItems((current) =>
        current.map((item) =>
          item.medicineId === medicine.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        )
      );

      return;
    }

    setPoItems((current) => [
      ...current,
      {
        medicineId: medicine.id,
        name: medicine.name,
        quantity: 10,
        unitPrice: medicine.unitPrice,
      },
    ]);
  };

  const updatePOQuantity = (id, value) => {
    const quantity = Number(value);

    if (quantity <= 0) {
      setPoItems((current) =>
        current.filter(
          (item) => item.medicineId !== id
        )
      );

      return;
    }

    setPoItems((current) =>
      current.map((item) =>
        item.medicineId === id
          ? {
              ...item,
              quantity,
            }
          : item
      )
    );
  };

  const poTotal = poItems.reduce(
    (sum, item) =>
      sum + item.quantity * item.unitPrice,
    0
  );

  const createPurchaseOrder = () => {
    if (!supplier.trim()) {
      alert("Please enter a supplier.");
      return;
    }

    if (!expectedDate) {
      alert(
        "Please select the expected delivery date."
      );
      return;
    }

    if (poItems.length === 0) {
      alert(
        "Please add at least one medicine."
      );
      return;
    }

    const newOrder = {
      id: `PO-${1001 + purchaseOrders.length}`,
      supplier,
      orderDate: new Date()
        .toISOString()
        .split("T")[0],
      expectedDate,
      status: "Pending",
      items: poItems,
    };

    setPurchaseOrders((current) => [
      ...current,
      newOrder,
    ]);

    setSupplier("");
    setExpectedDate("");
    setPoItems([]);
    setShowModal(false);

    alert(
      `${newOrder.id} created successfully.`
    );
  };

  const receivePurchaseOrder = (orderId) => {
    const order = purchaseOrders.find(
      (item) => item.id === orderId
    );

    if (!order) return;

    setMedicines((current) =>
      current.map((medicine) => {
        const orderedItem = order.items.find(
          (item) =>
            item.medicineId === medicine.id
        );

        if (!orderedItem) return medicine;

        return {
          ...medicine,
          stock:
            medicine.stock +
            orderedItem.quantity,
        };
      })
    );

    setPurchaseOrders((current) =>
      current.map((item) =>
        item.id === orderId
          ? {
              ...item,
              status: "Received",
            }
          : item
      )
    );

    alert(
      `${order.id} received. Stock updated.`
    );
  };

  const cancelPurchaseOrder = (orderId) => {
    const confirmed = window.confirm(
      "Cancel this purchase order?"
    );

    if (!confirmed) return;

    setPurchaseOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: "Cancelled",
            }
          : order
      )
    );
  };

  return (
    <div className="pharmacy-page">
      <div className="pharmacy-page-header">
        <div>
          <h1>Stock Management</h1>
          <p>
            Monitor inventory, low stock and expiry
            dates.
          </p>
        </div>

        <button
          className="primary-pharmacy-button"
          onClick={() =>
            openPurchaseOrder()
          }
        >
          + Create Purchase Order
        </button>
      </div>

      {/* SUMMARY */}

      <div className="pharmacy-header-stats">
        <div>
          <span>Total Medicines</span>
          <strong>{medicines.length}</strong>
        </div>

        <div>
          <span>Low Stock</span>
          <strong>{lowStock.length}</strong>
        </div>

        <div>
          <span>Out of Stock</span>
          <strong>{outOfStock.length}</strong>
        </div>

        <div>
          <span>Expiring Soon</span>
          <strong>{expiringSoon.length}</strong>
        </div>
      </div>

      {/* INVENTORY */}

      <div className="pharmacy-card">
        <div className="stock-controls">
          <input
            placeholder="Search medicine, batch or barcode..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value)
            }
          >
            <option value="all">
              All Medicines
            </option>

            <option value="low">
              Low Stock
            </option>

            <option value="out">
              Out of Stock
            </option>

            <option value="expiry">
              Expiring Within 90 Days
            </option>
          </select>
        </div>

        <div className="pharmacy-table-wrapper">
          <table className="pharmacy-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Stock</th>
                <th>Reorder Level</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Supplier</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredMedicines.map(
                (medicine) => {
                  const days =
                    getDaysUntilExpiry(
                      medicine.expiry
                    );

                  const status =
                    medicine.stock === 0
                      ? "Out of Stock"
                      : medicine.stock <=
                        medicine.reorderLevel
                      ? "Low Stock"
                      : "In Stock";

                  return (
                    <tr key={medicine.id}>
                      <td>
                        <strong>
                          {medicine.name}
                        </strong>

                        <span className="table-secondary">
                          {medicine.category}
                        </span>
                      </td>

                      <td>{medicine.batch}</td>

                      <td>
                        <strong>
                          {medicine.stock}
                        </strong>
                      </td>

                      <td>
                        {medicine.reorderLevel}
                      </td>

                      <td>
                        {medicine.expiry}

                        {days >= 0 &&
                          days <= 90 && (
                            <span className="expiry-warning">
                              {days} days left
                            </span>
                          )}

                        {days < 0 && (
                          <span className="expiry-danger">
                            Expired
                          </span>
                        )}
                      </td>

                      <td>
                        <span
                          className={`pharmacy-status ${
                            status ===
                            "In Stock"
                              ? "success"
                              : status ===
                                "Low Stock"
                              ? "warning"
                              : "danger"
                          }`}
                        >
                          {status}
                        </span>
                      </td>

                      <td>
                        {medicine.supplier}
                      </td>

                      <td>
                        {(medicine.stock <=
                          medicine.reorderLevel ||
                          medicine.stock === 0) && (
                          <button
                            className="small-pharmacy-button"
                            onClick={() =>
                              openPurchaseOrder(
                                medicine
                              )
                            }
                          >
                            Create PO
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PURCHASE ORDERS */}

      <div className="pharmacy-card">
        <div className="pharmacy-card-header">
          <div>
            <h2>Purchase Orders</h2>
            <p>
              Manage incoming pharmacy stock.
            </p>
          </div>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="pharmacy-empty">
            No purchase orders created yet.
          </div>
        ) : (
          <div className="purchase-order-list">
            {purchaseOrders.map((order) => (
              <div
                className="purchase-order-card"
                key={order.id}
              >
                <div className="purchase-order-header">
                  <div>
                    <span className="purchase-order-id">
                      {order.id}
                    </span>

                    <h3>
                      {order.supplier}
                    </h3>

                    <p>
                      Ordered:{" "}
                      {order.orderDate}
                    </p>

                    <p>
                      Expected:{" "}
                      {order.expectedDate}
                    </p>
                  </div>

                  <span
                    className={`pharmacy-status ${
                      order.status ===
                      "Received"
                        ? "success"
                        : order.status ===
                          "Cancelled"
                        ? "danger"
                        : "warning"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="purchase-order-items">
                  {order.items.map(
                    (item) => (
                      <div
                        className="purchase-order-item"
                        key={
                          item.medicineId
                        }
                      >
                        <span>
                          {item.name}
                        </span>

                        <span>
                          {item.quantity} ×{" "}
                          {formatCurrency(
                            item.unitPrice
                          )}
                        </span>

                        <strong>
                          {formatCurrency(
                            item.quantity *
                              item.unitPrice
                          )}
                        </strong>
                      </div>
                    )
                  )}
                </div>

                <div className="purchase-order-footer">
                  <strong>
                    Total:{" "}
                    {formatCurrency(
                      order.items.reduce(
                        (
                          sum,
                          item
                        ) =>
                          sum +
                          item.quantity *
                            item.unitPrice,
                        0
                      )
                    )}
                  </strong>

                  {order.status ===
                    "Pending" && (
                    <div className="table-actions">
                      <button
                        className="small-pharmacy-button"
                        onClick={() =>
                          receivePurchaseOrder(
                            order.id
                          )
                        }
                      >
                        Mark Received
                      </button>

                      <button
                        className="small-danger-button"
                        onClick={() =>
                          cancelPurchaseOrder(
                            order.id
                          )
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE PO MODAL */}

      {showModal && (
        <div className="pharmacy-modal-overlay">
          <div className="pharmacy-modal">
            <div className="pharmacy-modal-header">
              <div>
                <h2>
                  Create Purchase Order
                </h2>

                <p>
                  Add medicines that need
                  replenishment.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setShowModal(false)
                }
              >
                ×
              </button>
            </div>

            <div className="pharmacy-form-grid">
              <label>
                Supplier
                <input
                  value={supplier}
                  onChange={(e) =>
                    setSupplier(
                      e.target.value
                    )
                  }
                  placeholder="Supplier name"
                />
              </label>

              <label>
                Expected Delivery
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) =>
                    setExpectedDate(
                      e.target.value
                    )
                  }
                />
              </label>
            </div>

            <div className="po-add-medicine">
              <h3>
                Add Medicines
              </h3>

              <select
                defaultValue=""
                onChange={(e) => {
                  const medicine =
                    medicines.find(
                      (item) =>
                        item.id ===
                        e.target.value
                    );

                  if (medicine) {
                    addToPO(
                      medicine
                    );
                  }

                  e.target.value = "";
                }}
              >
                <option
                  value=""
                  disabled
                >
                  Select medicine
                </option>

                {medicines.map(
                  (medicine) => (
                    <option
                      key={medicine.id}
                      value={medicine.id}
                    >
                      {medicine.name} -
                      Stock{" "}
                      {medicine.stock}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="po-items">
              {poItems.length === 0 ? (
                <div className="pharmacy-empty">
                  No medicines added.
                </div>
              ) : (
                poItems.map((item) => (
                  <div
                    className="po-item"
                    key={
                      item.medicineId
                    }
                  >
                    <div>
                      <strong>
                        {item.name}
                      </strong>

                      <span>
                        {formatCurrency(
                          item.unitPrice
                        )}{" "}
                        per unit
                      </span>
                    </div>

                    <input
                      type="number"
                      min="1"
                      value={
                        item.quantity
                      }
                      onChange={(e) =>
                        updatePOQuantity(
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
                        updatePOQuantity(
                          item.medicineId,
                          0
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="po-total">
              <span>
                Estimated Total
              </span>

              <strong>
                {formatCurrency(
                  poTotal
                )}
              </strong>
            </div>

            <div className="pharmacy-modal-actions">
              <button
                className="secondary-pharmacy-button"
                onClick={() =>
                  setShowModal(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-pharmacy-button"
                onClick={
                  createPurchaseOrder
                }
              >
                Create Purchase Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}