import React, { useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useWhatsappAbilities } from "../utils/whatsappAbilities";
import whatsappService from "../../../services/whatsappService";
import SegmentPicker from "../components/SegmentPicker";
import BroadcastHistory from "../components/BroadcastHistory";
import TemplatePreview from "../components/TemplatePreview";
import {
  broadcastStatusKey,
  broadcastStatusLabel,
  broadcastStatusClass,
} from "../utils/broadcastStatus";
import "../styles/broadcasts.css";

const STEPS = [
  {
    id: 1,
    label: "Choose audience",
    hint: "Pick the patient group that will receive the message.",
  },
  {
    id: 2,
    label: "Choose message",
    hint: "Select an approved template to send.",
  },
  {
    id: 3,
    label: "Review & send",
    hint: "Confirm the audience, message and delivery details.",
  },
];

const BroadcastComposerPage = () => {
  const { user } = useAuth();
  const abilities = useWhatsappAbilities();

  const [templates, setTemplates] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [customIds, setCustomIds] = useState([]);
  const [segmentCount, setSegmentCount] = useState(0);
  const [templateId, setTemplateId] = useState(null);

  const [sending, setSending] = useState(false);
  const [sentBroadcast, setSentBroadcast] = useState(null);
  const [detailBroadcast, setDetailBroadcast] = useState(null);
  const [notice, setNotice] = useState(null);

  const historyRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setHistoryLoading(true);

        const [templateList, broadcastList] = await Promise.all([
          whatsappService.getTemplates(),
          whatsappService.getBroadcasts(),
        ]);

        if (cancelled) {
          return;
        }

        setTemplates(templateList);
        setBroadcasts(broadcastList);
        setLoadError(null);

        const firstApproved = templateList.find(
          (template) => template.status.toLowerCase() === "approved"
        );

        if (firstApproved) {
          setTemplateId(firstApproved.id);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError("Could not load broadcast data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const recompute = async () => {
      if (!selectedId) {
        setSegmentCount(0);
        return;
      }

      if (selectedId === "custom") {
        setSegmentCount(customIds.length);
        return;
      }

      const count = await whatsappService.getSegmentCount(selectedId);

      if (!cancelled) {
        setSegmentCount(count ?? 0);
      }
    };

    recompute();

    return () => {
      cancelled = true;
    };
  }, [selectedId, customIds]);

  const segmentLabels = useMemo(() => {
    const labels = {
      "all-patients": "All Patients",
      "todays-appointments": "Today's Appointments",
      "upcoming-appointments": "Upcoming Appointments",
      "follow-up-due": "Follow-up Due",
      "pending-reports": "Pending Reports",
      "recent-patients": "Recent Patients",
      "missed-appointments": "Missed Appointments",
      custom: "Custom Selection",
    };

    return labels;
  }, []);

  const segmentLabel = segmentLabels[selectedId] || null;
  const selectedTemplate = templates.find(
    (template) => template.id === templateId
  );

  const stats = useMemo(() => {
    const total = broadcasts.length;
    const byStatus = {
      completed: 0,
      sending: 0,
      failed: 0,
      draft: 0,
    };

    broadcasts.forEach((broadcast) => {
      const key = broadcastStatusKey(broadcast.status);
      if (byStatus[key] !== undefined) {
        byStatus[key] += 1;
      }
    });

    return { total, ...byStatus };
  }, [broadcasts]);

  const refreshBroadcasts = async () => {
    const data = await whatsappService.getBroadcasts();
    setBroadcasts(data);
  };

  const canAudience =
    Boolean(selectedId) && selectedId === "custom"
      ? customIds.length > 0
      : segmentCount > 0;

  const canMessage = Boolean(selectedTemplate);

  const handleSelectSegment = (segmentId, ids) => {
    setSelectedId(segmentId);

    if (segmentId === "custom") {
      setCustomIds(ids);
    }
  };

  const continueFromStep = () => {
    if (step === 1 && !canAudience) {
      setNotice("Select an audience with at least one recipient first.");
      clearNoticeLater();
      return;
    }

    if (step === 2 && !canMessage) {
      setNotice("Choose a template to send.");
      clearNoticeLater();
      return;
    }

    setStep(step + 1);
  };

  const handleSend = async () => {
    if (sending || !selectedTemplate || !canAudience || !segmentLabel) {
      return;
    }

    setSending(true);

    try {
      const outcome = await whatsappService.simulateBroadcastOutcome(
        segmentCount
      );

      const created = await whatsappService.createBroadcast({
        name: `${selectedTemplate.name} — ${segmentLabel}`,
        message: selectedTemplate.body,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        segmentId: selectedId,
        segmentLabel,
        recipientCount: segmentCount,
        createdBy: user?.name || "Staff",
      });

      const final = await whatsappService.finalizeBroadcast(
        created.id,
        outcome
      );

      setSentBroadcast(final);
      await refreshBroadcasts();
    } catch (error) {
      setNotice("Could not send the broadcast. Please try again.");
      clearNoticeLater();
    } finally {
      setSending(false);
    }
  };

  const resetComposer = () => {
    setStep(1);
    setSelectedId(null);
    setCustomIds([]);
    setSegmentCount(0);

    const firstApproved = templates.find(
      (template) => template.status.toLowerCase() === "approved"
    );

    setTemplateId(firstApproved?.id || null);
    setSentBroadcast(null);
  };

  const clearNoticeLater = () => {
    setTimeout(() => setNotice(null), 3200);
  };

  const canSend = abilities.sendBroadcast;
  const canView = abilities.viewBroadcastHistory;
  const segmentName = segmentLabel || "Not selected";
  const recipientLabel =
    selectedId === "custom"
      ? `${customIds.length} patient${
          customIds.length === 1 ? "" : "s"
        }`
      : `${segmentCount} patient${segmentCount === 1 ? "" : "s"}`;

  const templateStatusLabel = (status) => {
    const normalized = String(status || "").toLowerCase();

    if (normalized === "approved") {
      return "Approved";
    }

    if (normalized === "suspended") {
      return "Suspended";
    }

    return "Draft";
  };

  return (
    <div className="wa-broadcasts-page">
      <div className="page-title-row">
        <div>
          <h1>WhatsApp Broadcasts</h1>
          <p>
            Send approved messages to selected patient groups.
          </p>
        </div>
      </div>

      <div className="wa-broadcast-stats" aria-label="Broadcast summary">
        <span className="wa-stat-chip">
          Total <strong>{stats.total}</strong>
        </span>

        <span className="wa-stat-chip">
          Completed <strong>{stats.completed}</strong>
        </span>

        <span className="wa-stat-chip">
          Sending <strong>{stats.sending}</strong>
        </span>

        <span className="wa-stat-chip">
          Failed <strong>{stats.failed}</strong>
        </span>

        <span className="wa-stat-chip">
          Draft <strong>{stats.draft}</strong>
        </span>
      </div>

      {notice && (
        <div className="wa-toast" role="status">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="wa-loading-block" role="status">
          <span className="wa-spinner" aria-hidden="true"></span>
          <p>Loading broadcasts…</p>
        </div>
      ) : loadError ? (
        <div className="wa-error-block" role="alert">
          <strong>Something went wrong</strong>
          <p>{loadError}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="wa-broadcast-grid">
          <div className="wa-broadcast-card">
            {!canSend ? (
              <div className="wa-permission-note" role="note">
                You have read-only access to broadcasts. Contact an
                administrator to enable broadcast sending for your
                account.
              </div>
            ) : sentBroadcast ? (
              <div className="wa-success-card">
                <span className="wa-success-icon" aria-hidden="true">
                  ✓
                </span>

                <h3>Broadcast sent successfully</h3>

                <p>
                  "{sentBroadcast.name}" was sent to{" "}
                  {sentBroadcast.recipientCount} recipients via the
                  WhatsApp Business API.
                </p>

                <div className="wa-success-counts">
                  <span className="wa-stat-chip">
                    Sent{" "}
                    <strong>{sentBroadcast.sentCount}</strong>
                  </span>

                  <span className="wa-stat-chip">
                    Failed{" "}
                    <strong>{sentBroadcast.failedCount}</strong>
                  </span>
                </div>

                <div className="wa-success-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={resetComposer}
                  >
                    Create another broadcast
                  </button>

                  <button
                    type="button"
                    className="primary-action"
                    onClick={() =>
                      historyRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    View history
                  </button>
                </div>
              </div>
            ) : (
              <div className="wa-wizard" role="region" aria-label="Broadcast composer">
                <div className="wa-wizard-step">
                  <span className="wa-sb-section-label">
                    Broadcast steps
                  </span>

                  <ol className="wa-wizard-steps">
                    {STEPS.map((item) => (
                      <li
                        key={item.id}
                        className={`wa-wizard-step${
                          item.id === step
                            ? " is-active"
                            : item.id < step
                            ? " is-done"
                            : ""
                        }`}
                      >
                        <div className="wa-wizard-step-header">
                          <span
                            className={`wa-step-index${
                              item.id === step
                                ? " is-active"
                                : item.id < step
                                ? " is-done"
                                : ""
                            }`}
                            aria-hidden="true"
                          >
                            {item.id < step ? "✓" : item.id}
                          </span>

                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.hint}</small>
                          </div>
                        </div>

                        {item.id === step && (
                          <div className="wa-step-body">
                            {step === 1 && (
                              <SegmentPicker
                                selectedId={selectedId}
                                customIds={customIds}
                                onSelect={handleSelectSegment}
                              />
                            )}

                            {step === 2 && (
                              <div className="wa-template-options">
                                {templates.map((template) => {
                                  const selectable =
                                    template.status.toLowerCase() ===
                                    "approved";

                                  return (
                                    <button
                                      key={template.id}
                                      type="button"
                                      className={`wa-template-option${
                                        templateId === template.id &&
                                        selectable
                                          ? " selected"
                                          : ""
                                      }`}
                                      disabled={!selectable}
                                      onClick={() =>
                                        selectable &&
                                        setTemplateId(template.id)
                                      }
                                      aria-pressed={
                                        templateId === template.id &&
                                        selectable
                                      }
                                    >
                                      <span
                                        className="wa-segment-radio"
                                        aria-hidden="true"
                                      ></span>

                                      <span className="wa-template-option-text">
                                        <strong>{template.name}</strong>
                                        <small>{template.body}</small>
                                      </span>

                                      <span className="wa-template-option-meta">
                                        <span className={`wa-status-badge ${template.status.toLowerCase()}`}>
                                          {templateStatusLabel(
                                            template.status
                                          )}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}

                                {templates.filter(
                                  (template) =>
                                    template.status.toLowerCase() ===
                                    "approved"
                                ).length === 0 && (
                                  <p className="wa-custom-hint">
                                    No approved templates available. Ask
                                    an administrator to approve a template
                                    before sending.
                                  </p>
                                )}
                              </div>
                            )}

                            {step === 3 && (
                              <>
                                <ul className="wa-confirm-list">
                                  <li>
                                    <span className="wa-confirm-key">
                                      Audience
                                    </span>
                                    <span className="wa-confirm-value">
                                      {segmentName}
                                    </span>
                                  </li>

                                  <li>
                                    <span className="wa-confirm-key">
                                      Recipients
                                    </span>
                                    <span className="wa-confirm-value">
                                      {recipientLabel}
                                    </span>
                                  </li>

                                  <li>
                                    <span className="wa-confirm-key">
                                      Template
                                    </span>
                                    <span className="wa-confirm-value">
                                      {selectedTemplate?.name || "—"}
                                    </span>
                                  </li>

                                  <li>
                                    <span className="wa-confirm-key">
                                      Sent by
                                    </span>
                                    <span className="wa-confirm-value">
                                      {user?.name || "Staff"}
                                    </span>
                                  </li>
                                </ul>

                                <p className="wa-confirm-note">
                                  This sends a WhatsApp Business API
                                  message to every recipient in the
                                  audience using the selected approved
                                  template. Recipients have previously
                                  opted in to receive messages from{" "}
                                  MediOS Hospital.
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {sending ? (
                  <div className="wa-sending-block" role="status">
                    <span className="wa-spinner" aria-hidden="true"></span>
                    <p>Sending broadcast…</p>
                  </div>
                ) : (
                  <div className="wa-wizard-nav">
                    {step > 1 ? (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => setStep(step - 1)}
                        disabled={sending}
                      >
                        Back
                      </button>
                    ) : (
                      <span></span>
                    )}

                    <div className="nav-group">
                      {step < 3 ? (
                        <button
                          type="button"
                          className="primary-action"
                          onClick={continueFromStep}
                        >
                          Continue
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="primary-action"
                          onClick={handleSend}
                          disabled={sending}
                        >
                          Send Broadcast
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="wa-preview-aside" aria-label="Broadcast preview">
            <div className="wa-preview-card">
              <TemplatePreview
                body={selectedTemplate?.body || ""}
                category={selectedTemplate?.category}
              />
            </div>

            <div className="wa-broadcast-meta">
              <div className="wa-broadcast-meta-row">
                <span>Audience</span>
                <strong>{segmentName}</strong>
              </div>

              <div className="wa-broadcast-meta-row">
                <span>Recipients</span>
                <strong>{recipientLabel}</strong>
              </div>

              <div className="wa-broadcast-meta-row">
                <span>Template</span>
                <strong>{selectedTemplate?.name || "Not selected"}</strong>
              </div>
            </div>
          </aside>
        </div>
      )}

      <section
        className="wa-history-section"
        ref={historyRef}
        aria-label="Broadcast history"
      >
        <div className="wa-history-head">
          <h2>Broadcast history</h2>

          {!historyLoading && (
            <small>{broadcasts.length} total</small>
          )}
        </div>

        {canView ? (
          <BroadcastHistory
            broadcasts={broadcasts}
            loading={historyLoading}
            onView={setDetailBroadcast}
          />
        ) : (
          <p className="wa-permission-note">
            You do not have permission to view broadcast history.
          </p>
        )}
      </section>

      {detailBroadcast && (
        <div
          className="wa-modal-overlay"
          onClick={() => setDetailBroadcast(null)}
        >
          <div
            className="wa-modal wa-broadcast-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wa-modal-header">
              <div>
                <span className="section-label">BROADCAST DETAILS</span>
                <h2 id="broadcast-detail-title">
                  {detailBroadcast.name}
                </h2>

                <p>
                  {detailBroadcast.id} ·{" "}
                  {detailBroadcast.templateName || "Custom message"}
                </p>
              </div>

              <button
                type="button"
                className="wa-modal-close"
                onClick={() => setDetailBroadcast(null)}
                aria-label="Close details"
              >
                ×
              </button>
            </div>

            <div className="wa-detail-grid">
              <div className="wa-detail-item">
                <span>Status</span>
                <strong>
                  <span
                    className={`wa-status-badge ${broadcastStatusClass(
                      detailBroadcast.status
                    )}`}
                  >
                    {broadcastStatusLabel(detailBroadcast.status)}
                  </span>
                </strong>
              </div>

              <div className="wa-detail-item">
                <span>Audience</span>
                <strong>{detailBroadcast.segmentLabel}</strong>
              </div>

              <div className="wa-detail-item">
                <span>Recipients</span>
                <strong>{detailBroadcast.recipientCount}</strong>
              </div>

              <div className="wa-detail-item">
                <span>Sent / Failed</span>
                <strong>
                  {detailBroadcast.sentCount} / {detailBroadcast.failedCount}
                </strong>
              </div>

              <div className="wa-detail-item">
                <span>Sent by</span>
                <strong>{detailBroadcast.createdBy}</strong>
              </div>

              <div className="wa-detail-item">
                <span>Sent at</span>
                <strong>{detailBroadcast.sentAt || "—"}</strong>
              </div>
            </div>

            <TemplatePreview
              body={detailBroadcast.message || ""}
              category={detailBroadcast.templateName}
            />

            <div className="wa-modal-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() => setDetailBroadcast(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BroadcastComposerPage;