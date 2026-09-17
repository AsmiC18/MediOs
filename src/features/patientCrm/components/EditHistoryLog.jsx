import React from "react";

const EditHistoryLog = ({ patientId }) => {

  const history = [
    {
      action: "Patient record created",
      user: "Admin",
      date: "15 Sep 2026, 09:30 AM",
    },
    {
      action: "Contact information updated",
      user: "Reception Staff",
      date: "12 Sep 2026, 11:20 AM",
    },
    {
      action: "Patient status reviewed",
      user: "Admin",
      date: "10 Sep 2026, 02:15 PM",
    },
  ];

  return (
    <section className="patient-profile-card">

      <div className="profile-section-header">

        <div>
          <h2>
            Edit History
          </h2>

          <p>
            Changes made to patient record {patientId}.
          </p>
        </div>

      </div>


      <div className="edit-history">

        {history.map((item, index) => (

          <div
            className="edit-history-row"
            key={index}
          >

            <div>

              <strong>
                {item.action}
              </strong>

              <small>
                By {item.user}
              </small>

            </div>

            <span>
              {item.date}
            </span>

          </div>

        ))}

      </div>

    </section>
  );
};

export default EditHistoryLog;