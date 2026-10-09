# MediOS Frontend

Scaffolded folder structure for the MediOS frontend (Staff Console + Patient
Portal), mapped 1:1 to the product modules in the Requirements & Scope doc:
Patient CRM, Scheduling, WhatsApp Automation, Billing & GST, Attendance,
ABDM, Insurance/TPA Claims, Department Screens (OPD/IPD/Emergency/
Pharmacy/Diagnostics/Surgery), Clinical Records, Follow-up & Engagement,
Reports & Analytics, Patient Portal, and Security/Access Control.

Implemented screens include patient management, scheduling, billing and WhatsApp.
Many other modules remain scaffolds. WhatsApp has a local demo and an optional API inbox;
live Meta messaging and database deployment remain unverified.

## Getting started

```
npm install
npm run dev
```

Run these commands from `frontend/`. From the repository root, `npm run dev`
also forwards here. Frontend environment files belong in this folder; copy
`.env.example` to `.env.local` and set `VITE_WHATSAPP_MODE=api` to use the backend inbox.
