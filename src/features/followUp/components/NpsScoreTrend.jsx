import React from "react";

const scoreHistory = [
  { month: "May", score: 7.1 },
  { month: "Jun", score: 7.5 },
  { month: "Jul", score: 7.3 },
  { month: "Aug", score: 7.8 },
  { month: "Sep", score: 8.0 },
  { month: "Oct", score: 8.2 },
];

const NpsScoreTrend = () => {
  const width = 560;
  const height = 210;
  const padding = { top: 20, right: 24, bottom: 36, left: 35 };
  const min = 0;
  const max = 10;

  const points = scoreHistory.map((item, index) => ({
    ...item,
    x:
      padding.left +
      (index / (scoreHistory.length - 1)) *
        (width - padding.left - padding.right),
    y:
      padding.top +
      ((max - item.score) / (max - min)) *
        (height - padding.top - padding.bottom),
  }));

  const line = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <section className="followup-card nps-trend-card">
      <div className="followup-card-heading">
        <div>
          <h2>Patient satisfaction trend</h2>
          <p>Average patient feedback score · Last 6 months</p>
        </div>
        <span className="followup-trend-indicator">+1.1 points</span>
      </div>

      <div className="nps-chart-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Patient satisfaction scores trending from 7.1 in May to 8.2 in October"
          className="nps-chart"
        >
          {[0, 2, 4, 6, 8, 10].map((value) => {
            const y =
              padding.top +
              ((max - value) / (max - min)) *
                (height - padding.top - padding.bottom);

            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e4e3dc"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="#899089"
                  fontSize="10"
                >
                  {value}
                </text>
              </g>
            );
          })}

          <path
            d={line}
            fill="none"
            stroke="#0b4741"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <g key={point.month}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="#faf9f5"
                stroke="#0b4741"
                strokeWidth="2"
              />
              <text
                x={point.x}
                y={height - 10}
                textAnchor="middle"
                fill="#707b75"
                fontSize="11"
              >
                {point.month}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p className="followup-chart-note">
        Illustrative scores for the interface. Connect your actual
        WhatsApp feedback data before using this trend operationally.
      </p>
    </section>
  );
};

export default NpsScoreTrend;