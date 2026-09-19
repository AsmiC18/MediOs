import { useNavigate } from "react-router-dom";

export default function PharmacyDashboardPage() {
  const navigate = useNavigate();

  const stats = [
    {
      label: "Today's Dispensing",
      value: "24",
    },
    {
      label: "Pending Prescriptions",
      value: "7",
    },
    {
      label: "Low Stock Items",
      value: "5",
    },
    {
      label: "Expiring Soon",
      value: "3",
    },
  ];

  const actions = [
    {
      title: "Dispensing / POS",
      description:
        "Search medicines, manage the cart and dispense prescriptions.",
      path: "/staff/departments/pharmacy/dispensing",
    },
    {
      title: "Prescription Queue",
      description:
        "Review incoming prescriptions and check medicine availability.",
      path: "/staff/departments/pharmacy/prescriptions",
    },
    {
      title: "Stock Management",
      description:
        "Manage inventory, low-stock alerts, expiry and purchase orders.",
      path: "/staff/departments/pharmacy/stock",
    },
  ];

  return (
    <div className="pharmacy-dashboard">

      {/* Header */}
      <div className="pharmacy-dashboard-header">

        <div>
          <h1>Pharmacy</h1>

          <p>
            Overview of pharmacy operations and medicine inventory.
          </p>
        </div>

      </div>

      {/* Stats */}
      <div className="pharmacy-dashboard-stats">

        {stats.map((stat) => (
          <div
            key={stat.label}
            className="pharmacy-dashboard-stat"
          >
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}

      </div>

      {/* Operations */}
      <section className="pharmacy-dashboard-section">

        <div className="pharmacy-dashboard-section-header">
          <h2>Pharmacy Operations</h2>

          <p>
            Select an area to continue.
          </p>
        </div>

        <div className="pharmacy-dashboard-actions">

          {actions.map((action) => (
            <button
              key={action.path}
              className="pharmacy-dashboard-action"
              onClick={() => navigate(action.path)}
            >

              <div>
                <h3>{action.title}</h3>

                <p>
                  {action.description}
                </p>
              </div>

              <span>
                →
              </span>

            </button>
          ))}

        </div>

      </section>

    </div>
  );
}