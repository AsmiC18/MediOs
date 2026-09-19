// WhatsApp module mock data.
//
// Isolated so it can later be replaced by real API responses without touching
// any component. Timestamps are generated relative to "now" so the inbox
// always feels live.

const now = Date.now();

const minsAgo = (n) => new Date(now - n * 60000).toISOString();
const hrsAgo = (n) => minsAgo(n * 60);
const daysAgo = (n) => minsAgo(n * 60 * 24);

export const STAFF = [
  { id: "U001", name: "Dr. Arun Kumar", initials: "AK", role: "Doctor" },
  { id: "U002", name: "Priya Verma", initials: "PV", role: "Receptionist" },
  { id: "U003", name: "Rajesh Iyer", initials: "RI", role: "Manager" },
  { id: "U004", name: "Dr. Neha Gupta", initials: "NG", role: "Doctor" },
  { id: "U005", name: "Kavya Rangan", initials: "KR", role: "Billing" },
  { id: "U006", name: "Suresh Nair", initials: "SN", role: "Lab" },
];

export const DOCTORS = [
  "Dr. Kavita Mehta",
  "Dr. Arjun Nair",
  "Dr. Sunita Rao",
  "Dr. Rahul Bose",
  "Dr. Meera Shah",
  "Dr. Anand Krishnan",
];

export const QUICK_REPLIES = [
  {
    id: "QR1",
    label: "Appointment confirmed",
    body:
      "Your appointment is confirmed. We look forward to seeing you at " +
      "{{hospital_name}}.",
  },
  {
    id: "QR2",
    label: "Appointment scheduled",
    body:
      "Your appointment is scheduled for {{appointment_date}} at " +
      "{{appointment_time}} with {{doctor_name}} ({{department}}).",
  },
  {
    id: "QR3",
    label: "Bring reports",
    body:
      "Please bring your previous medical reports and prescriptions to your " +
      "next visit.",
  },
  {
    id: "QR4",
    label: "Report ready",
    body:
      "Your lab report is ready. Download it here: {{report_link}}",
  },
  {
    id: "QR5",
    label: "Contact reception",
    body:
      "Please contact our reception for further assistance. We are happy to help.",
  },
  {
    id: "QR6",
    label: "Medication reminder",
    body:
      "Gentle reminder to take your prescribed medication on time. If you " +
      "have any side effects, please contact us immediately.",
  },
  {
    id: "QR7",
    label: "Follow-up enquiry",
    body:
      "We wanted to check on your recovery. Please reply if you are feeling " +
      "unwell or have any concerns.",
  },
  {
    id: "QR8",
    label: "Reschedule request",
    body:
      "We can help you reschedule. Kindly share 2 convenient slots and our " +
      "front desk will confirm shortly.",
  },
];

const p1 = {
  id: "P0101",
  name: "Rahul Sharma",
  phone: "+91 98470 22331",
  age: 42,
  gender: "Male",
  allergies: "Penicillin",
  lastVisit: "12 Sep 2026",
};
const p2 = {
  id: "P0102",
  name: "Priya Mehta",
  phone: "+91 98470 22332",
  age: 35,
  gender: "Female",
  allergies: "None",
  lastVisit: "28 Aug 2026",
};
const p3 = {
  id: "P0103",
  name: "Ananya Kulkarni",
  phone: "+91 98470 22333",
  age: 29,
  gender: "Female",
  allergies: "Sulfa drugs",
  lastVisit: "05 Sep 2026",
};
const p4 = {
  id: "P0104",
  name: "Rohan Deshmukh",
  phone: "+91 98470 22334",
  age: 51,
  gender: "Male",
  allergies: "None",
  lastVisit: "02 Sep 2026",
};
const p5 = {
  id: "P0105",
  name: "Kavita Joshi",
  phone: "+91 98470 22335",
  age: 47,
  gender: "Female",
  allergies: "None",
  lastVisit: "15 Sep 2026",
};
const p6 = {
  id: "P0106",
  name: "Amit Patil",
  phone: "+91 98470 22336",
  age: 33,
  gender: "Male",
  allergies: "Aspirin",
  lastVisit: "09 Sep 2026",
};
const p7 = {
  id: "P0107",
  name: "Sneha Reddy",
  phone: "+91 98470 22337",
  age: 26,
  gender: "Female",
  allergies: "None",
  lastVisit: "21 Aug 2026",
};
const p8 = {
  id: "P0108",
  name: "Vikram Singh",
  phone: "+91 98470 22338",
  age: 58,
  gender: "Male",
  allergies: "None",
  lastVisit: "17 Sep 2026",
};
const p9 = {
  id: "P0109",
  name: "Meera Nair",
  phone: "+91 98470 22339",
  age: 39,
  gender: "Female",
  allergies: "Latex",
  lastVisit: "11 Sep 2026",
};
const p10 = {
  id: "P0110",
  name: "Sanjay Gupta",
  phone: "+91 98470 22340",
  age: 44,
  gender: "Male",
  allergies: "None",
  lastVisit: "10 Sep 2026",
};

// Broadcast audience pool (patients reachable via WhatsApp). Conversations
// below reference a subset of these patients; segments are computed from this
// pool so recipient counts behave realistically.
export const PATIENT_POOL = [
  { ...p1, todayAppointment: true, upcomingAppointment: true, followUpDue: false, reportPending: false },
  { ...p2, todayAppointment: false, upcomingAppointment: true, followUpDue: false, reportPending: true },
  { ...p3, todayAppointment: true, upcomingAppointment: true, followUpDue: false, reportPending: false },
  { ...p4, todayAppointment: false, upcomingAppointment: false, followUpDue: true, reportPending: false },
  { ...p5, todayAppointment: true, upcomingAppointment: false, followUpDue: false, reportPending: false },
  { ...p6, todayAppointment: false, upcomingAppointment: true, followUpDue: true, reportPending: false },
  { ...p7, todayAppointment: true, upcomingAppointment: false, followUpDue: false, reportPending: false },
  { ...p8, todayAppointment: false, upcomingAppointment: true, followUpDue: false, reportPending: true },
  { ...p9, todayAppointment: false, upcomingAppointment: true, followUpDue: false, reportPending: false },
  { ...p10, todayAppointment: false, upcomingAppointment: false, followUpDue: true, reportPending: true },
  {
    id: "P0111",
    name: "Deepa Iyer",
    phone: "+91 98470 22341",
    age: 31,
    gender: "Female",
    allergies: "None",
    lastVisit: "25 Aug 2026",
    todayAppointment: false,
    upcomingAppointment: true,
    followUpDue: false,
    reportPending: false,
  },
  {
    id: "P0112",
    name: "Karthik Menon",
    phone: "+91 98470 22342",
    age: 38,
    gender: "Male",
    allergies: "None",
    lastVisit: "01 Sep 2026",
    todayAppointment: true,
    upcomingAppointment: false,
    followUpDue: false,
    reportPending: false,
  },
  {
    id: "P0113",
    name: "Shalini Rao",
    phone: "+91 98470 22343",
    age: 55,
    gender: "Female",
    allergies: "Insulin",
    lastVisit: "20 Aug 2026",
    todayAppointment: false,
    upcomingAppointment: false,
    followUpDue: true,
    reportPending: false,
  },
  {
    id: "P0114",
    name: "Manoj Pillai",
    phone: "+91 98470 22344",
    age: 61,
    gender: "Male",
    allergies: "None",
    lastVisit: "18 Sep 2026",
    todayAppointment: false,
    upcomingAppointment: true,
    followUpDue: false,
    reportPending: false,
  },
  {
    id: "P0115",
    name: "Divya Krishnan",
    phone: "+91 98470 22345",
    age: 24,
    gender: "Female",
    allergies: "None",
    lastVisit: "06 Sep 2026",
    todayAppointment: false,
    upcomingAppointment: false,
    followUpDue: true,
    reportPending: false,
  },
  {
    id: "P0116",
    name: "Rakesh Malhotra",
    phone: "+91 98470 22346",
    age: 49,
    gender: "Male",
    allergies: "Sulfa drugs",
    lastVisit: "30 Aug 2026",
    todayAppointment: false,
    upcomingAppointment: false,
    followUpDue: false,
    reportPending: true,
  },
  {
    id: "P0117",
    name: "Nandini Prasad",
    phone: "+91 98470 22347",
    age: 34,
    gender: "Female",
    allergies: "None",
    lastVisit: "13 Sep 2026",
    todayAppointment: false,
    upcomingAppointment: true,
    followUpDue: false,
    reportPending: false,
  },
  {
    id: "P0118",
    name: "Arvind Shetty",
    phone: "+91 98470 22348",
    age: 57,
    gender: "Male",
    allergies: "None",
    lastVisit: "24 Aug 2026",
    todayAppointment: false,
    upcomingAppointment: false,
    followUpDue: true,
    reportPending: true,
  },
  {
    id: "P0119",
    name: "Asha Kapoor",
    phone: "+91 98470 22349",
    age: 41,
    gender: "Female",
    allergies: "Penicillin",
    lastVisit: "04 Sep 2026",
    todayAppointment: false,
    upcomingAppointment: false,
    followUpDue: false,
    reportPending: true,
  },
  {
    id: "P0120",
    name: "Farhan Ali",
    phone: "+91 98470 22350",
    age: 36,
    gender: "Male",
    allergies: "None",
    lastVisit: "14 Sep 2026",
    todayAppointment: false,
    upcomingAppointment: true,
    followUpDue: false,
    reportPending: false,
  },
];

export const CONVERSATIONS = [
  {
    id: "WA-1001",
    patient: p1,
    context: {
      department: "Cardiology",
      doctor: "Dr. Kavita Mehta",
      appointment: {
        date: "19 Sep 2026",
        time: "4:30 PM",
        status: "Upcoming",
      },
    },
    status: "open",
    assignedTo: "U001",
    unreadCount: 2,
    lastMessageAt: minsAgo(8),
    messages: [
      {
        id: "M-1001-a",
        outgoing: false,
        text: "Namaste, I completed the ECG you asked for. Should I come today?",
        at: hrsAgo(3),
      },
      {
        id: "M-1001-b",
        outgoing: true,
        text: "Thank you Rahul. Yes, please carry the ECG report and your BP journal.",
        at: hrsAgo(2),
      },
      {
        id: "M-1001-c",
        outgoing: false,
        text: "Okay doctor. Also my wife asked if she can attend the consultation?",
        at: minsAgo(20),
      },
      {
        id: "M-1001-d",
        outgoing: false,
        text: "She has a few questions about my diet plan.",
        at: minsAgo(18),
      },
    ],
  },
  {
    id: "WA-1002",
    patient: p2,
    context: {
      department: "General Medicine",
      doctor: "Dr. Rahul Bose",
      appointment: {
        date: "21 Sep 2026",
        time: "10:00 AM",
        status: "Upcoming",
      },
      pendingReport: "Blood Panel",
    },
    status: "open",
    assignedTo: "U004",
    unreadCount: 1,
    lastMessageAt: minsAgo(45),
    messages: [
      {
        id: "M-1002-a",
        outgoing: false,
        text: "Hi, I had a blood test on Monday. I haven't received the report yet.",
        at: hrsAgo(5),
      },
      {
        id: "M-1002-b",
        outgoing: true,
        text: "Let me check with the lab and share it shortly, Priya.",
        at: hrsAgo(4),
      },
      {
        id: "M-1002-c",
        outgoing: false,
        text: "Thank you. Also, should I continue the iron supplement?",
        at: minsAgo(45),
      },
    ],
  },
  {
    id: "WA-1003",
    patient: p3,
    context: {
      department: "Dermatology",
      doctor: "Dr. Anand Krishnan",
      appointment: {
        date: "22 Sep 2026",
        time: "12:30 PM",
        status: "Upcoming",
      },
    },
    status: "open",
    assignedTo: "U002",
    unreadCount: 0,
    lastMessageAt: hrsAgo(2),
    messages: [
      {
        id: "M-1003-a",
        outgoing: false,
        text: "Hello, I need a refill for my skin medication. Can the pharmacy deliver?",
        at: hrsAgo(3),
      },
      {
        id: "M-1003-b",
        outgoing: true,
        text: "Hi Ananya, yes. We will arrange pharmacy delivery today by 6 PM.",
        at: hrsAgo(2),
      },
    ],
  },
  {
    id: "WA-1004",
    patient: p4,
    context: {
      department: "Endocrinology",
      doctor: "Dr. Kavita Mehta",
      appointment: {
        date: "12 Sep 2026",
        time: "9:30 AM",
        status: "Completed",
      },
      followUpDate: "10 Oct 2026",
    },
    status: "resolved",
    assignedTo: "U001",
    unreadCount: 0,
    lastMessageAt: daysAgo(2),
    messages: [
      {
        id: "M-1004-a",
        outgoing: true,
        text: "Dear Rohan, please share your fasting sugar readings for this week.",
        at: daysAgo(3),
      },
      {
        id: "M-1004-b",
        outgoing: false,
        text: "Morning values are between 118-132. I have noted them in my book.",
        at: daysAgo(3),
      },
      {
        id: "M-1004-c",
        outgoing: true,
        text: "Great control. We will see you on 10 Oct for your review.",
        at: daysAgo(2),
      },
    ],
  },
  {
    id: "WA-1005",
    patient: p5,
    context: {
      department: "Gynecology",
      doctor: "Dr. Sunita Rao",
      appointment: {
        date: "20 Sep 2026",
        time: "11:15 AM",
        status: "Upcoming",
      },
    },
    status: "open",
    assignedTo: "U002",
    unreadCount: 3,
    lastMessageAt: minsAgo(25),
    messages: [
      {
        id: "M-1005-a",
        outgoing: false,
        text: "Hello, can I move my appointment to the evening? Office work in the morning.",
        at: hrsAgo(6),
      },
      {
        id: "M-1005-b",
        outgoing: true,
        text: "Of course Kavita. The next available evening slot is 5:15 PM tomorrow.",
        at: hrsAgo(5),
      },
      {
        id: "M-1005-c",
        outgoing: false,
        text: "Yes, please book that.",
        at: hrsAgo(4),
      },
      {
        id: "M-1005-d",
        outgoing: true,
        text: "Done! Your appointment is rescheduled to 5:15 PM, 21 Sep, with Dr. Sunita Rao.",
        at: hrsAgo(4),
      },
      {
        id: "M-1005-e",
        outgoing: false,
        text: "Thank you. One more thing — do I need an ultrasound on an empty stomach?",
        at: minsAgo(25),
      },
    ],
  },
  {
    id: "WA-1006",
    patient: p6,
    context: {
      department: "Physiotherapy",
      doctor: "Dr. Arjun Nair",
      appointment: {
        date: "23 Sep 2026",
        time: "8:45 AM",
        status: "Upcoming",
      },
    },
    status: "open",
    assignedTo: null,
    unreadCount: 1,
    lastMessageAt: hrsAgo(7),
    messages: [
      {
        id: "M-1006-a",
        outgoing: false,
        text: "Hi, how many physio sessions will I need after the knee surgery review?",
        at: hrsAgo(8),
      },
      {
        id: "M-1006-b",
        outgoing: false,
        text: "Also please share the exercises list if possible.",
        at: hrsAgo(7),
      },
    ],
  },
  {
    id: "WA-1007",
    patient: p7,
    context: {
      department: "Pediatrics",
      doctor: "Dr. Meera Shah",
      appointment: {
        date: "21 Sep 2026",
        time: "3:00 PM",
        status: "Upcoming",
      },
      note: "Child vaccination - MMR booster",
    },
    status: "open",
    assignedTo: "U002",
    unreadCount: 0,
    lastMessageAt: hrsAgo(9),
    messages: [
      {
        id: "M-1007-a",
        outgoing: false,
        text: "Hello, my daughter is due for her MMR booster this month.",
        at: daysAgo(1),
      },
      {
        id: "M-1007-b",
        outgoing: true,
        text: "We have booked 3:00 PM on 21 Sep with Dr. Meera Shah for the MMR booster.",
        at: daysAgo(1),
      },
      {
        id: "M-1007-c",
        outgoing: false,
        text: "Perfect, thank you so much!",
        at: hrsAgo(9),
      },
    ],
  },
  {
    id: "WA-1008",
    patient: p8,
    context: {
      department: "Cardiology",
      doctor: "Dr. Kavita Mehta",
      appointment: {
        date: "17 Sep 2026",
        time: "6:30 PM",
        status: "Completed",
      },
      followUpDate: "01 Oct 2026",
    },
    status: "open",
    assignedTo: "U001",
    unreadCount: 0,
    lastMessageAt: hrsAgo(12),
    messages: [
      {
        id: "M-1008-a",
        outgoing: false,
        text: "My BP readings this week: 132/84, 128/80, 135/88, 130/82.",
        at: hrsAgo(13),
      },
      {
        id: "M-1008-b",
        outgoing: true,
        text: "Thank you Vikram. Consistent readings. Continue the current dosage.",
        at: hrsAgo(12),
      },
    ],
  },
  {
    id: "WA-1009",
    patient: p9,
    context: {
      department: "Billing",
      billing: "Outstanding amount ₹4,200",
    },
    status: "open",
    assignedTo: "U005",
    unreadCount: 1,
    lastMessageAt: minsAgo(60),
    messages: [
      {
        id: "M-1009-a",
        outgoing: false,
        text: "Hi, I have a question about my last bill. It seems higher than expected.",
        at: hrsAgo(2),
      },
      {
        id: "M-1009-b",
        outgoing: true,
        text: "We will send the detailed breakup. The GST and consumables are itemised.",
        at: hrsAgo(1),
      },
      {
        id: "M-1009-c",
        outgoing: false,
        text: "Okay, please share it.",
        at: minsAgo(60),
      },
    ],
  },
  {
    id: "WA-1010",
    patient: p10,
    context: {
      department: "General Medicine",
      doctor: "Dr. Rahul Bose",
      appointment: {
        date: "10 Sep 2026",
        time: "5:00 PM",
        status: "Completed",
      },
      pendingReport: "Lipid Profile",
    },
    status: "open",
    assignedTo: null,
    unreadCount: 2,
    lastMessageAt: hrsAgo(3),
    messages: [
      {
        id: "M-1010-a",
        outgoing: false,
        text: "Sir, when will my lipid profile report be ready?",
        at: hrsAgo(4),
      },
      {
        id: "M-1010-b",
        outgoing: false,
        text: "My follow-up visit is tomorrow and I want to carry it.",
        at: hrsAgo(3),
      },
    ],
  },
];

export const TEMPLATE_CATEGORIES = [
  "Appointment Confirmation",
  "Appointment Reminder",
  "Appointment Rescheduling",
  "Lab Report",
  "Prescription / Medication Reminder",
  "Follow-up",
  "Post-visit Message",
  "Patient Satisfaction",
  "General Communication",
];

export const TEMPLATES = [
  {
    id: "T-1001",
    name: "Appointment Confirmation",
    category: "Appointment Confirmation",
    language: "en",
    status: "Approved",
    createdBy: "Priya Verma",
    createdAt: "02 Sep 2026",
    updatedAt: "10 Sep 2026",
    body:
      "Hello {{patient_name}},\n\nYour appointment with {{doctor_name}} has " +
      "been confirmed for {{appointment_date}} at {{appointment_time}}.\n\n" +
      "Department: {{department}}\n\nThank you,\n{{hospital_name}}",
  },
  {
    id: "T-1002",
    name: "Appointment Reminder (24h)",
    category: "Appointment Reminder",
    language: "en",
    status: "Approved",
    createdBy: "Priya Verma",
    createdAt: "01 Sep 2026",
    updatedAt: "12 Sep 2026",
    body:
      "Hello {{patient_name}},\n\nThis is a friendly reminder for your " +
      "appointment with {{doctor_name}} on {{appointment_date}} at " +
      "{{appointment_time}}.\n\nPlease arrive 15 minutes early and carry " +
      "previous reports.\n\nThank you,\n{{hospital_name}}",
  },
  {
    id: "T-1003",
    name: "Appointment Reschedule Notice",
    category: "Appointment Rescheduling",
    language: "en",
    status: "Approved",
    createdBy: "Raiesh Iyer",
    createdAt: "28 Aug 2026",
    updatedAt: "08 Sep 2026",
    body:
      "Dear {{patient_name}},\n\nYour appointment has been rescheduled. " +
      "Your new slot is {{appointment_date}} at {{appointment_time}} with " +
      "{{doctor_name}}.\n\nSorry for any inconvenience.\n{{hospital_name}}",
  },
  {
    id: "T-1004",
    name: "Lab Report Ready",
    category: "Lab Report",
    language: "en",
    status: "Approved",
    createdBy: "Suresh Nair",
    createdAt: "25 Aug 2026",
    updatedAt: "06 Sep 2026",
    body:
      "Hello {{patient_name}},\n\nYour lab report is ready and has been " +
      "shared securely. You can view and download it here:\n{{report_link}}\n\n" +
      "For any questions, please contact our lab desk.\n{{hospital_name}}",
  },
  {
    id: "T-1005",
    name: "Medication Reminder",
    category: "Prescription / Medication Reminder",
    language: "en",
    status: "Draft",
    createdBy: "Dr. Arun Kumar",
    createdAt: "18 Sep 2026",
    updatedAt: "18 Sep 2026",
    body:
      "Hi {{patient_name}},\n\nGentle reminder to take your prescribed " +
      "medication as per the schedule given by {{doctor_name}}. If you " +
      "experience any side effects, please contact us right away.\n\n" +
      "Stay healthy,\n{{hospital_name}}",
  },
  {
    id: "T-1006",
    name: "Follow-up Check-in",
    category: "Follow-up",
    language: "en",
    status: "Approved",
    createdBy: "Dr. Arjun Nair",
    createdAt: "20 Aug 2026",
    updatedAt: "11 Sep 2026",
    body:
      "Hello {{patient_name}},\n\nWe hope you are recovering well after " +
      "your visit to {{department}}. Please reply to this message if you " +
      "have any concerns, or reply 1 if you are feeling better.\n\n" +
      "Warm regards,\n{{hospital_name}}",
  },
  {
    id: "T-1007",
    name: "After Visit Summary",
    category: "Post-visit Message",
    language: "en",
    status: "Approved",
    createdBy: "Priya Verma",
    createdAt: "15 Aug 2026",
    updatedAt: "02 Sep 2026",
    body:
      "Dear {{patient_name}},\n\nThank you for visiting {{hospital_name}} " +
      "on {{appointment_date}}. Your visit summary and prescriptions are " +
      "available in your account.\n\nPlease follow up with {{doctor_name}} " +
      "as advised.\n\n{{hospital_name}}",
  },
  {
    id: "T-1008",
    name: "Patient Satisfaction Survey",
    category: "Patient Satisfaction",
    language: "en",
    status: "Approved",
    createdBy: "Raiesh Iyer",
    createdAt: "10 Aug 2026",
    updatedAt: "20 Aug 2026",
    body:
      "Hello {{patient_name}},\n\nWe value your feedback. Please rate your " +
      "experience at {{hospital_name}} on a scale of 1 to 5 by replying to " +
      "this message.\n\nYour response helps us serve you better.",
  },
  {
    id: "T-1009",
    name: "General Season Greetings",
    category: "General Communication",
    language: "en",
    status: "Suspended",
    createdBy: "Raiesh Iyer",
    createdAt: "01 Aug 2026",
    updatedAt: "05 Sep 2026",
    body:
      "Hello {{patient_name}},\n\n{{hospital_name}} wishes you and your " +
      "family good health. For appointments and health queries, reply to " +
      "this message or call our helpline.",
  },
];

export const BROADCAST_SEGMENTS = [
  {
    id: "all-patients",
    label: "All Patients",
    description: "Every patient with a saved WhatsApp number.",
  },
  {
    id: "todays-appointments",
    label: "Today's Appointments",
    description: "Patients visiting today.",
  },
  {
    id: "upcoming-appointments",
    label: "Upcoming Appointments",
    description: "Patients with an appointment in the next 7 days.",
  },
  {
    id: "follow-up-due",
    label: "Follow-up Due",
    description: "Patients who are due for a follow-up visit.",
  },
  {
    id: "pending-reports",
    label: "Pending Reports",
    description: "Patients waiting for lab / diagnostic reports.",
  },
  {
    id: "custom",
    label: "Custom Selection",
    description: "Manually pick recipients from the patient list.",
  },
];

export const INITIAL_BROADCASTS = [
  {
    id: "BR-2026-004",
    name: "Appointment Reminder — 18 Sep",
    message:
      "Reminder: you have a visit at MediOS Hospital today. Please arrive " +
      "15 minutes early.",
    segment: "todays-appointments",
    segmentLabel: "Today's Appointments",
    recipientCount: 42,
    sentCount: 42,
    failedCount: 0,
    status: "sent",
    createdBy: "Priya Verma",
    sentAt: "18 Sep 2026, 8:05 AM",
  },
  {
    id: "BR-2026-003",
    name: "Flu Season Awareness",
    message:
      "Flu season is here. Book your vaccination slot at MediOS Hospital " +
      "by replying to this message.",
    segment: "all-patients",
    segmentLabel: "All Patients",
    recipientCount: 240,
    sentCount: 238,
    failedCount: 2,
    status: "sent",
    createdBy: "Raiesh Iyer",
    sentAt: "15 Sep 2026, 10:30 AM",
  },
  {
    id: "BR-2026-002",
    name: "Pending Reports Notice",
    message:
      "Your lab reports are ready. Download them using the link shared " +
      "earlier. Contact the lab desk for assistance.",
    segment: "pending-reports",
    segmentLabel: "Pending Reports",
    recipientCount: 18,
    sentCount: 17,
    failedCount: 1,
    status: "sent",
    createdBy: "Suresh Nair",
    sentAt: "12 Sep 2026, 4:20 PM",
  },
  {
    id: "BR-2026-001",
    name: "Follow-up Due Campaign",
    message:
      "You are due for a follow-up visit. Please reply to reschedule at " +
      "your convenience.",
    segment: "follow-up-due",
    segmentLabel: "Follow-up Due",
    recipientCount: 23,
    sentCount: 0,
    failedCount: 0,
    status: "draft",
    createdBy: "Dr. Arun Kumar",
    sentAt: null,
  },
];