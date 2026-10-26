import React from "react";

const sampleDetractors = [
  {
    id: "PT-1093",
    name: "Priya Nair",
    score: 4,
    comment: "I had to wait longer than expected.",
    date: "24 Oct 2026",
    status: "Needs follow-up",
  },
  {
    id: "PT-1172",
    name: "Karan Shah",
    score: 3,
    comment: "I would appreciate clearer appointment reminders.",
    date: "23 Oct 2026",
    status: "Needs follow-up",
  },
  {
    id: "PT-1085",
    name: "Rahul Menon",
    score: 6,
    comment: "Scheduling could be improved.",
    date: "21 Oct 2026",
    status: "Reviewed",
  },
];

const DetractorList = ({ items = sampleDetractors, onReview }) => {
  return (
    <section className="followup-card">
      <div className="followup-card-heading">
        <div>
          <h2>Detractors requiring follow-up</h2>
          <p>Feedback scores of 0–6 on the NPS scale</p>
        </div>
        <span className="followup-count">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="followup-empty">
          No detractor feedback to display.
        </div>
      ) : (
        <div className="detractor-list">
          {items.map((item) => (
            <article className="detractor-item" key={item.id}>
              <div className="detractor-score">{item.score}</div>

              <div className="detractor-content">
                <div className="detractor-title">
                  <strong>{item.name}</strong>
                  <span>{item.id}</span>
                  <time>{item.date}</time>
                </div>

                <p>{item.comment}</p>

                <span
                  className={`followup-status ${
                    item.status === "Reviewed"
                      ? "followup-status-reviewed"
                      : "followup-status-overdue"
                  }`}
                >
                  {item.status}
                </span>
              </div>

              {item.status !== "Reviewed" && onReview && (
                <button
                  type="button"
                  className="followup-secondary-button"
                  onClick={() => onReview(item)}
                >
                  Mark reviewed
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default DetractorList;