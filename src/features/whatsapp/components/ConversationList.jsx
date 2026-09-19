import React from "react";
import { formatConversationListTime, initialsOf } from "../utils/templateVariables";

const ConversationListItem = ({
  conversation,
  active,
  staffById,
  onSelect,
}) => {
  const lastMessageText =
    conversation.messages.length > 0
      ? conversation.messages[conversation.messages.length - 1].text
      : "No messages yet";

  const assignee = conversation.assignedTo
    ? staffById[conversation.assignedTo]
    : null;

  return (
    <button
      type="button"
      className={[
        "wa-conversation-item",
        active ? "active" : "",
        conversation.unreadCount > 0 ? "unread" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(conversation)}
      aria-pressed={active}
      aria-label={`Open conversation with ${conversation.patient.name}`}
    >
      <span
        className="wa-avatar"
        aria-hidden="true"
      >
        {initialsOf(conversation.patient.name)}
      </span>

      <span className="wa-conversation-item-body">
        <span className="wa-conversation-item-top">
          <strong>{conversation.patient.name}</strong>
          <span className="wa-conversation-time">
            {formatConversationListTime(conversation.lastMessageAt)}
          </span>
        </span>

        <span className="wa-conversation-item-bottom">
          <span className="wa-conversation-preview">
            {lastMessageText}
          </span>

          {conversation.unreadCount > 0 && (
            <span
              className="wa-unread-badge"
              aria-label={`${conversation.unreadCount} unread messages`}
            >
              {conversation.unreadCount}
            </span>
          )}
        </span>

        <span className="wa-conversation-item-meta">
          {conversation.status === "resolved" && (
            <span className="wa-mini-status resolved">Resolved</span>
          )}

          {assignee ? (
            <span className="wa-mini-assignee">
              → {assignee.name.split(" ")[0]}
            </span>
          ) : (
            <span className="wa-mini-assignee unassigned">
              Unassigned
            </span>
          )}
          {conversation.context?.department && (
            <span className="wa-mini-department">
              {conversation.context.department}
            </span>
          )}
        </span>
      </span>
    </button>
  );
};

const ConversationList = ({
  conversations,
  filters,
  activeFilter,
  onFilterChange,
  search,
  onSearchChange,
  activeId,
  staffById,
  currentUserId,
  onSelect,
  onClearFilters,
}) => {
  const counts = {
    all: conversations.length,
    unread: conversations.filter((c) => c.unreadCount > 0).length,
    assignedToMe: conversations.filter(
      (c) => c.assignedTo === currentUserId
    ).length,
    unassigned: conversations.filter((c) => !c.assignedTo).length,
    resolved: conversations.filter((c) => c.status === "resolved").length,
  };

  const showEmpty = conversations.length === 0;
  const searching = search.trim().length > 0;

  return (
    <aside className="wa-list-panel" aria-label="Conversation list">
      <div className="wa-list-header">
        <div className="wa-filter-chips" role="group" aria-label="Conversation filters">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={[
                "wa-filter-chip",
                activeFilter === filter.key ? "active" : "",
              ].join(" ")}
              onClick={() => onFilterChange(filter.key)}
              aria-pressed={activeFilter === filter.key}
            >
              {filter.label}
              {counts[filter.key] > 0 && (
                <span className="wa-filter-count">{counts[filter.key]}</span>
              )}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="wa-list-search"
          placeholder="Search conversations..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label="Search conversations"
        />

        {(activeFilter !== "all" || searching) && (
          <button
            type="button"
            className="wa-clear-filters"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="wa-conversation-list">
        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeId}
            staffById={staffById}
            onSelect={onSelect}
          />
        ))}

        {showEmpty && (
          <div className="wa-empty-block">
            <p>
              {searching
                ? "No conversations match your search."
                : activeFilter === "unread"
                  ? "No unread conversations."
                  : activeFilter === "assignedToMe"
                    ? "No conversations are assigned to you."
                    : activeFilter === "unassigned"
                      ? "No unassigned conversations."
                      : activeFilter === "resolved"
                        ? "No resolved conversations."
                        : "No conversations yet."}
            </p>
            {searching && (
              <button
                type="button"
                className="secondary-action"
                onClick={onClearFilters}
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default ConversationList;