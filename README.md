# HIT Organization: Academic Project Management System

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo_SDK_57-000020?style=for-the-badge&logo=expo&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white)
![Google Cloud Run](https://img.shields.io/badge/Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

A bilingual (Hebrew/English) platform that runs the whole academic project and thesis lifecycle at HIT: project discovery and applications, supervision, milestones and grading, committees and defense exams, and the staff approval chains around them. It ships as a web app, an iOS/Android app and a shared API server.

---

## 🗂 Repository Layout

| Folder | What it is | Stack |
|---|---|---|
| `web/` | Web app for every role | Next.js 16, React 19, Tailwind |
| `mobile/` | iOS and Android app | Expo SDK 57, Expo Router, React Native |
| `server/` | REST API used by both clients | Express 5, TypeScript, Firebase Admin |
| `firebase.json`, `mobile/firestore.rules` | Firestore security rules and indexes | Firebase |

Data lives in **Firestore**, sign-in uses **Firebase Authentication** (email/password, Google and Apple), and files go to **Cloudinary**. The web app and API deploy to **Google Cloud Run** automatically on every push through Cloud Build.

---

## 👥 Roles

Each user can hold several roles at once, and every screen and API call is scoped to the user's faculty, major and degree:

- **Student**: browses projects, applies, submits milestones, sees grades and the defense details
- **Supervisor / Secondary supervisor**: publishes projects, reviews applications, grades milestones
- **Coordinator / Administrative coordinator**: runs the faculty's projects, tracks, committees and defenses
- **Internal examiner / External examiner**: grades defenses (external examiners sign in with a one-time emailed code)
- **Division head, Program head, Dean, Faculty admin, Grad school head, School head**: approval chains and dashboards
- **System admin**: users, permissions, templates, system settings

Faculties: Sciences, Electrical Engineering, Industrial Engineering, Learning Technologies, Medical Technologies, Design, Data Science.

---

## 🚀 Key Features

### 🌍 Bilingual, right-to-left
Every screen, email and notification exists in Hebrew and English, with full RTL layout.

### 📊 Project lifecycle
- Project discovery with faculty, degree and track filters, plus prerequisite checks (courses, grade average, credit points)
- Applications with CV and transcript upload, meeting requests and acceptance. Accepting one application closes the student's other pending ones automatically
- Thesis vs. project track assignment for master's students (year 1 or year 2)
- Configurable workflow templates per faculty: milestones, approval routing, examiner flow and final grade
- Grade history, mandatory-reason grade updates, and a view-only final report link once the defense grade is approved

### 🎓 Committees and defenses
- Examiners submit candidate dates and the system matches them, instead of the coordinator picking one
- Conflict-of-interest hold and per-milestone committee changes (CS pilot)
- Parallel sign-offs and multi-stage staff approval chains (e.g. Electrical research proposals: supervisor → coordinator → division head → program head → dean)

### 🔔 Notifications
In-app, push (Expo), email (Brevo) and SMS, with per-tab unread badges. A WhatsApp channel is built but not switched on yet.

### 📈 Reports and exports
- Project-first reports: pick projects, pick a report type, preview, export to Excel
- Students Report with milestone status, median grade and specialization columns
- Excel import/export of users, the approved-students roster and project records

### 🛠 Administration
- Per-user permission grants and coordinator scopes
- Merge two accounts that belong to the same person, keeping the email the admin chooses
- Archive and restore projects, reassign supervisors before deleting an account
- Maintenance mode, academic calendar, student statuses, force-update screen for old mobile builds

---

## 🆕 Latest Updates (October 2026)

### 📹 Zoom defense meetings (in development, not live yet)
Defenses can now be **in person**, **Zoom** or **hybrid**. One shared logistics form for coordinators, administrative coordinators and system admins sets the format, time, building/room and length.
- When the server has Zoom credentials, saving the defense **creates the Zoom meeting automatically** through Zoom's API, and updates or deletes it when the defense changes
- Without credentials, staff paste a meeting link by hand, so nothing breaks before Zoom is set up
- Meetings are created with a waiting room, passcode, mute on entry and no joining before the host
- Students, examiners and the defense-access page show the format and the join link. Defense emails include the link
- **Before go-live:** a licensed Zoom account (an institutional HIT licence or one Zoom Pro seat), the credentials stored in Secret Manager, and a privacy-policy update naming Zoom

Server configuration (`server/src/services/zoomService.ts`, Zoom Server-to-Server OAuth app):

```bash
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_HOST_USER=defenses@example.com   # optional, the licensed account that hosts every meeting
```

### 🔐 Security round
- Two-factor authentication enforcement, which can be limited to chosen faculties and to staff, students or both. The server now checks that each session actually passed the 2FA code
- Signing out all other sessions when a password changes, and a 3-strikes login lockout with an alert and a temporary password
- Phone numbers and push tokens moved off the readable user profile
- Tighter upload checks, rate limits shared across server instances, and safe error text
- Final report links expire after 30 days, staff can revoke them, and the ID number is masked
- Firestore delete protection, daily backups kept for 14 weeks, and 7-day point-in-time recovery
- Signup requires a verified email and a name that matches the approved-students roster

### ✨ Other recent features
- Account merge for system admins
- Excel export of project records, with faculty and date-range filters
- Master's students can apply in year 1 or year 2
- Coordinators can edit a student's completed courses from the student page
- Electrical Engineering specialization chosen at signup
- Messaging selected students from the Students Report over all channels
- Over-the-air mobile updates (EAS Update), active from the next store build

---

## 📦 Getting Started

```bash
git clone https://github.com/novikon20316/hit-organization.git
cd hit-organization
```

**API server**
```bash
cd server
npm install
npm run dev
```
Needs a Firebase service account: `serviceAccountKey.json` in `server/` for local development (git-ignored), or the attached service identity on Cloud Run.

**Web app**
```bash
cd web
npm install
npm run dev
```

**Mobile app**
```bash
cd mobile
npm install
npm start
```

Each client reads its Firebase config and API URL from its own environment file.

---

## 🛡 Security

- Firestore security rules limit each user to their own data and faculty scope. Sensitive writes go through the API, not the client
- Role checks consider every role a user holds, not just the primary one
- App Check is enforced on the web, and in monitoring mode on the server
- Every privileged action is written to an audit log
- Full Hebrew security overview: [SECURITY_OVERVIEW_HE.md](SECURITY_OVERVIEW_HE.md)

---

## 🤝 Contributing
**Dor Novik (דור נוביק)**, Lead Developer, M.Sc. Computer Science student at HIT
