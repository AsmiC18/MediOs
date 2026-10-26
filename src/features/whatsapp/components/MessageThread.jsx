import React, { useEffect, useRef } from "react";
import {
  formatMessageTime,
  formatThreadDayLabel,
} from "../utils/templateVariables";

const StatusDots = ({ status }) => {
  const label =
    status === "read"
      ? "Read"
      : status === "delivered"
        ? "Delivered"
        : status === "sending"
          ? "Sending"
          : status === "failed"
            ? "Failed to send"
            : "Sent";

  const className = status === "read" ? "read" : "";
  const failed = status === "failed" || status === "sending" ? status : "";

  return (
    <span
      className={`wa-delivery-status ${className} ${failed}`.trim()}
      role="img"
      aria-label={label}
      title={label}
    >
      {status === "sending" ? "…" : "✓✓"}
    </span>
  );
};

const MessageBubble = ({ message }) => {
  const incoming = !message.outgoing;

  return (
    <div
      className={[
        "wa-message-row",
        incoming ? "incoming" : "outgoing",
        message.status === "failed" ? "failed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="wa-message-bubble">
        <p>{message.text}</p>

        <span className="wa-message-meta">
          <span>{formatMessageTime(message.at)}</span>

          {!incoming && <StatusDots status={message.status} />}
        </span>
      </div>
    </div>
  );
};

const MessageThread = ({ conversation }) => {
  const bottomRef = useRef(null);

  const messages = conversation?.messages || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversation?.id]);

  if (!conversation) {
    return null;
  }

  const parts = [];
  let lastKey = null;

  messages.forEach((message) => {
    const key = formatThreadDayLabel(message.at);

    if (key !== lastKey) {
      parts.push(
        <div className="wa-date-separator" key={`sep-${key}`}>
          <span>{key}</span>
        </div>
      );
      lastKey = key;
    }

    parts.push(<MessageBubble key={message.id} message={message} />);
  });

  return (
    <div className="wa-thread" aria-live="polite">
      {parts}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageThread;