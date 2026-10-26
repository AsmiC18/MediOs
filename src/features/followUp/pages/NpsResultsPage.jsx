import React, { useMemo, useState } from "react";
import NpsScoreTrend from "../components/NpsScoreTrend";
import DetractorList from "../components/DetractorList";


const initialFeedback = [
  {
    id: "FB-001",
    patientId: "PT-1093",
    name: "Priya Nair",
    score: 4,
    comment: "I had to wait longer than expected.",
    date: "2026-10-24",
    status: "Needs follow-up",
  },
  {
    id: "FB-002",
    patientId: "PT-1172",
    name: "Karan Shah",
    score: 3,
    comment: "I would appreciate clearer appointment reminders.",
    date: "2026-10-23",
    status: "Needs follow-up",
  },
  {
    id: "FB-003",
    patientId: "PT-1085",
    name: "Rahul Menon",
    score: 6,
    comment: "Scheduling could be improved.",
    date: "2026-10-21",
    status: "Reviewed",
  },
  {
    id: "FB-004",
    patientId: "PT-1042",
    name: "Ananya Sharma",
    score: 9,
    comment: "The staff were helpful and professional.",
    date: "2026-10-20",
    status: "Reviewed",
  },
  {
    id: "FB-005",
    patientId: "PT-1148",
    name: "Meera Krishnan",
    score: 10,
    comment: "The consultation was clear and reassuring.",
    date: "2026-10-18",
    status: "Reviewed",
  },
];

const formatDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const NpsResultsPage = () => {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All feedback");
  const [notice, setNotice] = useState("");

  const summary = useMemo(() => {
    const total = feedback.length;

    const promoters = feedback.filter((item) => item.score >= 9).length;
    const detractors = feedback.filter((item) => item.score <= 6).length;
    const passives = feedback.filter(
      (item) => item.score >= 7 && item.score <= 8
    ).length;

    const nps = total
      ? Math.round(((promoters - detractors) / total) * 100)
      : 0;

    const average = total
      ? (
          feedback.reduce((sum, item) => sum + item.score, 0) / total
        ).toFixed(1)
      : "0.0";

    return { total, promoters, detractors, passives, nps, average };
  }, [feedback]);

  const visibleFeedback = feedback.filter((item) => {
    const query = search.trim().toLowerCase();

    const matchesSearch = [
      item.name,
      item.patientId,
      item.comment,
    ].some((value) => value.toLowerCase().includes(query));

    const matchesFilter =
      filter === "All feedback" ||
      (filter === "Detractors" && item.score <= 6) ||
      (filter === "Promoters" && item.score >= 9) ||
      (filter === "Needs follow-up" && item.status === "Needs follow-up");

    return matchesSearch && matchesFilter;
  });

  const reviewFeedback = (item) => {
    setFeedback((previous) =>
      previous.map((entry) =>
        entry.id === item.id
          ? { ...entry, status: "Reviewed" }
          : entry
      )
    );

    setNotice(`Feedback from ${item.name} marked as reviewed.`);
  };

  const detractorItems = feedback
    .filter((item) => item.score <= 6)
    .map((item) => ({
      ...item,
      patient: item.name,
      date: formatDate(item.date),
    }));

  return (
    <main className="followup-page">
      <header className="followup-header">
        <div>
          <div className="followup-breadcrumb">
            PATIENT CARE <span>/</span> FEEDBACK
          </div>
          <h1>NPS results</h1>
          <p>
            Review patient satisfaction, feedback trends and responses
            requiring follow-up.
          </p>
        </div>
      </header>

      <div className="followup-demo-note">
        <span />
        Demonstration feedback — not connected to live WhatsApp surveys.
      </div>

      {notice && (
        <div className="followup-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="followup-summary">
        <article className="followup-stat-card">
          <span className="followup-stat-label">Net Promoter Score</span>
          <strong>
            {summary.nps > 0 ? "+" : ""}
            {summary.nps}
          </strong>
          <small>Promoter percentage minus detractor percentage</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Responses received</span>
          <strong>{summary.total}</strong>
          <small>Available demonstration feedback records</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Average score</span>
          <strong>
            {summary.average}
            <span className="followup-stat-suffix">/10</span>
          </strong>
          <small>Average satisfaction rating</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Detractors</span>
          <strong>{summary.detractors}</strong>
          <small>Scores between 0 and 6</small>
        </article>
      </section>

      <NpsScoreTrend />

      <section className="followup-summary followup-nps-breakdown">
        <article className="followup-stat-card">
          <span className="followup-stat-label">Promoters</span>
          <strong>{summary.promoters}</strong>
          <small>Scores of 9–10</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Passives</span>
          <strong>{summary.passives}</strong>
          <small>Scores of 7–8</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Detractors</span>
          <strong>{summary.detractors}</strong>
          <small>Scores of 0–6</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Awaiting review</span>
          <strong>
            {
              feedback.filter(
                (item) => item.status === "Needs follow-up"
              ).length
            }
          </strong>
          <small>Feedback needing staff attention</small>
        </article>
      </section>

      <DetractorList
        items={detractorItems}
        onReview={reviewFeedback}
      />

      <section className="followup-card">
        <div className="followup-card-heading">
          <div>
            <h2>All patient comments</h2>
            <p>Review feedback collected from patient surveys.</p>
          </div>
        </div>

        <div className="followup-toolbar">
          <label className="followup-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient or comment..."
              aria-label="Search feedback"
            />
          </label>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter feedback"
          >
            <option>All feedback</option>
            <option>Detractors</option>
            <option>Promoters</option>
            <option>Needs follow-up</option>
          </select>
        </div>

        <div className="followup-table-wrap">
          <table className="followup-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Score</th>
                <th>Comment</th>
                <th>Date</th>
                <th>Category</th>
                <th>Review status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {visibleFeedback.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <span className="followup-secondary-text">
                      {item.patientId}
                    </span>
                  </td>

                  <td>
                    <strong>{item.score}/10</strong>
                  </td>

                  <td>{item.comment}</td>
                  <td>{formatDate(item.date)}</td>

                  <td>
                    <span
                      className={`followup-status ${
                        item.score <= 6
                          ? "followup-status-overdue"
                          : item.score >= 9
                            ? "followup-status-reviewed"
                            : "followup-status-at-risk"
                      }`}
                    >
                      {item.score <= 6
                        ? "Detractor"
                        : item.score >= 9
                          ? "Promoter"
                          : "Passive"}
                    </span>
                  </td>

                  <td>{item.status}</td>

                  <td>
                    {item.status === "Needs follow-up" ? (
                      <button
                        type="button"
                        className="followup-action-link"
                        onClick={() => reviewFeedback(item)}
                      >
                        Mark reviewed
                      </button>
                    ) : (
                      <span className="followup-feedback-state">
                        Reviewed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleFeedback.length === 0 && (
            <div className="followup-empty">
              No feedback matches your filters.
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default NpsResultsPage;