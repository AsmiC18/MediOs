import React, { useEffect, useRef, useState } from "react";

const ConversationActionsMenu = ({
  conversation,
  canAssign,
  canResolve,
  onToggleRead,
  onToggleResolve,
  onViewPatient,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const isUnread = conversation.unreadCount > 0;
  const isResolved = conversation.status === "resolved";
  const canShowAssign = canAssign;
  const canShowResolve = canResolve;

  return (
    <div className="wa-menu-container" ref={menuRef}>
      <button
        type="button"
        className="wa-more-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Conversation actions"
      >
        ⋯
      </button>

      {open && (
        <div className="wa-menu-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleRead();
              setOpen(false);
            }}
          >
            {isUnread ? "Mark as read" : "Mark as unread"}
          </button>

          {canShowResolve && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleResolve();
                setOpen(false);
              }}
            >
              {isResolved
                ? "Reopen conversation"
                : "Resolve conversation"}
            </button>
          )}

          {canShowAssign && (
            <span className="wa-menu-hint">
              Hand over via the "Assigned to" selector in the header.
            </span>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onViewPatient();
              setOpen(false);
            }}
          >
            View patient profile
          </button>
        </div>
      )}
    </div>
  );
};

export default ConversationActionsMenu;