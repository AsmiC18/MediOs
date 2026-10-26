import React from "react";

const PatientTimeline = ({ patient }) => {

  const timeline = [
    {
      date: patient.lastVisit,
      type: "Visit",
      title: "Patient visit",
      description:
        "Consultation recorded in the patient record.",
    },
    {
      date: "10 Sep 2026",
      type: "Prescription",
      title: "Prescription",
      description:
        "Prescription added to patient record.",
    },
    {
      date: "08 Sep 2026",
      type: "Payment",
      title: "Payment recorded",
      description:
        "Patient payment recorded against their account.",
    },
    {
      date: "05 Sep 2026",
      type: "Lab Test",
      title: "Diagnostic test",
      description:
        "Diagnostic result added to patient timeline.",
    },
  ];

  return (
    <section className="patient-profile-card">

      <div className="profile-section-header">

        <div>
          <h2>
            Patient Timeline
          </h2>

          <p>
            Visits, tests, prescriptions, payments and claims
            in one timeline.
          </p>
        </div>

      </div>


      <div className="patient-timeline">

        {timeline.map((item, index) => (

          <div
            className="timeline-item"
            key={index}
          >

            <div className="timeline-marker"></div>

            <div className="timeline-content">

              <div className="timeline-top">

                <strong>
                  {item.title}
                </strong>

                <span>
                  {item.date}
                </span>

              </div>

              <small>
                {item.type}
              </small>

              <p>
                {item.description}
              </p>

            </div>

          </div>

        ))}

      </div>

    </section>
  );
};

export default PatientTimeline;