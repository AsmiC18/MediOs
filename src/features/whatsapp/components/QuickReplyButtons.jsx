import React from "react";

const QuickReplyButtons = ({ quickReplies, onPick, disabled = false }) => {
  if (quickReplies.length === 0) {
    return null;
  }

  return (
    <div className="wa-quickreplies" aria-label="Quick replies">
      {quickReplies.map((reply) => (
        <button
          key={reply.id}
          type="button"
          className="wa-quickreply-chip"
          onClick={() => onPick(reply.body)}
          disabled={disabled}
          title={reply.body}
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
};

export default QuickReplyButtons;