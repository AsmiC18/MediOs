// WhatsApp service abstraction.
//
// UI  ->  whatsappService (this file)  ->  backend / WhatsApp Business API
//
// The backend is not available yet, so every method is backed by realistic
// in-memory mock data persisted to localStorage (same strategy the rest of
// the app uses). Swap the bodies of these methods with real API calls later
// without touching any component.

import {
  CONVERSATIONS,
  INITIAL_BROADCASTS,
  PATIENT_POOL,
  QUICK_REPLIES,
  STAFF,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  BROADCAST_SEGMENTS,
} from "./whatsappMockData";

const STORAGE_KEY = "medios_whatsapp_state_v1";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clone = (value) =>
  value === undefined || value === null
    ? value
    : JSON.parse(JSON.stringify(value));

const pickSegmentPatients = (segmentId, customIds = []) => {
  if (segmentId === "custom") {
    return PATIENT_POOL.filter((patient) =>
      customIds.includes(patient.id)
    );
  }

  if (segmentId === "todays-appointments") {
    return PATIENT_POOL.filter((patient) => patient.todayAppointment);
  }

  if (segmentId === "upcoming-appointments") {
    return PATIENT_POOL.filter((patient) => patient.upcomingAppointment);
  }

  if (segmentId === "follow-up-due") {
    return PATIENT_POOL.filter((patient) => patient.followUpDue);
  }

  if (segmentId === "pending-reports") {
    return PATIENT_POOL.filter((patient) => patient.reportPending);
  }

  return PATIENT_POOL;
};

const getPersisted = (key, fallback) => {
  try {
    const stored = localStorage.getItem(key);

    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    // corrupted storage -> fall back to seed data
  }

  return fallback;
};

const persist = (path, value) => {
  try {
    localStorage.setItem(path, JSON.stringify(value));
  } catch (error) {
    // storage unavailable -> keep working from in-memory state
  }
};

let state = {
  conversations: getPersisted("medios_whatsapp_conversations", CONVERSATIONS),
  templates: getPersisted("medios_whatsapp_templates_v2", TEMPLATES),
  broadcasts: getPersisted("medios_whatsapp_broadcasts", INITIAL_BROADCASTS),
};

const saveConversations = () =>
  persist("medios_whatsapp_conversations", state.conversations);

const saveTemplates = () =>
  persist("medios_whatsapp_templates_v2", state.templates);

const saveBroadcasts = () =>
  persist("medios_whatsapp_broadcasts", state.broadcasts);

const whatsappService = {
  getStaff: async () => {
    await delay(120);
    return clone(STAFF);
  },

  getQuickReplies: async () => {
    await delay(100);
    return clone(QUICK_REPLIES);
  },

  getConversations: async () => {
    await delay(280);
    return clone(state.conversations);
  },

  getConversation: async (id) => {
    await delay(160);
    const conversation = state.conversations.find((c) => c.id === id);
    return clone(conversation || null);
  },

  sendMessage: async (conversationId, text) => {
    await delay(300);

    const conversation = state.conversations.find(
      (c) => c.id === conversationId
    );

    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const message = {
      id: `M-${Date.now()}`,
      outgoing: true,
      text,
      at: new Date().toISOString(),
      status: "sent",
    };

    conversation.messages.push(message);
    conversation.unreadCount = 0;
    conversation.lastMessageAt = message.at;
    conversation.status = "open";

    saveConversations();

    return clone(message);
  },

  markAsRead: async (conversationId) => {
    await delay(120);

    const conversation = state.conversations.find(
      (c) => c.id === conversationId
    );

    if (!conversation) {
      return null;
    }

    conversation.unreadCount = 0;
    saveConversations();

    return clone(conversation);
  },

  markAsUnread: async (conversationId) => {
    await delay(120);

    const conversation = state.conversations.find(
      (c) => c.id === conversationId
    );

    if (!conversation) {
      return null;
    }

    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    saveConversations();

    return clone(conversation);
  },

  assignConversation: async (conversationId, staffId) => {
    await delay(150);

    const conversation = state.conversations.find(
      (c) => c.id === conversationId
    );

    if (!conversation) {
      return null;
    }

    conversation.assignedTo = staffId;
    saveConversations();

    return clone(conversation);
  },

  resolveConversation: async (conversationId) => {
    await delay(150);

    const conversation = state.conversations.find(
      (c) => c.id === conversationId
    );

    if (!conversation) {
      return null;
    }

    conversation.status = "resolved";
    conversation.unreadCount = 0;
    saveConversations();

    return clone(conversation);
  },

  reopenConversation: async (conversationId) => {
    await delay(150);

    const conversation = state.conversations.find(
      (c) => c.id === conversationId
    );

    if (!conversation) {
      return null;
    }

    conversation.status = "open";
    saveConversations();

    return clone(conversation);
  },

  getTemplates: async () => {
    await delay(260);
    return clone(state.templates);
  },

  getTemplateMeta: async () => {
    await delay(80);
    return {
      categories: clone(TEMPLATE_CATEGORIES),
      statuses: ["Approved", "Draft", "Suspended"],
    };
  },

  createTemplate: async (payload) => {
    await delay(300);

    const template = {
      id: `T-${Date.now()}`,
      language: "en",
      status: payload.status || "Draft",
      createdBy: payload.createdBy || "Staff",
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      ...payload,
    };

    state.templates = [template, ...state.templates];
    saveTemplates();

    return clone(template);
  },

  updateTemplate: async (templateId, payload) => {
    await delay(280);

    const index = state.templates.findIndex((t) => t.id === templateId);

    if (index === -1) {
      throw new Error("Template not found.");
    }

    const updated = {
      ...state.templates[index],
      ...payload,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    state.templates[index] = updated;
    saveTemplates();

    return clone(updated);
  },

  deleteTemplate: async (templateId) => {
    await delay(220);
    state.templates = state.templates.filter((t) => t.id !== templateId);
    saveTemplates();
    return true;
  },

  duplicateTemplate: async (templateId) => {
    await delay(300);

    const source = state.templates.find((t) => t.id === templateId);

    if (!source) {
      throw new Error("Template not found.");
    }

    const baseName = `${source.name} (Copy)`;
    let name = baseName;
    let suffix = 2;

    while (state.templates.some((t) => t.name === name)) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }

    const duplicate = {
      ...clone(source),
      id: `T-${Date.now()}`,
      name,
      status: "Draft",
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    state.templates = [duplicate, ...state.templates];
    saveTemplates();

    return clone(duplicate);
  },

  getSegments: async () => {
    await delay(140);
    return clone(BROADCAST_SEGMENTS);
  },

  getSegmentCount: async (segmentId) => {
    await delay(120);
    return pickSegmentPatients(segmentId).length;
  },

  getSegmentPatients: async (segmentId, customIds = []) => {
    await delay(180);
    return clone(pickSegmentPatients(segmentId, customIds));
  },

  getBroadcasts: async () => {
    await delay(240);
    return clone(state.broadcasts);
  },

  getBroadcast: async (broadcastId) => {
    await delay(140);
    const broadcast = state.broadcasts.find((b) => b.id === broadcastId);
    return clone(broadcast || null);
  },

  createBroadcast: async (payload) => {
    await delay(260);

    const broadcast = {
      id: `BR-2026-${String(state.broadcasts.length + 1).padStart(3, "0")}`,
      name: payload.name || "Untitled Broadcast",
      message: payload.message,
      segment: payload.segmentId,
      segmentLabel: payload.segmentLabel,
      recipientCount: payload.recipientCount,
      sentCount: 0,
      failedCount: 0,
      status: "sending",
      createdBy: payload.createdBy || "Staff",
      sentAt: null,
    };

    state.broadcasts = [broadcast, ...state.broadcasts];
    saveBroadcasts();

    return clone(broadcast);
  },

  finalizeBroadcast: async (broadcastId, outcome) => {
    await delay(150);

    const broadcast = state.broadcasts.find((b) => b.id === broadcastId);

    if (!broadcast) {
      return null;
    }

    broadcast.status = outcome.status;
    broadcast.sentCount = outcome.sentCount;
    broadcast.failedCount = outcome.failedCount;
    broadcast.sentAt = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    saveBroadcasts();

    return clone(broadcast);
  },
};

export default whatsappService;