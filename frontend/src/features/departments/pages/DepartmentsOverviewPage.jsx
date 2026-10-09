import { useNavigate } from "react-router-dom";

export default function DepartmentsOverviewPage() {
  const navigate = useNavigate();

  const departments = [
    {
      name: "OPD",
      description: "Outpatient consultation and queue management",
      path: "/staff/departments/opd",
    },
    {
      name: "IPD",
      description: "Inpatient beds, admissions and patient allocation",
      path: "/staff/departments/ipd",
    },
    {
      name: "Pharmacy",
      description: "Dispensing, prescriptions and stock management",
      path: "/staff/departments/pharmacy",
    },
    {
      name: "Diagnostics",
      description: "Lab orders, test results and uploads",
      path: "/staff/departments/diagnostics",
    },
    {
      name: "Emergency",
      description: "Emergency cases, triage and critical care",
      path: "/staff/departments/emergency",
    },
    {
      name: "Surgery",
      description: "OT scheduling, pre-op and surgery management",
      path: "/staff/departments/surgery",
    },
  ];

  return (
    <div className="departments-page">

      <div className="departments-page-header">
        <div>
          <h1>Departments</h1>
          <p>Select a department to access its management tools.</p>
        </div>
      </div>

      <div className="department-grid">

        {departments.map((department) => (
          <button
            key={department.name}
            className="department-card"
            onClick={() => navigate(department.path)}
          >
            <div className="department-card-content">
              <h2>{department.name}</h2>
              <p>{department.description}</p>
            </div>

            <span className="department-card-arrow">
              →
            </span>
          </button>
        ))}

      </div>

    </div>
  );
}