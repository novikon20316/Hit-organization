// lib/errorDiagnosis.ts
//
// Rule-based "what is this and how do I fix it for good" for the System
// Health detail window (components/ErrorReportDetailModal.tsx). Two parts:
//   - diagnose(): matches the error kind + message against known failure
//     patterns → plain-language meaning, likely causes, permanent fixes.
//   - signals(): reads the occurrence data (how many users, which pages,
//     timing vs the timeout, came back after being resolved, deploys) →
//     short facts that narrow down which of those causes it actually is.
// Deliberately static text, no AI call — it has to work during an outage.

export type Lang = 'he' | 'en';
type T = { he: string; en: string };

export interface Diagnosis {
  title: T;
  meaning: T;
  causes: T[];
  fixes: T[];
}

export interface DiagnosisInput {
  kind: 'client_crash' | 'api_timeout' | 'network_failure';
  platform: 'web' | 'mobile';
  message: string;
  route: string | null;
}

const has = (msg: string, ...needles: (string | RegExp)[]) =>
  needles.some((n) => (typeof n === 'string' ? msg.toLowerCase().includes(n.toLowerCase()) : n.test(msg)));

export function diagnose(r: DiagnosisInput): Diagnosis {
  const msg = r.message ?? '';
  const httpMatch = /HTTP (\d{3})/.exec(msg);
  const status = httpMatch ? Number(httpMatch[1]) : null;

  // ── API timeouts ─────────────────────────────────────────────────────────
  if (r.kind === 'api_timeout') {
    return {
      title: { he: 'השרת לא ענה בזמן', en: 'The server did not answer in time' },
      meaning: {
        he: `הדפדפן/האפליקציה חיכו לתשובה מ-${r.route ?? 'השרת'} ונכנעו אחרי מגבלת הזמן. הבקשה כנראה הגיעה לשרת, אבל הטיפול בה לקח יותר מדי זמן (או שהשרת נתקע).`,
        en: `The client waited for ${r.route ?? 'the server'} and gave up at the time limit. The request most likely reached the server, but handling it took too long (or hung).`,
      },
      causes: [
        { he: 'שאילתת Firestore כבדה — קריאת אוסף שלם / ללא limit, או לולאה שקוראת מסמך-מסמך (N+1).', en: 'Heavy Firestore work — reading a whole collection / no limit, or a loop reading one doc at a time (N+1).' },
        { he: 'קריאה חיצונית איטית בתוך הבקשה (מייל, Zoom, Google Calendar, Cloudinary) שהשרת ממתין לה.', en: 'A slow external call awaited inside the request (email, Zoom, Google Calendar, Cloudinary).' },
        { he: '"התנעה קרה" של Cloud Run אחרי זמן ללא פעילות, או מיד אחרי פריסה.', en: 'Cloud Run cold start after idle time, or right after a deploy.' },
        { he: 'משתמש עם כמות נתונים חריגה (הרבה פרויקטים/הודעות) — רק אצלו זה איטי.', en: 'One user with unusually large data (many projects/messages) — slow only for them.' },
      ],
      fixes: [
        { he: 'פתח את "לוגים של הבקשה" למטה ובדוק את ה-latency של הנתיב — אם הוא תמיד גבוה, הבעיה בקוד ה-handler המוצג ב"מיקום בקוד".', en: 'Open "request logs" below and check the route latency — if it is always high, the problem is in the handler shown under "Code location".' },
        { he: 'החלף קריאות בלולאה ב-db.getAll() / Promise.all, הוסף limit ו-pagination, והוסף אינדקס אם השאילתה מסננת+ממיינת.', en: 'Replace per-doc loop reads with db.getAll() / Promise.all, add limit + pagination, and add an index if the query filters + sorts.' },
        { he: 'העבר פעולות צד (מיילים/התראות) לרקע — להחזיר תשובה ללקוח לפני שהן מסתיימות.', en: 'Move side effects (emails/notifications) to the background — answer the client before they finish.' },
        { he: 'אם זה קורה רק אחרי שקט/פריסה: הגדר min-instances=1 לשירות api ב-Cloud Run.', en: 'If it only happens after idle/deploys: set min-instances=1 on the api Cloud Run service.' },
      ],
    };
  }

  // ── HTTP 5xx from the API ────────────────────────────────────────────────
  if (status !== null && status >= 500) {
    if (status === 503) {
      return {
        title: { he: 'השרת השיב 503 — לא זמין', en: 'Server answered 503 — unavailable' },
        meaning: { he: 'השרת דחה את הבקשה כי הוא במצב תחזוקה, עמוס, או בדיוק מתחלף בפריסה.', en: 'The server refused the request because it is in maintenance mode, overloaded, or mid-deploy.' },
        causes: [
          { he: 'מצב תחזוקה הופעל (צפוי — לא תקלה).', en: 'Maintenance mode was on (expected — not a bug).' },
          { he: 'פריסה חדשה החליפה את המופע באמצע בקשות.', en: 'A new deploy replaced the instance mid-request.' },
          { he: 'מגבלת מופעים/זיכרון ב-Cloud Run — אין מופע פנוי לקבל בקשות.', en: 'Cloud Run instance/memory limit — no free instance to take requests.' },
        ],
        fixes: [
          { he: 'השווה את זמני ההופעה למועד הפריסה (עמודת "גרסת שרת") ולמצב התחזוקה.', en: 'Compare occurrence times with the deploy time ("server revision" column) and maintenance mode.' },
          { he: 'אם לא קשור לתחזוקה/פריסה — העלה max-instances או זיכרון לשירות api.', en: 'If unrelated to maintenance/deploys — raise max-instances or memory for the api service.' },
        ],
      };
    }
    if (status === 502 || status === 504) {
      return {
        title: { he: `השרת השיב ${status} — המופע קרס או חרג מזמן`, en: `Server answered ${status} — instance crashed or exceeded its time` },
        meaning: { he: 'שכבת הרשת של Google לא קיבלה תשובה תקינה מהשרת: הוא קרס באמצע, נגמר לו הזיכרון, או עבר את זמן הבקשה המקסימלי.', en: "Google's front end didn't get a valid answer from the server: it crashed mid-request, ran out of memory, or exceeded the max request time." },
        causes: [
          { he: 'חריגת זיכרון (Memory limit exceeded) — בדרך כלל עיבוד קובץ/Excel/PDF גדול.', en: 'Memory limit exceeded — usually processing a large file/Excel/PDF.' },
          { he: 'שגיאה שלא נתפסה שהפילה את התהליך (uncaughtException).', en: 'An uncaught exception that killed the process.' },
          { he: 'handler שרץ יותר מזמן הבקשה של Cloud Run.', en: 'A handler running past the Cloud Run request timeout.' },
        ],
        fixes: [
          { he: 'פתח את "שגיאות השרת בחלון הזמן" וחפש "Memory limit" או "Uncaught exception".', en: 'Open "server errors in this window" and look for "Memory limit" or "Uncaught exception".' },
          { he: 'עבד קבצים בזרם (stream) במקום לטעון לזיכרון, או העלה זיכרון לשירות.', en: 'Stream files instead of loading them fully into memory, or raise service memory.' },
        ],
      };
    }
    return {
      title: { he: 'שגיאת שרת (500) — הקוד בשרת זרק חריגה', en: 'Server error (500) — server code threw an exception' },
      meaning: { he: 'הבקשה הגיעה לשרת, והקוד שמטפל בה נכשל. ה"מיקום בקוד" למטה מציג את השורה שזרקה את השגיאה (כשהשרת תיעד אותה).', en: 'The request reached the server and the code handling it failed. "Code location" below shows the line that threw (when the server recorded it).' },
      causes: [
        { he: 'שדה חסר/null במסמך (לרוב במסמכים ישנים שנוצרו לפני שהשדה נוסף).', en: 'A missing/null field on a document (often older docs created before the field existed).' },
        { he: 'שאילתה שדורשת אינדקס מורכב שלא קיים (FAILED_PRECONDITION).', en: 'A query needing a composite index that does not exist (FAILED_PRECONDITION).' },
        { he: 'שירות חיצוני החזיר שגיאה (מייל, Cloudinary, Zoom) והשגיאה לא טופלה.', en: 'An external service returned an error (email, Cloudinary, Zoom) that was not handled.' },
      ],
      fixes: [
        { he: 'קרא את הודעת החריגה ואת השורה המסומנת ב"מיקום בקוד" — תקן את הקוד כך שיטפל במקרה הזה (בדיקת null, ערך ברירת מחדל, 4xx ברור במקום 500).', en: 'Read the exception and the highlighted line under "Code location" — make the code handle that case (null check, default value, a clear 4xx instead of a 500).' },
        { he: 'אם ההודעה מכילה "requires an index" — צור את האינדקס מהקישור שבלוג.', en: 'If the message says "requires an index" — create it from the link in the log.' },
        { he: 'אם מסמכים ישנים חסרים שדה — הרץ backfill חד-פעמי במקום לטפל בזה בכל קריאה.', en: 'If old docs lack a field — run a one-time backfill rather than patching every read.' },
      ],
    };
  }

  // ── Transport failures (no response at all) ──────────────────────────────
  if (r.kind === 'network_failure') {
    return {
      title: { he: 'הבקשה לא קיבלה תשובה בכלל', en: 'The request got no response at all' },
      meaning: {
        he: `${r.platform === 'web' ? 'הדפדפן' : 'האפליקציה'} לא הצליח/ה לקבל תשובה מ-${r.route ?? 'השרת'} ("Failed to fetch"). זה לא אומר שאין אינטרנט — הדיווח מסנן כבר ניתוקים של המשתמש עצמו. כשאותו נתיב נכשל שוב ושוב, הבעיה בדרך כלל בצד השרת.`,
        en: `The ${r.platform === 'web' ? 'browser' : 'app'} could not get any answer from ${r.route ?? 'the server'} ("Failed to fetch"). Not simply "no internet" — the reporter already filters out the user's own disconnects. When the same route fails repeatedly, the cause is usually server-side.`,
      },
      causes: [
        { he: 'השרת קרס/הופעל מחדש באמצע הבקשה (פריסה, חריגת זיכרון) — החיבור נחתך.', en: 'The server crashed/restarted mid-request (deploy, out of memory) — the connection was cut.' },
        { he: 'דחיית CORS — בדפדפן היא נראית בדיוק כמו "Failed to fetch" (למשל כתובת אתר שלא ברשימת המקורות המורשים).', en: 'A CORS rejection — in a browser it looks exactly like "Failed to fetch" (e.g. a site origin missing from the allowlist).' },
        { he: 'הבקשה ארוכה מאוד ונחתכה ע"י פרוקסי/דפדפן (קשור ל"תפוגת זמן" על אותו נתיב).', en: 'A very long request cut off by a proxy/browser (related to a "Timeout" on the same route).' },
        { he: 'בעיית רשת אצל המשתמש שלא זוהתה (אם רק משתמש אחד מושפע).', en: 'An undetected network problem on the user side (if only one user is affected).' },
      ],
      fixes: [
        { he: 'בדוק ב"לוגים של הבקשה" אם הבקשה בכלל הגיעה לשרת: אם לא — CORS/רשת; אם כן ונכשלה — ראה את השגיאה והשורה ב"מיקום בקוד".', en: 'In "request logs", check whether the request reached the server at all: if not — CORS/network; if it did and failed — see the error and line under "Code location".' },
        { he: 'אם ההופעות צמודות לזמן פריסה — זה חלון ההחלפה; שקול להעלות min-instances כדי שהמעבר יהיה חלק.', en: 'If occurrences line up with a deploy — it is the cutover window; consider min-instances so the switch is seamless.' },
        { he: 'אם אותו נתיב גם מופיע ב"תפוגת זמן" — טפל קודם באיטיות של ה-handler.', en: 'If the same route also shows a "Timeout" — fix the handler slowness first.' },
      ],
    };
  }

  // ── Client crashes ───────────────────────────────────────────────────────
  if (has(msg, 'ChunkLoadError', 'Loading chunk', 'Failed to load module script', 'dynamically imported module', 'Importing a module script failed')) {
    return {
      title: { he: 'גרסה ישנה של האתר בדפדפן', en: 'Stale site version in the browser' },
      meaning: { he: 'המשתמש החזיק עמוד מגרסה קודמת, ואחרי פריסה הקבצים שהעמוד ביקש כבר לא קיימים.', en: 'The user had a page from a previous build open; after a deploy the files it asked for no longer exist.' },
      causes: [{ he: 'פריסה חדשה בזמן שהעמוד היה פתוח, או CDN שהגיש HTML ישן.', en: 'A new deploy while the page was open, or a CDN serving stale HTML.' }],
      fixes: [
        { he: 'בדרך כלל חולף לבד אחרי רענון. פתרון קבוע: ב-error boundary לזהות ChunkLoadError ולבצע רענון אוטומטי פעם אחת.', en: 'Usually clears on refresh. Permanent fix: detect ChunkLoadError in the error boundary and auto-reload once.' },
      ],
    };
  }
  if (has(msg, 'permission-denied', 'Missing or insufficient permissions')) {
    return {
      title: { he: 'חוקי Firestore חסמו קריאה ישירה', en: 'Firestore rules blocked a direct read' },
      meaning: { he: 'מסך קורא ישירות מ-Firestore, וחוקי האבטחה לא מאפשרים למשתמש הזה לקרוא את המסמך.', en: 'A screen reads Firestore directly and the security rules do not let this user read that document.' },
      causes: [
        { he: 'החוק בודק role יחיד ולא את מערך roles[] (משתמש רב-תפקידי).', en: 'The rule checks the single role field instead of the roles[] array (multi-role user).' },
        { he: 'מסך חדש קורא אוסף שאין לו חוק מתאים, או שהחוקים לא נפרסו.', en: 'A new screen reads a collection with no matching rule, or the rules were not deployed.' },
      ],
      fixes: [
        { he: 'מצא באיזה אוסף מדובר לפי השורה ב"מיקום בקוד", ועדכן את mobile/firestore.rules — או העבר את הקריאה לשרת (API).', en: 'Find the collection from the line under "Code location", then update mobile/firestore.rules — or move the read behind the API.' },
      ],
    };
  }
  if (has(msg, /Cannot read propert(y|ies) of (undefined|null)/, 'undefined is not an object', 'null is not an object', /is not a function/, /is not iterable/)) {
    return {
      title: { he: 'הקוד ניגש לנתון שלא קיים', en: 'Code accessed data that does not exist' },
      meaning: { he: 'רכיב במסך ציפה לשדה/אובייקט, וקיבל undefined או null — ולכן המסך קרס.', en: 'A component expected a field/object and got undefined or null, so the screen crashed.' },
      causes: [
        { he: 'מסמך ישן שחסר בו שדה חדש, או תשובת API שהמבנה שלה השתנה.', en: 'An older document missing a newer field, or an API response whose shape changed.' },
        { he: 'רינדור לפני שהנתונים נטענו (מצב טעינה לא מטופל).', en: 'Rendering before data finished loading (unhandled loading state).' },
      ],
      fixes: [
        { he: 'פתח את השורה המסומנת ב"מיקום בקוד" — הוסף בדיקה (?. / ברירת מחדל) או טפל במצב הטעינה.', en: 'Open the highlighted line under "Code location" — add a guard (?. / default) or handle the loading state.' },
        { he: 'אם השדה חסר במסמכים ישנים — הרץ backfill כדי שהבעיה לא תחזור במקום אחר.', en: 'If old docs lack the field — run a backfill so it does not resurface elsewhere.' },
      ],
    };
  }
  if (has(msg, 'Hydration', 'hydration', /Minified React error #(418|423|425)/)) {
    return {
      title: { he: 'אי-התאמה בין השרת לדפדפן (Hydration)', en: 'Server/browser mismatch (hydration)' },
      meaning: { he: 'ה-HTML שהשרת רינדר שונה ממה שהדפדפן רינדר.', en: 'The HTML the server rendered differs from what the browser rendered.' },
      causes: [{ he: 'שימוש ב-Date/שעה/שפה/localStorage/window בזמן רינדור.', en: 'Using Date/time/locale/localStorage/window during render.' }],
      fixes: [{ he: 'העבר ערכים תלויי-דפדפן ל-useEffect או רנדר אותם רק בצד הלקוח.', en: 'Move browser-dependent values into useEffect or render them client-only.' }],
    };
  }
  if (has(msg, 'Maximum update depth', 'Too many re-renders')) {
    return {
      title: { he: 'לולאת רינדור אינסופית', en: 'Infinite render loop' },
      meaning: { he: 'רכיב מעדכן state בכל רינדור, וזה מפעיל עוד רינדור — עד שריאקט עוצר.', en: 'A component sets state on every render, which triggers another render — until React stops it.' },
      causes: [{ he: 'setState בתוך useEffect בלי תלויות נכונות, או אובייקט/פונקציה חדשים בכל רינדור בתלויות.', en: 'setState inside useEffect without correct deps, or a new object/function each render in the deps.' }],
      fixes: [{ he: 'בשורה המסומנת — תקן את מערך התלויות או עטוף ב-useMemo/useCallback.', en: 'At the highlighted line — fix the dependency array or wrap in useMemo/useCallback.' }],
    };
  }
  if (has(msg, 'auth/network-request-failed')) {
    return {
      title: { he: 'Firebase Auth לא הצליח להתחבר', en: 'Firebase Auth could not connect' },
      meaning: { he: 'ההתחברות לא הגיעה לשרתי Google.', en: 'Sign-in could not reach Google servers.' },
      causes: [{ he: 'רשת חלשה אצל המשתמש, או חסימת דומיין (CSP / חומת אש ארגונית).', en: 'Weak network on the user side, or a blocked domain (CSP / corporate firewall).' }],
      fixes: [{ he: 'אם רבים מושפעים — בדוק את connect-src ב-CSP של האתר. אם משתמש אחד — רשת מקומית.', en: 'If many users — check the site CSP connect-src. If one user — their local network.' }],
    };
  }
  return {
    title: { he: 'קריסה במסך', en: 'Screen crash' },
    meaning: { he: 'שגיאת JavaScript שלא נתפסה הפילה את המסך, והמשתמש ראה את מסך השגיאה.', en: 'An uncaught JavaScript error took down the screen and the user saw the error page.' },
    causes: [{ he: 'באג בקוד המסך — ראה את ההודעה ואת השורה ב"מיקום בקוד".', en: 'A bug in the screen code — see the message and the line under "Code location".' }],
    fixes: [
      { he: 'פתח את הקובץ והשורה המסומנים, שחזר עם אותו תפקיד/דף (ראה "משתמשים מושפעים" ו"דף"), ותקן.', en: 'Open the highlighted file and line, reproduce with the same role/page (see "Affected users" and "Page"), and fix.' },
    ],
  };
}

// ─── Signals from the occurrence data ───────────────────────────────────────

export interface OccurrenceLike {
  at: number | null;
  userId?: string | null;
  page?: string | null;
  durationMs?: number | null;
  timeoutMs?: number | null;
  serverRevision?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
}

export function signals(
  r: { count: number; reopenCount: number; createdAt: number | null; lastOccurredAt: number | null; affectedUserIds: string[] },
  occ: OccurrenceLike[],
  currentServerRevision: string | null
): T[] {
  const out: T[] = [];
  const users = r.affectedUserIds.length;
  if (users === 1) {
    out.push({ he: 'משתמש אחד בלבד נתקל בזה — ייתכן שהבעיה בנתונים/במכשיר שלו ולא בכולם.', en: 'Only one user hit this — it may be their data/device rather than everyone.' });
  } else if (users > 1) {
    out.push({ he: `${users} משתמשים שונים נתקלו בזה — זו בעיה כללית, לא של משתמש בודד.`, en: `${users} different users hit this — it is a general problem, not one user's.` });
  }
  if (r.reopenCount > 0) {
    out.push({ he: `סומן כטופל ${r.reopenCount} פעמים וחזר — התיקון הקודם לא פתר את שורש הבעיה.`, en: `Marked resolved ${r.reopenCount} time(s) and came back — the previous fix did not address the root cause.` });
  }
  const timed = occ.filter((o) => o.durationMs && o.timeoutMs);
  if (timed.length > 0 && timed.every((o) => (o.durationMs ?? 0) >= (o.timeoutMs ?? Infinity) * 0.95)) {
    out.push({ he: 'בכל ההופעות הלקוח חיכה את כל מגבלת הזמן — השרת לא ענה בכלל, לא רק "קצת איטי".', en: 'Every occurrence waited the full timeout — the server never answered, not just "a bit slow".' });
  }
  const pages = new Set(occ.map((o) => o.page).filter(Boolean));
  if (pages.size === 1) {
    out.push({ he: `קורה תמיד מאותו דף: ${[...pages][0]}`, en: `Always happens from the same page: ${[...pages][0]}` });
  }
  const revs = new Set(occ.map((o) => o.serverRevision).filter(Boolean));
  if (currentServerRevision && revs.size > 0 && !revs.has(currentServerRevision)) {
    out.push({ he: 'כל ההופעות האחרונות היו לפני הפריסה הנוכחית של השרת — ייתכן שזה כבר תוקן.', en: 'All recent occurrences predate the current server deploy — it may already be fixed.' });
  }
  if (revs.size > 1) {
    out.push({ he: `קרה על פני ${revs.size} גרסאות שרת שונות — לא נגרם מפריסה אחת.`, en: `Happened across ${revs.size} server revisions — not caused by a single deploy.` });
  }
  const times = occ.map((o) => o.at).filter((x): x is number => !!x).sort((a, b) => a - b);
  if (times.length >= 3) {
    const spanMin = (times[times.length - 1]! - times[0]!) / 60000;
    if (spanMin < 10) out.push({ he: `${times.length} הופעות בתוך ${Math.max(1, Math.round(spanMin))} דקות — פרץ, כנראה אירוע חד (פריסה/עומס).`, en: `${times.length} occurrences within ${Math.max(1, Math.round(spanMin))} min — a burst, likely one event (deploy/load).` });
  }
  return out;
}
