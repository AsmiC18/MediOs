import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


const WinBackCampaignPage = () => {
  const navigate = useNavigate();

  const [segment, setSegment] = useState("Lapsed patients");
  const [template, setTemplate] = useState("Follow-up reminder");
  const [notice, setNotice] = useState("");

  const campaignTemplates = {
    "Follow-up reminder":
      "A gentle reminder to contact the clinic to arrange your next visit.",
    "Routine review":
      "We invite you to contact the clinic to arrange your routine review.",
    "Post-treatment check-in":
      "Your care team would like to check in after your recent treatment.",
  };

  const openBroadcastComposer = () => {
    navigate("/staff/whatsapp/broadcasts", {
      state: {
        source: "follow-up",
        segment,
        template,
        message: campaignTemplates[template],
        prefiltered: true,
      },
    });

    setNotice("");
  };

  return (
    <main className="followup-page">
      <header className="followup-header">
        <div>
          <div className="followup-breadcrumb">
            PATIENT CARE <span>/</span> WIN-BACK
          </div>
          <h1>Win-back campaigns</h1>
          <p>
            Prepare targeted outreach for patients who have become
            inactive or missed their usual visit interval.
          </p>
        </div>

        <button
          type="button"
          className="followup-primary-button"
          onClick={openBroadcastComposer}
        >
          Open WhatsApp composer →
        </button>
      </header>

      <div className="followup-demo-note">
        <span />
        Campaign setup only. Messages are sent through the existing
        WhatsApp module, subject to its implementation and permissions.
      </div>

      {notice && (
        <div className="followup-notice" role="status">
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="followup-card followup-campaign-panel">
        <div className="followup-campaign-intro">
          <span className="followup-campaign-icon" aria-hidden="true">
            ↗
          </span>

          <div>
            <span className="followup-eyebrow">
              PATIENT ENGAGEMENT
            </span>
            <h2>Reconnect with inactive patients</h2>
            <p>
              Choose a patient segment and an approved message template,
              then continue in the WhatsApp broadcast composer.
            </p>
          </div>
        </div>

        <form
          className="followup-campaign-form"
          onSubmit={(event) => {
            event.preventDefault();
            openBroadcastComposer();
          }}
        >
          <label>
            Patient segment
            <select
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
            >
              <option>Lapsed patients</option>
              <option>Overdue patients</option>
              <option>Chronic care patients</option>
              <option>Post-treatment follow-up</option>
            </select>
          </label>

          <label>
            Message template
            <select
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
            >
              {Object.keys(campaignTemplates).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>

          <div className="followup-campaign-preview">
            <span>MESSAGE PREVIEW</span>
            <p>{campaignTemplates[template]}</p>
            <small>
              Use an approved WhatsApp template for outbound messages
              where required.
            </small>
          </div>

          <div className="followup-campaign-footer">
            <p>
              Confirm the recipient list, consent and message content
              in the broadcast composer before sending.
            </p>

            <button
              type="submit"
              className="followup-primary-button"
            >
              Continue to WhatsApp →
            </button>
          </div>
        </form>
      </section>

      <section className="followup-campaign-options">
        <article>
          <span>01</span>
          <h3>Identify lapsed patients</h3>
          <p>
            Use the patient's last visit and expected visit cadence to
            identify patients who may need a check-in.
          </p>
        </article>

        <article>
          <span>02</span>
          <h3>Prepare outreach</h3>
          <p>
            Choose the appropriate message template and review the
            proposed recipient segment.
          </p>
        </article>

        <article>
          <span>03</span>
          <h3>Review and send</h3>
          <p>
            Complete the broadcast using the existing WhatsApp workflow
            and its configured permissions.
          </p>
        </article>
      </section>
    </main>
  );
};

export default WinBackCampaignPage;