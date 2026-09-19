import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useWhatsappAbilities } from "../utils/whatsappAbilities";
import whatsappService from "../../../services/whatsappService";
import { resolveTemplate, initialsOf } from "../utils/templateVariables";
import ConversationList from "../components/ConversationList";
import MessageThread from "../components/MessageThread";
import Composer from "../components/Composer";
import QuickReplyButtons from "../components/QuickReplyButtons";
import HandoverIndicator from "../components/HandoverIndicator";
import ConversationActionsMenu from "../components/ConversationActionsMenu";
import PatientContextPanel from "../components/PatientContextPanel";
import "../styles/inbox.css";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "assignedToMe", label: "Assigned to me" },
  { key: "unassigned", label: "Unassigned" },
  { key: "resolved", label: "Resolved" },
];

const buildValuesForConversation = (conversation) => {
  if (!conversation) {
    return {};
  }

  const { patient, context } = conversation;

  return {
    patient_name: patient.name,
    doctor_name: context?.doctor || "the doctor",
    appointment_date: context?.appointment?.date || "your scheduled date",
    appointment_time: context?.appointment?.time || "",
    department: context?.department || "MediOS",
    hospital_name: "MediOS Hospital",
    report_link: `https://reports.medios.in/RPT-${patient.id.slice(2)}`,
  };
};

const InboxPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const abilities = useWhatsappAbilities();

  const [conversations, setConversations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [quickReplies, setQuickReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [activeId, setActiveId] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [draft, setDraft] = useState("");
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [followUps, setFollowUps] = useState({});
  const [toast, setToast] = useState(null);

  const composerRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const [conversationData, staffData, replyData] = await Promise.all([
          whatsappService.getConversations(),
          whatsappService.getStaff(),
          whatsappService.getQuickReplies(),
        ]);

        if (cancelled) {
          return;
        }

        setConversations(conversationData);
        setStaff(staffData);
        setQuickReplies(replyData);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            "Could not load WhatsApp conversations. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const staffById = useMemo(() => {
    const map = {};
    staff.forEach((member) => {
      map[member.id] = member;
    });
    return map;
  }, [staff]);

  const activeConversation = useMemo(() => {
    if (!activeId) {
      return null;
    }

    return conversations.find((c) => c.id === activeId) || null;
  }, [conversations, activeId]);

  const filteredConversations = useMemo(() => {
    let list = conversations
      .slice()
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime()
      );

    if (filter === "unread") {
      list = list.filter((c) => c.unreadCount > 0);
    } else if (filter === "assignedToMe") {
      list = list.filter((c) => c.assignedTo === user?.id);
    } else if (filter === "unassigned") {
      list = list.filter((c) => !c.assignedTo);
    } else if (filter === "resolved") {
      list = list.filter((c) => c.status === "resolved");
    }

    const query = search.trim().toLowerCase();

    if (query) {
      list = list.filter((c) => {
        const lastMessage =
          c.messages[c.messages.length - 1]?.text || "";

        return (
          c.patient.name.toLowerCase().includes(query) ||
          c.patient.phone.replace(/\s/g, "").toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query) ||
          lastMessage.toLowerCase().includes(query)
        );
      });
    }

    return list;
  }, [conversations, filter, search, user]);

  const unreadTotal = conversations.filter(
    (c) => c.unreadCount > 0
  ).length;

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const handleClearSelection = () => {
    setActiveId(null);
    setSelecting(false);
    setDraft("");
    setQuickRepliesOpen(false);
    setContextOpen(false);
  };

  const handleSelectConversation = (conversation) => {
    if (conversation.id === activeId) {
      handleClearSelection();
      return;
    }

    setActiveId(conversation.id);
    setSelecting(true);
    setDraft("");
    setQuickRepliesOpen(false);
    setContextOpen(false);

    if (conversation.unreadCount > 0) {
      setConversations((current) =>
        current.map((c) =>
          c.id === conversation.id ? { ...c, unreadCount: 0 } : c
        )
      );

      whatsappService.markAsRead(conversation.id).catch(() => {});
    }
  };

  const handleSend = async (text) => {
    if (!activeConversation) {
      return;
    }

    const trimmed = text?.trim();

    if (!trimmed) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const at = new Date().toISOString();

    const tempMessage = {
      id: tempId,
      outgoing: true,
      text: trimmed,
      at,
      status: "sending",
    };

    setConversations((current) =>
      current.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              messages: [...c.messages, tempMessage],
              lastMessageAt: at,
              unreadCount: 0,
              status: "open",
            }
          : c
      )
    );

    setDraft("");

    try {
      const sent = await whatsappService.sendMessage(
        activeConversation.id,
        trimmed
      );

      setConversations((current) =>
        current.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? sent : m
                ),
              }
            : c
        )
      );
    } catch (error) {
      setConversations((current) =>
        current.map((c) =>
          c.id === activeConversation.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? { ...m, status: "failed" } : m
                ),
              }
            : c
        )
      );

      showToast("Message could not be sent. Please try again.");
    }
  };

  const handleToggleRead = async () => {
    if (!activeConversation) {
      return;
    }

    const isUnread = activeConversation.unreadCount > 0;

    setConversations((current) =>
      current.map((c) =>
        c.id === activeConversation.id
          ? { ...c, unreadCount: isUnread ? 0 : 1 }
          : c
      )
    );

    try {
      if (isUnread) {
        await whatsappService.markAsRead(activeConversation.id);
      } else {
        await whatsappService.markAsUnread(activeConversation.id);
      }
    } catch (error) {
      showToast("Could not update conversation.");
    }
  };

  const handleToggleResolve = async () => {
    if (!activeConversation) {
      return;
    }

    const resolving = activeConversation.status !== "resolved";

    setConversations((current) =>
      current.map((c) =>
        c.id === activeConversation.id
          ? { ...c, status: resolving ? "resolved" : "open", unreadCount: 0 }
          : c
      )
    );

    try {
      if (resolving) {
        await whatsappService.resolveConversation(activeConversation.id);
        showToast("Conversation resolved.");
      } else {
        await whatsappService.reopenConversation(activeConversation.id);
        showToast("Conversation reopened.");
      }
    } catch (error) {
      showToast("Could not update conversation.");
    }
  };

  const handleAssign = async (staffId) => {
    if (!activeConversation) {
      return;
    }

    setConversations((current) =>
      current.map((c) =>
        c.id === activeConversation.id ? { ...c, assignedTo: staffId } : c
      )
    );

    try {
      await whatsappService.assignConversation(activeConversation.id, staffId);

      showToast(
        staffId
          ? `Conversation assigned to ${staffById[staffId].name}.`
          : "Conversation unassigned."
      );
    } catch (error) {
      showToast("Could not update assignment.");
    }
  };

  const handleViewPatient = () => {
    if (activeConversation) {
      navigate(`/staff/patients/${activeConversation.patient.id}`);
    }
  };

  const handleCreateFollowUp = () => {
    if (!activeConversation) {
      return;
    }

    const date = new Date();
    date.setDate(date.getDate() + 14);

    const label = date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    setFollowUps((current) => ({
      ...current,
      [activeConversation.id]: label,
    }));

    showToast(`Follow-up scheduled for ${label}.`);
  };

  const handlePickQuickReply = (body) => {
    if (!activeConversation) {
      return;
    }

    const values = buildValuesForConversation(activeConversation);

    setDraft(resolveTemplate(body, values));

    setTimeout(() => composerRef.current?.focus(), 0);
  };

  const handleClearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  return (
    <div className="wa-inbox-page">
      <div className="page-title-row">
        <div>
          <h1>WhatsApp Inbox</h1>
          <p>
            Shared hospital WhatsApp inbox — appointments, reports and
            patient enquiries.
          </p>
        </div>
      </div>

      <div className="wa-inbox-stats" aria-label="Inbox summary">
        <div className="wa-stat-chip">
          <span>Conversations</span>
          <strong>{conversations.length}</strong>
        </div>
        <div className="wa-stat-chip">
          <span>Unread</span>
          <strong>{unreadTotal}</strong>
        </div>
        <div className="wa-stat-chip">
          <span>Assigned to me</span>
          <strong>
            {
              conversations.filter((c) => c.assignedTo === user?.id)
                .length
            }
          </strong>
        </div>
        <div className="wa-stat-chip">
          <span>Resolved</span>
          <strong>
            {conversations.filter((c) => c.status === "resolved").length}
          </strong>
        </div>
      </div>

      {loading ? (
        <div className="wa-loading-block" role="status">
          <span className="wa-spinner" aria-hidden="true"></span>
          <p>Loading conversations…</p>
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
        <div
          className={`wa-inbox ${selecting ? "wa-selecting" : ""}`}
        >
          <ConversationList
            conversations={filteredConversations}
            filters={FILTERS}
            activeFilter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            activeId={activeId}
            staffById={staffById}
            currentUserId={user?.id}
            onSelect={handleSelectConversation}
            onClearFilters={handleClearFilters}
            onClearSelection={handleClearSelection}
          />

          <section className="wa-thread-panel" aria-label="Conversation thread">
            {!activeConversation ? (
              <div className="wa-thread-empty">
                <span className="wa-thread-empty-icon" aria-hidden="true">
                  {user ? initialsOf(user.name || "MediOS") : "WA"}
                </span>
                <h2>Select a conversation</h2>
                <p>
                  Choose a conversation from the list to view the message
                  thread, patient context and quick replies.
                </p>
              </div>
            ) : (
              <>
                <div className="wa-thread-header">
                  <button
                    type="button"
                    className="wa-back-button"
                    onClick={() => setSelecting(false)}
                    aria-label="Back to conversation list"
                  >
                    ←
                  </button>

                  <span
                    className="wa-avatar wa-avatar-lg wa-avatar-solid"
                    aria-hidden="true"
                  >
                    {initialsOf(activeConversation.patient.name)}
                  </span>

                  <div className="wa-thread-heading">
                    <strong>{activeConversation.patient.name}</strong>
                    <small>{activeConversation.patient.phone}</small>

                    <span className="wa-thread-badges">
                      {activeConversation.status === "resolved" ? (
                        <span className="wa-status-badge resolved">
                          Resolved
                        </span>
                      ) : (
                        <span className="wa-status-badge open">Open</span>
                      )}

                      {activeConversation.unreadCount > 0 && (
                        <span className="wa-status-badge unread">
                          Unread
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="wa-thread-actions">
                    <button
                      type="button"
                      className="wa-info-button"
                      onClick={() => setContextOpen(true)}
                    >
                      Patient info
                    </button>

                    {abilities.assign && (
                      <HandoverIndicator
                        assignedTo={activeConversation.assignedTo}
                        staff={staff}
                        onAssign={handleAssign}
                      />
                    )}

                    <ConversationActionsMenu
                      conversation={activeConversation}
                      canAssign={abilities.assign}
                      canResolve={abilities.resolve}
                      onToggleRead={handleToggleRead}
                      onToggleResolve={handleToggleResolve}
                      onViewPatient={handleViewPatient}
                    />
                  </div>
                </div>

                {quickRepliesOpen && (
                  <QuickReplyButtons
                    quickReplies={quickReplies}
                    onPick={handlePickQuickReply}
                    disabled={!abilities.reply}
                  />
                )}

                <MessageThread conversation={activeConversation} />

                <Composer
                  ref={composerRef}
                  value={draft}
                  onChange={setDraft}
                  onSend={handleSend}
                  onToggleQuickReplies={() =>
                    setQuickRepliesOpen((current) => !current)
                  }
                  openQuickReplies={quickRepliesOpen}
                  disabled={!abilities.reply}
                  quickReplyCount={quickReplies.length}
                  placeholder={
                    abilities.reply
                      ? `Reply to ${activeConversation.patient.name.split(" ")[0]}…`
                      : "You do not have permission to reply"
                  }
                />
              </>
            )}
          </section>

          <PatientContextPanel
            conversation={activeConversation}
            open={contextOpen}
            onClose={() => setContextOpen(false)}
            onViewPatient={handleViewPatient}
            onViewAppointment={() => navigate("/staff/scheduling")}
            onCreateFollowUp={handleCreateFollowUp}
            canCreateFollowUp={abilities.resolve}
            followUpCreated={Boolean(
              activeConversation &&
                followUps[activeConversation.id]
            )}
          />
        </div>
      )}

      {toast && (
        <div className="wa-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
};

export default InboxPage;