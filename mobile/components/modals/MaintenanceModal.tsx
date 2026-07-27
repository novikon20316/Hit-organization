import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { MaintenanceModalStyles } from '../../constants/styles';

// ─── Types ────────────────────────────────────────────────────────────────────

// All roles the admin can choose to block (system_admin is never included).
// Matches BLOCKABLE_ROLES on the backend — extend both together.
export const BLOCKABLE_ROLES: RoleOption[] = [
  { key: 'faculty_admin', labelEn: 'Faculty Admin',  labelHe: 'מנהל פקולטה'  },
  { key: 'coordinator',   labelEn: 'Coordinator',    labelHe: 'רכז'           },
  { key: 'supervisor',    labelEn: 'Supervisor',      labelHe: 'מנחה'          },
  { key: 'student',       labelEn: 'Student',         labelHe: 'סטודנט'        },
  { key: 'examiner',      labelEn: 'Examiner',        labelHe: 'בוחן'          },
];

export interface RoleOption {
  key:     string;
  labelEn: string;
  labelHe: string;
}

export interface CurrentMaintenanceStatus {
  isActive: boolean;
  title:    string;
  endsAt:   string | null;
}

type Props = {
  visible: boolean;
  setVisible: (v: boolean) => void;
  lang: "he" | "en";

  // Mobile's own current maintenance status (fetched when the modal opens)
  // + a way to end it early, so a system_admin doesn't have to switch to
  // the web admin panel just to turn mobile's maintenance back off before
  // its scheduled endsAt.
  currentStatus?: CurrentMaintenanceStatus | null;
  onDeactivate?: () => void;
  deactivating?: boolean;

  // Section 1 — user-facing message
  title: string;
  setTitle: (v: string) => void;

  // Section 2 — broadcast warning before shutdown
  warnDays: number;    setWarnDays:    (v: number) => void;
  warnHours: number;   setWarnHours:   (v: number) => void;
  warnMinutes: number; setWarnMinutes: (v: number) => void;

  // Section 3 — maintenance duration
  durDays: number;    setDurDays:    (v: number) => void;
  durHours: number;   setDurHours:   (v: number) => void;
  durMinutes: number; setDurMinutes: (v: number) => void;

  // Section 4 — who gets blocked
  blockedRoles: string[];
  setBlockedRoles: (v: string[]) => void;

  // Section 5 — broadcast push
  broadcastEnabled: boolean;
  setBroadcastEnabled: (v: boolean) => void;

  onSave: () => void;
  saving?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(d: number, h: number, m: number, lang: "he" | "en"): string {
  const parts: string[] = [];
  if (lang === "he") {
    if (d > 0) parts.push(`${d} ${d === 1 ? "יום" : "ימים"}`);
    if (h > 0) parts.push(`${h} ${h === 1 ? "שעה" : "שעות"}`);
    if (m > 0) parts.push(`${m} דק'`);
    return parts.length ? parts.join(" ו‑") : "0 דקות";
  }
  if (d > 0) parts.push(`${d} ${d === 1 ? "day" : "days"}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m > 0) parts.push(`${m} min`);
  return parts.length ? parts.join(" ") : "0 min";
}

function buildPreviewMessage(
  title: string,
  durDays: number, durHours: number, durMinutes: number,
  blockedRoles: string[],
  lang: "he" | "en"
): string {
  const dur    = formatDuration(durDays, durHours, durMinutes, lang);
  const hasDur = durDays + durHours + durMinutes > 0;

  const roleNames = blockedRoles
    .map(key => {
      const r = BLOCKABLE_ROLES.find(x => x.key === key);
      return r ? (lang === "he" ? r.labelHe : r.labelEn) : key;
    })
    .join(', ');

  const affectedLine = blockedRoles.length > 0 && blockedRoles.length < BLOCKABLE_ROLES.length
    ? lang === "he"
      ? `\nמשפיע על: ${roleNames}`
      : `\nAffects: ${roleNames}`
    : '';

  if (lang === "he") {
    return hasDur
      ? `${title}\n\nאנו מבצעים תחזוקה מתוכננת. האפליקציה לא תהיה זמינה למשך כ‑${dur}.${affectedLine}\n\nנחזור בקרוב — תודה על הסבלנות.`
      : `${title}\n\nאנו מבצעים תחזוקה מתוכננת.${affectedLine}\n\nנחזור בקרוב — תודה על הסבלנות.`;
  }
  return hasDur
    ? `${title}\n\nWe're performing scheduled maintenance. The app will be unavailable for approximately ${dur}.${affectedLine}\n\nWe'll be back online shortly — thank you for your patience.`
    : `${title}\n\nWe're performing scheduled maintenance.${affectedLine}\n\nWe'll be back online shortly — thank you for your patience.`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return <Text style={s.sectionLabel}>{icon}  {text}</Text>;
}

function TimePicker({
  label, value, onChange, items,
}: {
  label: string; value: number; onChange: (v: number) => void; items: number[];
}) {
  return (
    <View style={s.timeUnit}>
      <Text style={s.timeUnitLabel}>{label}</Text>
      <View style={s.pickerWrap}>
        <Picker selectedValue={value} onValueChange={onChange} style={s.picker} itemStyle={s.pickerItem}>
          {items.map((n) => <Picker.Item key={n} label={String(n)} value={n} />)}
        </Picker>
      </View>
    </View>
  );
}

function RoleToggle({
  role, selected, onToggle, lang,
}: {
  role: RoleOption; selected: boolean; onToggle: () => void; lang: "he" | "en";
}) {
  return (
    <Pressable
      style={[s.roleChip, selected && s.roleChipSelected]}
      onPress={onToggle}
    >
      <View style={[s.roleChipDot, selected && s.roleChipDotSelected]} />
      <Text style={[s.roleChipText, selected && s.roleChipTextSelected]}>
        {lang === "he" ? role.labelHe : role.labelEn}
      </Text>
      {selected && <Text style={s.roleChipCheck}>✓</Text>}
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MaintenanceModal({
  visible, setVisible, lang,
  currentStatus, onDeactivate, deactivating = false,
  title, setTitle,
  warnDays, setWarnDays, warnHours, setWarnHours, warnMinutes, setWarnMinutes,
  durDays, setDurDays, durHours, setDurHours, durMinutes, setDurMinutes,
  blockedRoles, setBlockedRoles,
  broadcastEnabled, setBroadcastEnabled,
  onSave, saving = false,
}: Props) {
  const isHe = lang === "he";

  const dayItems  = Array.from({ length: 8 },  (_, i) => i);
  const hourItems = Array.from({ length: 24 }, (_, i) => i);
  const minItems  = [0, 5, 10, 15, 30, 45];

  // ── Select-all / deselect-all helpers ────────────────────────────────────
  const allSelected = blockedRoles.length === BLOCKABLE_ROLES.length;

  const toggleAll = () => {
    setBlockedRoles(allSelected ? [] : BLOCKABLE_ROLES.map(r => r.key));
  };

  const toggleRole = (key: string) => {
    setBlockedRoles(
      blockedRoles.includes(key)
        ? blockedRoles.filter(r => r !== key)
        : [...blockedRoles, key]
    );
  };

  // ── Derived hint strings ───────────────────────────────────────────────────
  const warnLabel = (() => {
    const total = warnDays * 24 * 60 + warnHours * 60 + warnMinutes;
    if (total === 0) return isHe
      ? "ללא אזהרה — ההשבתה תחל מיד"
      : "No warning — shutdown begins immediately";
    const s = formatDuration(warnDays, warnHours, warnMinutes, lang);
    return isHe ? `ההתראה תישלח ${s} לפני הסגירה` : `Alert sends ${s} before shutdown`;
  })();

  const durLabel = (() => {
    const total = durDays * 24 * 60 + durHours * 60 + durMinutes;
    if (total === 0) return isHe ? "משך לא הוגדר" : "Duration not set";
    const str = formatDuration(durDays, durHours, durMinutes, lang);
    return isHe ? `האפליקציה תחזור בעוד ~${str}` : `App will be back in ~${str}`;
  })();

  const previewText = buildPreviewMessage(
    title || (isHe ? "תחזוקה מתוכננת" : "Scheduled maintenance"),
    durDays, durHours, durMinutes,
    blockedRoles,
    lang
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* ── Header ── */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Text style={s.headerIconText}>🛠️</Text>
              </View>
              <View>
                <Text style={s.headerTitle}>
                  {isHe ? "מצב תחזוקה" : "Maintenance mode"}
                </Text>
                <Text style={s.headerSub}>
                  {isHe ? "הגדרת השבתה והתראות" : "Configure downtime & notifications"}
                </Text>
              </View>
            </View>
            <Pressable style={s.closeBtn} onPress={() => setVisible(false)}>
              <Text style={s.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

            {/* ── Current status + end-now ── */}
            {currentStatus?.isActive && (
              <>
                <View style={s.section}>
                  <SectionLabel icon="📡" text={isHe ? "מצב נוכחי" : "Current status"} />
                  <View style={s.statusCard}>
                    <View>
                      <Text style={[s.statusTitle, s.statusBlocked]}>
                        {isHe ? "האפליקציה בתחזוקה" : "App is under maintenance"}
                      </Text>
                      <Text style={s.statusSub}>
                        {currentStatus.title}
                        {currentStatus.endsAt
                          ? ` · ${isHe ? "עד" : "until"} ${new Date(currentStatus.endsAt).toLocaleString()}`
                          : ""}
                      </Text>
                    </View>
                    <Pressable
                      style={[s.endNowBtn, deactivating && s.endNowBtnDisabled]}
                      onPress={onDeactivate}
                      disabled={deactivating}
                    >
                      <Text style={s.endNowBtnText}>
                        {deactivating ? "…" : isHe ? "סיים עכשיו" : "End now"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                <View style={s.divider} />
              </>
            )}

            {/* ── Section 1: Message ── */}
            <View style={s.section}>
              <SectionLabel icon="💬" text={isHe ? "הודעה למשתמשים" : "User-facing message"} />
              <TextInput
                style={s.input}
                placeholder={isHe ? "כותרת — למשל: שדרוג מתוכנן" : "Title — e.g. Scheduled system upgrade"}
                placeholderTextColor="#94A3B8"
                value={title}
                onChangeText={setTitle}
                textAlign={isHe ? "right" : "left"}
              />
              <Text style={s.fieldHint}>
                {isHe
                  ? "כותרת זו תוצג למשתמשים החסומים כאשר ינסו לפתוח את האפליקציה."
                  : "This title appears to blocked users when they try to open the app."}
              </Text>
            </View>

            <View style={s.divider} />

            {/* ── Section 2: Blocked roles ── */}
            <View style={s.section}>
              <SectionLabel icon="🔒" text={isHe ? "תפקידים שיחסמו" : "Roles to block"} />
              <Text style={s.fieldHint}>
                {isHe
                  ? "בחר אילו תפקידים לא יוכלו להיכנס לאפליקציה. מנהל מערכת תמיד פטור."
                  : "Select which roles will be locked out. System admin is always exempt."}
              </Text>

              {/* Select all toggle */}
              <Pressable style={s.selectAllRow} onPress={toggleAll}>
                <View style={[s.selectAllBox, allSelected && s.selectAllBoxActive]}>
                  {allSelected && <Text style={s.selectAllCheck}>✓</Text>}
                </View>
                <Text style={s.selectAllText}>
                  {allSelected
                    ? (isHe ? "בטל הכל" : "Deselect all")
                    : (isHe ? "בחר הכל" : "Select all")}
                </Text>
              </Pressable>

              {/* Role chips */}
              <View style={s.rolesGrid}>
                {BLOCKABLE_ROLES.map(role => (
                  <RoleToggle
                    key={role.key}
                    role={role}
                    selected={blockedRoles.includes(role.key)}
                    onToggle={() => toggleRole(role.key)}
                    lang={lang}
                  />
                ))}
              </View>

              {/* Warning if nothing selected */}
              {blockedRoles.length === 0 && (
                <View style={s.warningBox}>
                  <Text style={s.warningText}>
                    ⚠️ {isHe
                      ? "לא נבחרו תפקידים — לא יחסמו משתמשים."
                      : "No roles selected — no users will be blocked."}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.divider} />

            {/* ── Section 3: Warning before shutdown ── */}
            <View style={s.section}>
              <SectionLabel icon="📣" text={isHe ? "אזהרה לפני הסגירה" : "Warning before shutdown"} />
              <Text style={s.fieldHint}>
                {isHe
                  ? "כמה זמן לפני הסגירה יתחיל השיבוש?"
                  : "How long before shutdown does the block take effect?"}
              </Text>
              <View style={s.timeRow}>
                <TimePicker label={isHe ? "ימים"  : "Days"}  value={warnDays}    onChange={setWarnDays}    items={dayItems}  />
                <TimePicker label={isHe ? "שעות"  : "Hours"} value={warnHours}   onChange={setWarnHours}   items={hourItems} />
                <TimePicker label={isHe ? "דקות"  : "Mins"}  value={warnMinutes} onChange={setWarnMinutes} items={minItems}  />
              </View>
              <Text style={s.hintBelow}>{warnLabel}</Text>
            </View>

            <View style={s.divider} />

            {/* ── Section 4: Maintenance duration ── */}
            <View style={s.section}>
              <SectionLabel icon="⏱️" text={isHe ? "משך התחזוקה" : "Maintenance duration"} />
              <Text style={s.fieldHint}>
                {isHe
                  ? "משך זה יופיע בהודעה ויקבע מתי האפליקציה תחזור לפעול."
                  : "Shown in the message and determines when the app comes back."}
              </Text>
              <View style={s.timeRow}>
                <TimePicker label={isHe ? "ימים"  : "Days"}  value={durDays}    onChange={setDurDays}    items={dayItems}  />
                <TimePicker label={isHe ? "שעות"  : "Hours"} value={durHours}   onChange={setDurHours}   items={hourItems} />
                <TimePicker label={isHe ? "דקות"  : "Mins"}  value={durMinutes} onChange={setDurMinutes} items={minItems}  />
              </View>
              <Text style={s.hintBelow}>{durLabel}</Text>
            </View>

            <View style={s.divider} />

            {/* ── Section 5: Broadcast push toggle ── */}
            <View style={s.section}>
              <SectionLabel icon="📡" text={isHe ? "שידור התראה" : "Push broadcast"} />

              <View style={s.broadcastRow}>
                <View style={s.broadcastInfo}>
                  <View>
                    <Text style={s.broadcastLabel}>
                      {isHe ? "שלח התראת דחיפה לתפקידים שנבחרו" : "Send push notification to selected roles"}
                    </Text>
                    <Text style={s.broadcastSub}>
                      {broadcastEnabled
                        ? (isHe ? "התראה תישלח לכל המכשירים הרלוונטיים" : "Notification sent to all affected devices")
                        : (isHe ? "המשתמשים יחסמו ללא הודעה מוקדמת" : "Users will be blocked without advance notice")}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={broadcastEnabled}
                  onValueChange={setBroadcastEnabled}
                  trackColor={{ false: "#CBD5E1", true: "#7F77DD" }}
                  thumbColor="#fff"
                />
              </View>

              {/* When broadcast is OFF — show a soft note */}
              {!broadcastEnabled && blockedRoles.length > 0 && (
                <View style={s.infoBox}>
                  <Text style={s.infoText}>
                    ℹ️ {isHe
                      ? "המשתמשים יחסמו בשקט — לא תישלח התראה. הם יראו את ההודעה רק בעת פתיחת האפליקציה."
                      : "Users will be silently blocked — no push sent. They'll see the message only when they open the app."}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.divider} />

            {/* ── Live preview ── */}
            <View style={s.section}>
              <SectionLabel icon="👁️" text={isHe ? "תצוגה מקדימה" : "Preview"} />
              <View style={s.previewBox}>
                <Text style={s.previewLabel}>
                  {isHe ? "מה המשתמשים החסומים יראו" : "What blocked users will see"}
                </Text>
                <Text style={s.previewText}>{previewText}</Text>
              </View>
            </View>

          </ScrollView>

          {/* ── Footer ── */}
          <View style={s.footer}>
            <Pressable
              style={[s.saveBtn, (saving || blockedRoles.length === 0) && s.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving || blockedRoles.length === 0}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.saveBtnText}>
                    {broadcastEnabled
                      ? (isHe ? "🚀 הפעל ושדר" : "🚀 Activate & broadcast")
                      : (isHe ? "🛠️ הפעל תחזוקה" : "🛠️ Activate maintenance")}
                  </Text>
              }
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={() => setVisible(false)}>
              <Text style={s.cancelBtnText}>{isHe ? "ביטול" : "Cancel"}</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = MaintenanceModalStyles;