import { useAuth } from "../../../context/AuthContext";

// WhatsApp module ability helpers.
//
// Built directly on the existing MediOS permission model (AuthContext
// `user.permissions` + `role`). Every whatsapp permission string used below
// is a regular entry in `user.permissions`, so the standard `can()` behaviour
// applies. A role-based default is supplied for staff accounts that do not
// carry explicit whatsapp permissions yet.

const ROLE_ABILITIES = {
  owner: {
    viewInbox: true,
    reply: true,
    assign: true,
    resolve: true,
    manageTemplates: true,
    sendBroadcast: true,
    viewBroadcastHistory: true,
  },
  admin: {
    viewInbox: true,
    reply: true,
    assign: true,
    resolve: true,
    manageTemplates: true,
    sendBroadcast: true,
    viewBroadcastHistory: true,
  },
  manager: {
    viewInbox: true,
    reply: true,
    assign: true,
    resolve: true,
    manageTemplates: false,
    sendBroadcast: true,
    viewBroadcastHistory: true,
  },
  receptionist: {
    viewInbox: true,
    reply: true,
    assign: true,
    resolve: true,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: true,
  },
  doctor: {
    viewInbox: true,
    reply: true,
    assign: true,
    resolve: true,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: true,
  },
  nurse: {
    viewInbox: true,
    reply: true,
    assign: false,
    resolve: false,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: false,
  },
  billingstaff: {
    viewInbox: true,
    reply: true,
    assign: false,
    resolve: false,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: false,
  },
  pharmacystaff: {
    viewInbox: true,
    reply: true,
    assign: false,
    resolve: false,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: false,
  },
  labstaff: {
    viewInbox: true,
    reply: true,
    assign: false,
    resolve: false,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: false,
  },
  staff: {
    viewInbox: true,
    reply: true,
    assign: false,
    resolve: false,
    manageTemplates: false,
    sendBroadcast: false,
    viewBroadcastHistory: true,
  },
};

// Explicit whatsapp.permission -> ability mapping.
const EXPLICIT_PERMISSION_MAP = {
  "whatsapp.inbox.view": "viewInbox",
  "whatsapp.inbox.reply": "reply",
  "whatsapp.inbox.assign": "assign",
  "whatsapp.inbox.resolve": "resolve",
  "whatsapp.templates.manage": "manageTemplates",
  "whatsapp.broadcasts.view": "viewBroadcastHistory",
  "whatsapp.broadcasts.send": "sendBroadcast",
};

export function getWhatsappAbilities(user) {
  const role = user?.role || "staff";
  const base = ROLE_ABILITIES[role] || ROLE_ABILITIES.staff;
  const explicitPermissions = user?.permissions || [];

  const abilities = { ...base };

  Object.keys(EXPLICIT_PERMISSION_MAP).forEach((permission) => {
    if (explicitPermissions.includes(permission)) {
      abilities[EXPLICIT_PERMISSION_MAP[permission]] = true;
    }
  });

  return abilities;
}

export function useWhatsappAbilities() {
  const { user } = useAuth();

  return getWhatsappAbilities(user);
}