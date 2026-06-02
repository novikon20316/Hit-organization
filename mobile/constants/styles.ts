import { StyleSheet, I18nManager } from 'react-native';
import { palette, spacing, radius, shadows, fontSize, fontWeight, cardStyles } from './theme';

export const PRIMARY = "#2E86FF"; // replace with HIT logo color if needed
export const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    padding: 20,
  },

  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },

  logo: {
    width: 130,
    height: 130,
  },

  title: {
    fontSize: 22,
    fontWeight: "600",
    marginTop: 10,
    color: "#111",
  },

  form: {
    gap: 15,
  },

  input: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    color: "#000",
  },

  button: {
    backgroundColor: PRIMARY,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export const sharedStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bgMain,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  rowGap: {
    flex: 1,
  },
  textRight: {
    textAlign: 'right',
  },
  fullWidth: {
    width: '100%',
  },
  screenPadding: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionDivider: {
    marginVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
  },
  modal: {
    flex: 1,
    backgroundColor: palette.bgMain,
  },
  modalContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: palette.textPrimary,
  },
  modalClose: {
    fontSize: 22,
    color: palette.textSecondary,
    padding: spacing.xs,
  },
  card: {
    backgroundColor: palette.bgWhite,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...shadows.xs,
  },
  cardAccent: {
    backgroundColor: palette.bgWhite,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: palette.borderLight,
    ...shadows.xs,
  },
  smallCard: {
    backgroundColor: palette.bgWhite,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.base,
  },
  input: {
    backgroundColor: palette.bgWhite,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: palette.textPrimary,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  textarea: {
    textAlignVertical: 'top',
    minHeight: 90,
  },
  fieldLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semi,
    color: palette.textBody,
    marginBottom: spacing.xs,
    marginTop: spacing.base,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
  },
  primaryButton: {
    backgroundColor: palette.primary,
  },
  primaryButtonText: {
    color: palette.bgWhite,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  secondaryButton: {
    backgroundColor: palette.bgWhite,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  secondaryButtonText: {
    color: palette.textPrimary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  disabledButton: {
    opacity: 0.4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: palette.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: palette.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semi,
    color: palette.textSecondary,
  },
  tabTextActive: {
    color: palette.primary,
  },
  tabBadge: {
    backgroundColor: palette.bgBlueTint,
    borderRadius: radius.sm,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  tabBadgeActive: {
    backgroundColor: palette.primary,
  },
  tabBadgeText: {
    fontSize: fontSize.badge,
    fontWeight: fontWeight.heavy,
    color: palette.bgWhite,
  },
  statsRow: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  statGap: {
    width: 0,
  },
  addBtn: {
    backgroundColor: palette.primary,
    borderRadius: radius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.blue,
  },
  addBtnText: {
    color: palette.bgWhite,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.lg,
  },
  projectCard: {
    ...cardStyles.accented,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: palette.textPrimary,
  },
  cardMeta: {
    fontSize: fontSize.xs,
    color: palette.textSecondary,
  },
  appCount: {
    marginTop: spacing.sm,
    backgroundColor: palette.bgAmberTint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  appCountText: {
    fontSize: fontSize.sm,
    color: palette.warning,
    fontWeight: fontWeight.semi,
  },
  appCard: {
    ...cardStyles.base,
    padding: spacing.lg,
  },
  appProjectLabel: {
    fontSize: fontSize.sm,
    color: palette.textSecondary,
    marginBottom: spacing.xs,
  },
  studentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.bgBlueTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: {
    fontWeight: fontWeight.bold,
    color: palette.primary,
    fontSize: fontSize.xl,
  },
  studentName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: palette.textPrimary,
  },
  studentEmail: {
    fontSize: fontSize.sm,
    color: palette.textSecondary,
  },
  coverNote: {
    backgroundColor: palette.bgSubtle,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginVertical: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.borderMid,
  },
  coverNoteText: {
    fontSize: fontSize.base,
    color: palette.textBlue,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  docsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  docChip: {
    backgroundColor: palette.bgBlueTint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: palette.borderPurpleLight,
  },
  docChipText: {
    fontSize: fontSize.sm,
    color: palette.primary,
    fontWeight: fontWeight.medium,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: palette.successBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.successBorder,
  },
  approveBtnText: {
    color: palette.success,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  meetingBtn: {
    flex: 1,
    backgroundColor: palette.warningBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  meetingBtnText: {
    color: palette.orange,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: palette.dangerBg,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  rejectBtnText: {
    color: palette.danger,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  gradeCard: {
    ...cardStyles.accented,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderColor: palette.borderLight,
  },
  gradeMilestoneType: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.heavy,
    marginBottom: spacing.xs,
    letterSpacing: 0.3,
  },
  gradeProjectTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semi,
    color: palette.textPrimary,
    marginBottom: spacing.xs,
  },
  gradeStudents: {
    fontSize: fontSize.sm,
    color: palette.textSecondary,
    marginBottom: spacing.xs,
  },
  gradeDate: {
    fontSize: fontSize.sm,
    color: palette.textSecondary,
    marginBottom: spacing.xs,
  },
  filesNote: {
    fontSize: fontSize.sm,
    color: palette.textBlue,
    marginBottom: spacing.sm,
  },
  submissionNote: {
    fontSize: fontSize.sm,
    color: palette.textBody,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  gradeBtn: {
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  gradeBtnText: {
    color: palette.bgWhite,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  scoreInput: {
    fontSize: fontSize.display,
    fontWeight: fontWeight.heavy,
    height: 70,
    color: palette.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: palette.bgWhite,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  toggleBtnActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semi,
    color: palette.textSecondary,
  },
  toggleTextActive: {
    color: palette.bgWhite,
  },
  gradeContext: {
    backgroundColor: palette.bgBlueTint,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: palette.primary,
  },
  gradeContextTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.heavy,
    color: palette.textPrimary,
    marginBottom: spacing.xs,
  },
  gradeContextSub: {
    fontSize: fontSize.sm,
    color: palette.textBlue,
    marginBottom: spacing.xs,
  },
  submitBtn: {
    backgroundColor: palette.primary,
    borderRadius: radius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
    ...shadows.blueLg,
  },
  submitBtnText: {
    color: palette.bgWhite,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  toggleBtnDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: palette.borderBase,
    opacity: 0.4,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: palette.primaryDark,
  },
  deleteBtn: {
    backgroundColor: palette.dangerDark,
  },
  actionBtnText: {
    color: palette.bgWhite,
    fontWeight: fontWeight.bold,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: palette.bgAlt,
  },
  close: {
    fontSize: 24,
    color: palette.textSecondary,
  },
  facultyDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  facultyOption: {
    backgroundColor: palette.bgWhite,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  facultyOptionActive: {
    backgroundColor: palette.dangerBg,
  },
  editBtnText: {
    color: palette.bgWhite,
    fontWeight: fontWeight.bold,
  },
  tag: {
    backgroundColor: palette.bgMain,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: palette.primary,
  },
  badge: {
    backgroundColor: palette.notifRed,
    borderRadius: radius.sm,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: palette.bgWhite,
    fontSize: fontSize.badge,
    fontWeight: fontWeight.heavy,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: palette.bgWhite,
    fontWeight: fontWeight.bold,
    fontSize: fontSize.xl,
  },
  statusBadge: {
    backgroundColor: palette.bgSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: palette.textSecondary,
    fontWeight: fontWeight.semi,
  },
  smallText: {
    fontSize: fontSize.sm,
    color: palette.textSecondary,
  },
  bodyText: {
    fontSize: fontSize.base,
    color: palette.textBody,
  },
  heading: {
    fontSize: fontSize.h3,
    fontWeight: fontWeight.heavy,
    color: palette.textPrimary,
  },
  subheading: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.heavy,
    color: palette.textPrimary,
  },
  uploadBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#D0DEFF',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 4,
  },
  uploadBtnDone: { borderColor: '#4CAF50', borderStyle: 'solid', backgroundColor: '#F1FFF3' },
  uploadBtnText: { fontSize: 14, color: '#5577AA', fontWeight: '500' },

  // ── Deadline Row Styles ────────────────────────────────────────────────────
  deadlineRow: {
    ...cardStyles.base,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semi,
    color: palette.textSecondary,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: palette.textPrimary,
  },
  daysLeft: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    marginLeft: spacing.sm,
  },
});

export const studentHomeStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },
  rtl: {
    direction: 'rtl',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  textRight: {
    textAlign: 'right',
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2E86FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  welcomeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  roleTag: {
    fontSize: 11,
    color: '#2E86FF',
    fontWeight: '500',
    marginTop: 1,
  },

  langToggle: {
    backgroundColor: '#F0F4FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#D0DEFF',
  },
  langText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E86FF',
  },

  bellBtn: {
    marginRight: 8,
    position: 'relative',
  },
  bellIcon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  signOutBtn: {
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D32F2F',
  },
});

export const coordinatorHomeStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F5F0FF' },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:     { padding: 16 },
  textRight:   { textAlign: 'right' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E8E0FF',
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:      { borderBottomColor: '#8B5CF6' },
  tabText:        { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  tabTextActive:  { color: '#8B5CF6' },
  badge: {
    backgroundColor: '#8B5CF6', borderRadius: 8, minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#EDE9FE',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  milestoneType: { fontSize: 12, fontWeight: '800', color: '#8B5CF6' },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 6 },
  cardMeta:   { fontSize: 12, color: '#6B7280', marginBottom: 4 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approveBtn: {
    flex: 1, backgroundColor: '#8B5CF6', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    flex: 1, backgroundColor: '#8B5CF6', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  rejectBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scheduleBtn: {
    backgroundColor: '#EDE9FE', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#C4B5FD',
  },
  scheduleBtnText: { color: '#7C3AED', fontWeight: '700' },

  defenseDateBadge: {
    backgroundColor: '#F0FDF4', borderRadius: 8, padding: 8,
    marginTop: 8, borderWidth: 1, borderColor: '#A7F3D0',
  },
  defenseDateText: { color: '#065F46', fontSize: 13, fontWeight: '600' },

  empty:      { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#9CA3AF' },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  dialog: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '80%',
  },
  dialogTitle: { fontSize: 17, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  dialogBtns:  { flexDirection: 'row', gap: 12 },
  dialogCancel: {
    flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  dialogConfirm: {
    flex: 1, backgroundColor: '#8B5CF6', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },

  modal:        { flex: 1, backgroundColor: '#F5F0FF' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHeader: {
    marginBottom: 10,
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
  },

  backButton: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
  modalTitle:   { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 20 },
  fieldLabel:   { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 8 },

  examinerOption: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#E0E7FF',
  },
  examinerOptionActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  examinerOptionText:   { fontSize: 13, fontWeight: '600', color: '#374151' },

  weightLabel: { fontSize: 12, color: '#6B7280', marginTop: 10, marginBottom: 4 },
  weightInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14,
    height: 48, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: '#E0E7FF',
  },
  weightSum: {
    marginTop: 12, fontSize: 14, fontWeight: '800', color: '#8B5CF6', textAlign: 'center',
  },

  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    height: 52, fontSize: 14, borderWidth: 1, borderColor: '#E0E7FF', marginTop: 4,
  },

  submitBtn: {
    backgroundColor: '#8B5CF6', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 10,
  },
  cancelBtnText: { color: '#8B5CF6', fontSize: 14, fontWeight: '600' },
  cardExpanded: {
    borderWidth: 2,
    borderColor: '#8B5CF6',
    },

  expandedSection: {
    marginTop: 14,
    gap: 12,
    },

  expandedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    },

  expandedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    },

  expandedText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    },

  fileBtn: {
    backgroundColor: '#EDE9FE',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    },

  fileBtnText: {
    color: '#6D28D9',
    fontWeight: '700',
    },
  gradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4FF',
  },

  // ── Deadline Styles ────────────────────────────────────────────────────────
  deadlineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  deadlineValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
  },
  deadlineDaysLeft: {
    fontSize: 18,
    fontWeight: '700',
  },
});

export const adminPanelStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F6FF',
  },

  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#fff',
  },

  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },

  heroSub: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
  },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },

  tab: {
    flex: 1,
    backgroundColor: '#F1F5FF',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },

  tabActive: {
    backgroundColor: '#EF4444',
  },

  tabText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12,
  },

  tabTextActive: {
    color: '#fff',
  },

  content: {
    padding: 16,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },

  facultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  facultyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },

  facultyText: {
    width: 90,
    fontWeight: '700',
    color: '#111827',
    fontSize: 12,
  },

  facultyBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 20,
    overflow: 'hidden',
  },

  facultyFill: {
    height: '100%',
    borderRadius: 20,
  },

  facultyCount: {
    width: 40,
    textAlign: 'right',
    fontWeight: '800',
    color: '#111827',
  },

  searchBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },

  searchInput: {
    height: 52,
    fontSize: 14,
  },

  userCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },

  userTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  avatarText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },

  userName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  userEmail: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
  },

  userBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },

  roleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  roleBadgeText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },

  editBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },

  editBtnText: {
    color: '#fff',
    fontWeight: '700',
  },

  projectCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },

  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  projectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  projectMeta: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },

  milestoneCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#F59E0B',
  },

  milestoneType: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F59E0B',
  },

  modalRoot: {
    flex: 1,
    backgroundColor: '#F3F6FF',
  },

  modalContent: {
    padding: 20,
    paddingBottom: 100,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },

  close: {
    fontSize: 24,
    color: '#64748B',
  },

  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '700',
    color: '#111827',
  },

  roleOption: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  roleOptionActive: {
    backgroundColor: '#EF4444',
  },

  roleOptionText: {
    color: '#111827',
    fontWeight: '700',
  },

  roleOptionTextActive: {
    color: '#fff',
  },

  facultyOption: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  facultyOptionActive: {
    backgroundColor: '#EF4444',
  },

  submitBtn: {
    marginTop: 20,
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },

  submitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  input: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
    marginTop: 10,
  },

  textRight: {
    textAlign: 'right',
  },
  deleteBtn: {
    marginTop: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },

  deleteBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  modal:        { flex: 1, backgroundColor: '#F0F4FF' },
  modalClose:   { fontSize: 22, color: '#888', padding: 4 },
  textarea:    { textAlignVertical: 'top', minHeight: 90 },
  toggleRow:   { flexDirection: 'row', gap: 8, marginBottom: 4 },
  rowReverse:  { flexDirection: 'row-reverse' },
  toggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E8FF',
  },
  toggleBtnActive:  { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  toggleText:       { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  toggleTextActive: { color: '#fff' },
  addStudentBtn: {
    marginTop: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  addStudentBtnText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  addStudentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  addStudentTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  addStudentSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    maxWidth: 260,
  },
  addStudentSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E0E8FF',
    height: 52,
  },
  addStudentSearchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  addStudentSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
  },
  studentPickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  studentPickerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  studentPickerEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  studentPickerArrow: {
    fontSize: 22,
    color: '#D1D5DB',
    fontWeight: '300',
  },
  facultyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  facultyPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E8FF',
    marginBottom: 4,
  },
  facultyPickerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  facultyPickerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  supOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supOptionActive: {
    backgroundColor: '#fff',
    borderColor: '#ff4444',
    borderWidth: 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userPreview: {
    backgroundColor: '#F8FAFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E0E8FF',
  },
  userPreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9BA8C0',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userPreviewRow: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
    fontWeight: '500',
  },
  sectionDivider: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    marginTop: 24,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  toggleBtnDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor:     '#E5E7EB',
    opacity:         0.4,
  },
  toggleTextDisabled: {
    color: '#9CA3AF',
  },
  majorOption: {
    backgroundColor: '#fff',
    borderRadius:    12,
    padding:         14,
    borderWidth:     1,
    borderColor:     '#E0E8FF',
  },
  majorOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor:     '#2563EB',
    borderWidth:     1.5,
  },
  majorOptionInner: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  majorOptionText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#374151',
  },
  majorOptionTextActive: {
    color: '#2563EB',
  },
  majorOptionSub: {
    fontSize:   11,
    color:      '#9BA8C0',
    marginTop:  3,
  },
  majorOptionSubActive: {
    color: '#93C5FD',
  },
  majorCheckmark: {
    color:      '#2563EB',
    fontWeight: '800',
    fontSize:   16,
  },
  projectMilestoneCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,

    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },

    elevation: 3,
    },

    milestoneCounter: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    },

    milestoneCounterText: {
    fontWeight: '700',
    color: '#4338CA',
    },

    milestoneStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    },

    milestoneStatBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 4,
    paddingVertical: 12,
    borderRadius: 16,
    },

    milestoneStatEmoji: {
    fontSize: 20,
    marginBottom: 4,
    },

    milestoneStatValue: {
    fontSize: 16,
    fontWeight: '700',
    },

    openProjectText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#64748B',
    fontWeight: '600',
    },
});

export const browseProjectsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  textRight: { textAlign: 'right' },
  rowReverse: { flexDirection: 'row-reverse' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E0E8FF',
    shadowColor: '#2E86FF',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#111' },
  searchIcon: { fontSize: 18 },

  filters: { paddingHorizontal: 14, marginBottom: 6 },
  filtersWrapper: {
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D0DEFF',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  chipActiveAlt: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  chipTextActive: { color: '#fff' },
  chipDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E0E8FF',
    marginRight: 8,
    alignSelf: 'center',
  },

  resultsCount: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    fontSize: 12,
    color: '#8899BB',
    fontWeight: '500',
  },

  list: { paddingHorizontal: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#8899BB' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E8FF',
    shadowColor: '#2E86FF',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 10,
    width: '100%',
  },
  badges: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    width: '100%',
  },
  badge: { 
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: '100%',
  },
  badgeBachelors: { backgroundColor: '#E3F2FD' },
  badgeMasters: { backgroundColor: '#F3E5F5' },
  badgeType: { backgroundColor: '#E8F5E9' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#555' },
  chevron: { fontSize: 12, color: '#9BA8C0' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 6 },
  cardSupervisor: { fontSize: 13, color: '#5577AA', marginBottom: 8 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  skillChip: { backgroundColor: '#F0F4FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  skillText: { fontSize: 11, color: '#2E86FF', fontWeight: '500' },
  moreSkills: { fontSize: 11, color: '#9BA8C0', alignSelf: 'center' },

  expanded: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F4FF' },
  descText: { fontSize: 13, color: '#445', lineHeight: 20, marginBottom: 16 },
  applyBtn: {
    backgroundColor: '#2E86FF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#2E86FF',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  modal: { flex: 1, backgroundColor: '#F0F4FF' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  modalClose: { fontSize: 22, color: '#888', padding: 4 },

  applyProjectInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2E86FF',
  },
  applyForLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  applyProjectTitle: { fontSize: 14, fontWeight: '700', color: '#111' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 6, marginTop: 16 },
  textarea: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#111',
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E0E8FF',
    minHeight: 100,
  },
  uploadBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#D0DEFF',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  uploadBtnDone: { borderColor: '#4CAF50', borderStyle: 'solid', backgroundColor: '#F1FFF3' },
  uploadBtnText: { fontSize: 14, color: '#5577AA', fontWeight: '500' },

  applyMessage: { marginTop: 14, padding: 12, borderRadius: 10, textAlign: 'center', fontSize: 14 },
  applyMessageSuccess: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  applyMessageError: { backgroundColor: '#FFEBEE', color: '#C62828' },

  submitBtn: {
    backgroundColor: '#2E86FF',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#2E86FF',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowReverse2: { flexDirection: 'row-reverse' },
});

export const examinerHomeStyles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0FDF9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:  { padding: 16 },

  pageTitle: { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, borderLeftWidth: 4,
    borderWidth: 1, borderColor: '#D1FAE5',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 6 },
  cardMeta:  { fontSize: 12, color: '#6B7280', marginBottom: 4 },

  dateChip: {
    backgroundColor: '#ECFDF5', borderRadius: 8, padding: 8,
    marginTop: 8, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  dateChipText: { color: '#065F46', fontSize: 12, fontWeight: '600' },

  gradedBadge: {
    marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  gradedBadgeText: { color: '#10B981', fontWeight: '700' },

  gradeBtn: {
    marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  gradeBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  empty:      { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#9CA3AF' },

  modal:        { flex: 1, backgroundColor: '#F0FDF9' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalTitle:   { fontSize: 20, fontWeight: '900', color: '#111', marginBottom: 16 },

  context: {
    backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14,
    marginBottom: 20, borderLeftWidth: 3, borderLeftColor: '#10B981',
  },
  contextTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 4 },
  contextSub:   { fontSize: 13, color: '#065F46', marginBottom: 2 },

  criterionRow:   { marginBottom: 16 },
  criterionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  criterionLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  criterionMax:   { fontSize: 12, color: '#9CA3AF' },
  scoreInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14,
    height: 48, fontSize: 20, fontWeight: '800', color: '#10B981',
    borderWidth: 1, borderColor: '#D1FAE5', textAlign: 'center',
  },

  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 16, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#374151' },
  totalScore: { fontSize: 28, fontWeight: '900' },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  textarea: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: '#111',
    borderWidth: 1, borderColor: '#D1FAE5', textAlignVertical: 'top', minHeight: 100,
  },

  submitBtn: {
    backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { color: '#10B981', fontSize: 14, fontWeight: '600' },
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5EAFF' },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  tabActive:     { borderBottomWidth: 3, borderBottomColor: '#10B981' },
  tabText:       { fontSize: 13, color: '#8899BB', fontWeight: '500' },
  tabTextActive: { color: '#10B981', fontWeight: '700' },
  badge:         { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:     { color: '#fff', fontSize: 10, fontWeight: '700' },
 
  // Card
  cardExpanded:  { shadowOpacity: 0.14 },
  expandHint:    { textAlign: 'center', color: '#C0CCDD', fontSize: 11, marginTop: 6, marginBottom: 2 },
 
  // Defense date pill
  defensePill:     { marginTop: 8, backgroundColor: '#ECFDF5', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, alignSelf: 'flex-start' },
  defensePillText: { fontSize: 12, color: '#059669', fontWeight: '600' },
 
  // Weight chips
  weightsRow:      { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  weightChip:      { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  weightChipHL:    { backgroundColor: '#10B981' },
  weightChipLabel: { fontSize: 10, color: '#6B7280' },
  weightChipValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
 
  // Expanded milestone history
  expandedSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#F0F4FF', paddingTop: 14 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  milestoneBlock:  { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 10 },
  milestoneName:   { fontSize: 13, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  scoreRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  scoreLabel:      { fontSize: 12, color: '#6B7280' },
  scoreValue:      { fontSize: 13, fontWeight: '700' },
  commentText:     { fontSize: 12, color: '#4B5563', fontStyle: 'italic', marginTop: 4 },
  filesLabel:      { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  fileBtn:         { backgroundColor: '#ECFDF5', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 6 },
  fileBtnText:     { fontSize: 13, color: '#059669', fontWeight: '600' },
  noFiles:         { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
 
  // Schedule cards
  scheduleCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  countdownBadge:    { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 10 },
  countdownText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  scheduleTitle:     { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  scheduleRow:       { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  scheduleChip:      { backgroundColor: '#F0FDF4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  scheduleChipLabel: { fontSize: 10, color: '#6B7280', marginBottom: 2 },
  scheduleChipValue: { fontSize: 14, fontWeight: '700', color: '#065F46' },
});

export const facultyTemplateManager = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F5F3FF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:  { padding: 16 },

  // Tabs
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EDE9FE' },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  tabActive:     { borderBottomWidth: 3, borderBottomColor: '#7C3AED' },
  tabText:       { fontSize: 13, color: '#8899BB', fontWeight: '500' },
  tabTextActive: { color: '#7C3AED', fontWeight: '700' },
  badge:         { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:     { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Degree selector
  degreeBar:      { marginBottom: 14 },
  degreeChip:     { borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: '#fff' },
  degreeChipActive:     { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  degreeChipText:       { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  degreeChipTextActive: { color: '#fff' },

  // New button
  newBtn:     { backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 16 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Empty
  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText:  { fontSize: 14, color: '#8899BB', textAlign: 'center', paddingHorizontal: 24 },

  // Template card
  tplCard:        { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#7C3AED', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tplCardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  tplName:        { fontSize: 15, fontWeight: '700', color: '#1F1235' },
  tplSub:         { fontSize: 12, color: '#8899BB', marginTop: 2 },
  tplActions:     { flexDirection: 'row', gap: 8 },
  editBtn:        { backgroundColor: '#EDE9FE', borderRadius: 8, padding: 8 },
  editBtnText:    { fontSize: 16 },
  deleteBtn:      { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 8 },
  deleteBtnText:  { fontSize: 16 },

  // Milestone preview row
  msPreviewRow:   { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F3F0FF', gap: 10 },
  msOrderBadge:   { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  msOrderText:    { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  msPreviewName:  { fontSize: 13, fontWeight: '600', color: '#111' },
  msPreviewMeta:  { fontSize: 11, color: '#8899BB', marginTop: 2 },

  // Proposal card
  proposalCard:   { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  proposalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  proposalTitle:  { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  pendingBadge:   { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 11, color: '#92400E', fontWeight: '700' },
  proposalBy:     { fontSize: 13, color: '#4B5563', marginTop: 3 },
  proposalDegree: { fontSize: 13, color: '#4B5563', marginTop: 3, marginBottom: 10 },
  changesBox:     { backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 12 },
  changesTitle:   { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  changesText:    { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  changesItem:    { fontSize: 12, color: '#374151', marginTop: 2 },
  proposalBtns:   { flexDirection: 'row', gap: 10 },
  approveBtn:     { flex: 1, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtn:      { flex: 1, backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  rejectBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0EBFF' },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: '#1F1235' },
  modalClose:   { fontSize: 20, color: '#8899BB', paddingHorizontal: 4 },
  modalContent: { padding: 20 },

  infoBox:     { backgroundColor: '#EDE9FE', borderRadius: 10, padding: 12, marginBottom: 16 },
  infoBoxText: { fontSize: 13, color: '#5B21B6', fontWeight: '600' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input:      { borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, backgroundColor: '#fff', color: '#111' },

  // Milestone section in editor
  msSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  addMsBtn:        { backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addMsBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  msEditorRow:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, marginTop: 8, gap: 10 },
  msEditorName:    { fontSize: 13, fontWeight: '700', color: '#1F1235' },
  msEditorMeta:    { fontSize: 11, color: '#8899BB', marginTop: 2 },
  msWeightsText:   { fontSize: 11, color: '#7C3AED', marginTop: 3 },
  msRowActions:    { flexDirection: 'row', gap: 6 },
  msActionBtn:     { padding: 4 },

  // Weight fields
  toggleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  weightRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  weightRowLabel: { fontSize: 13, color: '#374151', flex: 1 },
  weightInput:    { width: 72, borderWidth: 1.5, borderColor: '#DDD6FE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'center', fontSize: 14 },
  weightTotal:    { fontSize: 13, fontWeight: '700', textAlign: 'right', marginTop: 8 },

  saveBtn:      { backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn:    { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  cancelBtnText:{ color: '#8899BB', fontSize: 14 },
});

export const ActivateDashboardStyles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F0F4FF' },
  content:     { padding: 16 },
  textRight:   { textAlign: 'right' },
  rowReverse:  { flexDirection: 'row-reverse' },
  sectionTitle:{ fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 14 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E8FF',
  },
  tab: {
    flex: 1, paddingVertical: 13, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: '#2E86FF' },
  tabText:       { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  tabTextActive: { color: '#2E86FF' },

  // Project card
  projectCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  projectCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  projectCardEmoji:  { fontSize: 32 },
  projectTitle:      { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 4 },
  projectMeta:       { fontSize: 12, color: '#8899BB' },

  // Progress bar
  progressSection:   { marginTop: 4 },
  progressLabelRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel:     { fontSize: 13, fontWeight: '600', color: '#445' },
  progressPct:       { fontSize: 13, fontWeight: '800', color: '#2E86FF' },
  progressTrack: {
    height: 8, backgroundColor: '#E0E8FF', borderRadius: 4, overflow: 'hidden', marginBottom: 6,
  },
  progressFill:  { height: '100%', backgroundColor: '#2E86FF', borderRadius: 4 },
  progressSub:   { fontSize: 11, color: '#9BA8C0' },

  // Next milestone banner
  nextMilestone: {
    backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16,
    borderLeftWidth: 4, borderLeftColor: '#2E86FF', marginBottom: 16,
  },
  nextHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  nextLabel:     { fontSize: 12, fontWeight: '700', color: '#2E86FF', textTransform: 'uppercase', letterSpacing: 0.5 },
  nextTitle:     { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 4 },
  nextDue:       { fontSize: 13, color: '#5577AA', marginBottom: 12 },
  daysBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  daysBadgeBlue: { backgroundColor: '#DBEAFE' },
  daysBadgeOrange:{ backgroundColor: '#FEF3C7' },
  daysBadgeRed:  { backgroundColor: '#FEE2E2' },
  daysBadgeText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  submitMilestoneBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#2E86FF', shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  submitMilestoneBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Description card
  descCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  descTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  descBody:  { fontSize: 13, color: '#445', lineHeight: 20 },

  // Milestones timeline
  milestoneCard: { flexDirection: 'row', marginBottom: 8 },
  timelineCol:   { width: 36, alignItems: 'center' },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  timelineNum:     { color: '#fff', fontSize: 11, fontWeight: '800' },
  timelineLine:    { flex: 1, width: 2, backgroundColor: '#E0E8FF', minHeight: 20, marginVertical: 2 },
  timelineLineDone:{ backgroundColor: '#10B981' },
  milestoneContent:      { flex: 1, marginLeft: 12, marginBottom: 8 },
  milestoneContentRtl:   { marginLeft: 0, marginRight: 12 },
  milestoneHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  milestoneTitle:        { fontSize: 14, fontWeight: '700', color: '#111', flex: 1 },
  statusBadge:           { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText:       { fontSize: 11, fontWeight: '600' },
  milestoneDue:          { fontSize: 12, color: '#8899BB', marginBottom: 8 },
  daysTag:               { fontSize: 12, fontWeight: '600' },
  gradeChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, marginBottom: 8,
  },
  gradeChipText:   { fontSize: 13, fontWeight: '700', color: '#10B981' },
  defenseInfo:     { backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginBottom: 8 },
  defenseRow:      { fontSize: 13, color: '#5B21B6', marginBottom: 4 },
  notScheduled:    { fontSize: 12, color: '#8899BB', fontStyle: 'italic', marginBottom: 8 },
  milestoneSubmitBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 9,
    alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE',
  },
  milestoneSubmitBtnText: { color: '#2E86FF', fontSize: 13, fontWeight: '700' },
  filesRow:    { flexDirection: 'row', alignItems: 'center' },
  filesLabel:  { fontSize: 12, color: '#8899BB' },

  // Grades tab
  gradeCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  gradeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  gradeCardTitle:  { fontSize: 14, fontWeight: '700', color: '#111' },
  gradePill: {
    backgroundColor: '#2E86FF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  gradePillText:   { color: '#fff', fontWeight: '800', fontSize: 16 },
  noGrade:         { fontSize: 12, color: '#9BA8C0', fontStyle: 'italic' },
  gradeProgress: {
    height: 6, backgroundColor: '#E0E8FF', borderRadius: 3, overflow: 'hidden',
  },
  gradeProgressFill: { height: '100%', backgroundColor: '#2E86FF', borderRadius: 3 },

  finalGradeCard: {
    backgroundColor: '#2E86FF', borderRadius: 18, padding: 24,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  finalGradeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  finalGradeValue: { color: '#fff', fontSize: 56, fontWeight: '900', marginBottom: 8 },
  finalGradeNote:  { color: 'rgba(255,255,255,0.65)', fontSize: 11, textAlign: 'center' },

  // Modal
  modal:        { flex: 1, backgroundColor: '#F0F4FF' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: '#111' },
  modalClose:   { fontSize: 22, color: '#888', padding: 4 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 8, marginTop: 16 },
  textarea: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    fontSize: 14, color: '#111', textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#E0E8FF', minHeight: 90,
  },
  fileRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  fileName:   { fontSize: 13, color: '#445', flex: 1 },
  fileRemove: { fontSize: 18, color: '#D32F2F', paddingLeft: 10 },
  uploadBtn: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 2, borderColor: '#D0DEFF', borderStyle: 'dashed',
    alignItems: 'center', marginBottom: 4,
  },
  uploadBtnText: { color: '#2E86FF', fontSize: 14, fontWeight: '600' },
  submitMsg:       { marginTop: 14, padding: 12, borderRadius: 10, textAlign: 'center', fontSize: 14 },
  submitMsgOk:     { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  submitMsgErr:    { backgroundColor: '#FFEBEE', color: '#C62828' },
  submitBtn: {
    backgroundColor: '#2E86FF', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#2E86FF', shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export const ProjectPageStyles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  desc: {
    marginTop: 6,
    color: '#555',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 12,
  },
  mTitle: {
    fontWeight: '600',
    fontSize: 16,
  },
  mDesc: {
    color: '#555',
    marginTop: 4,
  },
  deadline: {
    marginTop: 6,
    fontSize: 12,
    color: 'red',
  },
  submitted: {
    marginTop: 10,
    color: 'green',
    fontWeight: '600',
  },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: 10,
    backgroundColor: '#2E86FF',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});


export const PendingScreenStyles = StyleSheet.create({
  container:    { padding: 20, backgroundColor: '#F0F4FF', alignItems: 'center' },
  textCenter:   { textAlign: 'center' },
  textRight:    { textAlign: 'right' },
  rowReverse:   { flexDirection: 'row-reverse' },

  illustrationWrap: { marginTop: 20, marginBottom: 24, alignItems: 'center' },
  pulseOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#E3EEFF', justifyContent: 'center', alignItems: 'center',
  },
  pulseInner: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: '#C5D9FF', justifyContent: 'center', alignItems: 'center',
  },
  pulseEmoji: { fontSize: 32 },

  title:    { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#667', textAlign: 'center', marginBottom: 24, lineHeight: 20 },

  meetingBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#FFB300',
    marginBottom: 16, width: '100%',
  },
  meetingIcon: { fontSize: 18, marginRight: 10 },
  meetingText: { flex: 1, fontSize: 13, color: '#6D4C00', lineHeight: 19 },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    width: '100%', marginBottom: 16,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4 },
  rowLabel:  { fontSize: 13, color: '#8899BB', fontWeight: '500' },
  rowValue:  { fontSize: 13, color: '#111', fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 8 },
  rowValueHighlight: { color: '#2E86FF' },
  divider:   { height: 1, backgroundColor: '#F0F4FF', marginVertical: 8 },

  noteCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#E8F4FD', borderRadius: 12, padding: 12,
    width: '100%', marginBottom: 16,
  },
  noteIcon: { fontSize: 16, marginRight: 8 },
  noteText: { flex: 1, fontSize: 12, color: '#1A5276', lineHeight: 18 },

  stepsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    width: '100%', marginBottom: 20,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  stepsTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 14 },
  step:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  stepRtl:    { flexDirection: 'row-reverse' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2E86FF', justifyContent: 'center', alignItems: 'center',
    marginRight: 10, marginLeft: 0, flexShrink: 0,
  },
  stepDotAlert: { backgroundColor: '#FFB300' },
  stepNum:  { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 13, color: '#445', lineHeight: 19 },

  withdrawBtn: {
    paddingVertical: 12, paddingHorizontal: 28,
    borderRadius: 12, borderWidth: 1, borderColor: '#FFCDD2',
    backgroundColor: '#FFF0F0',
  },
  withdrawText: { color: '#D32F2F', fontWeight: '600', fontSize: 14 },
});
