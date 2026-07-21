import { StyleSheet, I18nManager, Platform, Dimensions } from 'react-native';
import { palette, spacing, radius, shadows, fontSize, fontWeight, cardStyles } from './theme';

// Used by NewMessageStyles.sheet (moved here from app/message/new.tsx, which
// had its own local `const { height: SCREEN_H } = Dimensions.get('window');`).
const { height: SCREEN_H } = Dimensions.get('window');

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
    gap: 8,
  },
  // Fixed size (not flex:1) so tabs stay the same size regardless of how
  // many tabs a given screen has — matches admin/panel.tsx's tabsContainer.
  // Wrap the containing row in a horizontal ScrollView so extra tabs slide
  // into view instead of squeezing everyone smaller.
  // height is fixed too (not just width) — without it, a tab whose label
  // wraps to 2 lines grows taller than its neighbors; numberOfLines={1} on
  // the label Text (set where this style is used) keeps text from wrapping
  // in the first place, so it truncates instead of pushing the box taller.
  tab: {
    width: 110,
    height: 46,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    overflow: 'hidden',
  },
  tabActive: {
    borderBottomColor: palette.primary,
  },
  tabText: {
    fontSize: 13,
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
    gap: 8,
  },
  // Fixed size (not flex:1) — matches admin/panel.tsx's tabsContainer so
  // tabs stay the same size regardless of tab count; wrap the row in a
  // horizontal ScrollView so extra tabs slide into view instead of shrinking.
  // height is fixed (tall enough for a wrapped-badge tab) so a tab with a
  // badge stacked under its label isn't taller than one without; pair with
  // numberOfLines={1} on the label so long text truncates instead of
  // wrapping and pushing the box past this height.
  tab: {
    width: 110, height: 64, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive:      { borderBottomColor: '#8B5CF6' },
  tabText:        { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textAlign: 'center' },
  tabTextActive:  { color: '#8B5CF6' },
  // Stacked below the label (not inline beside it) — with 5 tabs sharing the
  // screen width, a badge competing for row space with a long label (e.g.
  // "Examiner Recs" / "המלצות בוחנים") squeezed right up against the text.
  // Stacking vertically keeps it clear of the text regardless of label length.
  badge: {
    marginTop: 4,
    backgroundColor: '#8B5CF6', borderRadius: 8, minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sortChip: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#E0E7FF',
  },
  sortChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  sortChipText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  sortChipTextActive: { color: '#fff' },

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

  // height fixed alongside width so this doesn't grow when a longer label
  // (e.g. Hebrew "גישת הגנה") wraps — numberOfLines={1} on the label Text
  // truncates instead, keeping every tab the same height.
  tab: {
    width: 110,
    height: 46,
    backgroundColor: '#F1F5FF',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  tabActive: {
    backgroundColor: '#EF4444',
  },

  tabText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
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
    marginHorizontal: 16,
    marginBottom: 14,
  },

  searchInput: {
    height: 52,
    fontSize: 14,
  },

  userFilterRow: {
    marginHorizontal: 16,
    marginBottom: 14,
  },

  userFilterRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  userFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  userFilterChipActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },

  userFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  userFilterChipTextActive: {
    color: '#fff',
  },

  userFilterDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 2,
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
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5EAFF', gap: 8 },
  // Fixed size (not flex:1) — matches admin/panel.tsx's tabsContainer; wrap
  // the row in a horizontal ScrollView so extra tabs slide into view.
  // height fixed too — numberOfLines={1} on the label keeps long text from
  // wrapping and growing this past a single line.
  tab:           { width: 110, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 18, gap: 6, overflow: 'hidden' },
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
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EDE9FE', gap: 8 },
  // Fixed size (not flex:1) — matches admin/panel.tsx's tabsContainer; wrap
  // the row in a horizontal ScrollView so extra tabs slide into view.
  // height fixed too — numberOfLines={1} on the label keeps long text from
  // wrapping and growing this past a single line.
  tab:           { width: 110, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 18, gap: 6, overflow: 'hidden' },
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
    gap: 8,
  },
  // Fixed size (not flex:1) — matches admin/panel.tsx's tabsContainer; wrap
  // the row in a horizontal ScrollView so extra tabs slide into view.
  // height fixed too — numberOfLines={1} on the label keeps long text from
  // wrapping and growing this past a single line.
  tab: {
    width: 110, height: 46, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden',
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

// ─── Auth screens ─────────────────────────────────────────────────────────────

export const Setup2faStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 20 },
  qr: { width: 200, height: 200, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, width: '100%', fontSize: 18, textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: '#4F46E5', padding: 14, borderRadius: 8, width: '100%', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error: { color: 'red', marginBottom: 8 },
  success: { fontSize: 18, color: 'green' },
});

export const SignupStyles = StyleSheet.create({
  // ... existing styles ...
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#445',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E0E8FF',
    fontSize: 16,
    color: '#111',
  },
  // Keep the rest of your styles unchanged
  root:     { flex: 1, backgroundColor: '#F0F4FF' },
  content: { padding: 20 },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight:  { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
  langRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  langBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText: { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  hero:       { alignItems: 'center', marginBottom: 32 },
  heroEmoji: { fontSize: 56, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '900', color: '#111', marginBottom: 8 },
  heroSub:    { fontSize: 14, color: '#8899BB', lineHeight: 20, textAlign: 'center' },
  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 14 },
  optionRow:     { flexDirection: 'row', gap: 12 },
  bigOption: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 18,
    alignItems: 'center', borderWidth: 2, borderColor: '#E0E8FF',
  },
  bigOptionActive:     { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' },
  bigOptionEmoji:      { fontSize: 32, marginBottom: 8 },
  bigOptionText:       { fontSize: 14, fontWeight: '700', color: '#8899BB', textAlign: 'center' },
  bigOptionTextActive:{ color: '#2E86FF' },
  majorGrid:    { gap: 8 },
  majorOption: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#E0E8FF',
  },
  majorOptionActive:  { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' },
  majorText:          { fontSize: 14, fontWeight: '600', color: '#445', marginBottom: 2 },
  majorTextActive:    { color: '#2E86FF' },
  majorYears:         { fontSize: 11, color: '#9BA8C0' },
  majorYearsActive:   { color: '#60A5FA' },
  yearRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearOption: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E8FF',
    minWidth: '45%', flex: 1,
  },
  yearOptionActive:      { borderColor: '#2E86FF', backgroundColor: '#EFF6FF' },
  yearOptionFinal:       { borderColor: '#10B981', borderStyle: 'dashed' },
  yearOptionFinalActive: { backgroundColor: '#ECFDF5', borderStyle: 'solid' },
  yearNum:               { fontSize: 15, fontWeight: '700', color: '#445', marginBottom: 4 },
  yearNumActive:         { color: '#2E86FF' },
  saveBtn: {
    backgroundColor: '#2E86FF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
});

export const Verify2faStyles = StyleSheet.create({
  container:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F0F4FF' },
  title:          { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#1a1a2e' },
  subtitle:       { textAlign: 'center', color: '#666', marginBottom: 32, lineHeight: 22 },
  input:          { borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12, padding: 16, width: '100%', fontSize: 32, textAlign: 'center', letterSpacing: 12, marginBottom: 12, backgroundColor: '#fff' },
  button:         { backgroundColor: '#2E86FF', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#a0c4ff' },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error:          { color: '#e74c3c', marginBottom: 8, textAlign: 'center' },
  recoveryLink:   { marginTop: 20, color: '#2E86FF', fontSize: 14, fontWeight: '600' },
  backLink:       { marginTop: 16, color: '#666', fontSize: 14 },
});

export const Verify2faModalStyles = StyleSheet.create({
  modal:          { flex: 1, backgroundColor: '#F0F4FF' },
  content:        { padding: 24, paddingTop: 40, alignItems: 'center' },
  title:          { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#1a1a2e' },
  body:           { textAlign: 'center', color: '#555', marginBottom: 20, lineHeight: 22 },
  input:          { borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12, padding: 16, width: '100%', fontSize: 28, textAlign: 'center', letterSpacing: 10, marginBottom: 16, backgroundColor: '#fff' },
  qr:             { width: 200, height: 200, marginBottom: 20, alignSelf: 'center' },
  button:         { backgroundColor: '#2E86FF', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 8 },
  buttonDisabled: { backgroundColor: '#a0c4ff' },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error:          { color: '#e74c3c', marginBottom: 12, textAlign: 'center' },
  link:           { color: '#2E86FF', fontSize: 14, textAlign: 'center', marginTop: 8 },
  cancelLink:     { color: '#999', fontSize: 14, textAlign: 'center', marginTop: 24 },
  rowReverse:     { flexDirection: 'row-reverse' },
  textRight:      { textAlign: 'right' },
  langRow:        { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', marginBottom: 12 },
  langBtn:        { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#D0DEFF' },
  langBtnText:    { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
});

export const ChangePasswordStyles = StyleSheet.create({
  container:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F0F4FF' },
  title:          { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: '#1a1a2e' },
  subtitle:       { textAlign: 'center', color: '#666', marginBottom: 32, lineHeight: 22 },
  input:          { borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12, padding: 14, width: '100%', fontSize: 16, marginBottom: 12, backgroundColor: '#fff' },
  button:         { backgroundColor: '#2E86FF', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#a0c4ff' },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error:          { color: '#e74c3c', marginBottom: 8, textAlign: 'center' },
  backLink:       { marginTop: 24, color: '#2E86FF', fontSize: 14 },
});

export const ResetPassStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F0F4FF' },
  content:     { flex: 1, padding: 28, justifyContent: 'center' },
  langRow:     { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  langRowRtl:  { flexDirection: 'row-reverse' },
  langBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText:    { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  hero:        { alignItems: 'center', marginBottom: 40 },
  heroEmoji:   { fontSize: 52, marginBottom: 14 },
  heroTitle:   { fontSize: 24, fontWeight: '900', color: '#111', marginBottom: 8, textAlign: 'center' },
  heroSub:     { fontSize: 14, color: '#8899BB', lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E0E8FF',
    fontSize: 16,
    color: '#111',
    marginBottom: 6,
  },
  inputFocused: { borderColor: '#2E86FF' },
  inputError:   { borderColor: '#EF4444' },
  inputSuccess: { borderColor: '#10B981' },
  errorText:   { color: '#EF4444', fontSize: 12, marginBottom: 14, textAlign: 'left' },
  errorTextRtl:{ textAlign: 'right' },
  btn: {
    backgroundColor: '#2E86FF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  backBtn:     { alignItems: 'center', marginTop: 20 },
  backText:    { color: '#8899BB', fontSize: 14, fontWeight: '600' },
  successBox: {
    backgroundColor: '#ECFDF5', borderRadius: 14, padding: 18,
    borderWidth: 1.5, borderColor: '#10B981',
    alignItems: 'center', marginBottom: 24,
  },
  successEmoji: { fontSize: 36, marginBottom: 8 },
  successTitle: { fontSize: 16, fontWeight: '800', color: '#065F46', marginBottom: 4, textAlign: 'center' },
  successSub:   { fontSize: 13, color: '#047857', textAlign: 'center', lineHeight: 19 },
});

// ─── Tabs-group screens ───────────────────────────────────────────────────────

export const NotificationsStyles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#F0F4FF' },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  alignRight: { alignItems: 'flex-end' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
  },
  backBtn:         { padding: 6, borderRadius: 10, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF' },
  backText:        { fontSize: 18, color: '#2E86FF', fontWeight: '700', paddingHorizontal: 4 },
  headerCenter:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:     { fontSize: 18, fontWeight: '800', color: '#111' },
  unreadBadge:     { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  headerRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn:         { backgroundColor: '#F0F4FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#D0DEFF' },
  langText:        { fontSize: 12, fontWeight: '700', color: '#2E86FF' },

  // height fixed on the ROW itself (not just each tab) — with flex:1 tabs
  // filling full width instead of a fixed per-tab width, this guarantees the
  // whole bar can never grow no matter what a label does; overflow hidden on
  // each tab clips instead of pushing the row taller.
  tabBar:          { flexDirection: 'row', height: 52, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E8FF', gap: 8 },
  tabBtn:          { flex: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:    { borderBottomColor: '#2E86FF' },
  tabBtnText:      { fontSize: 13, fontWeight: '600', color: '#8899BB' },
  tabBtnTextActive:{ color: '#2E86FF', fontWeight: '700' },

  toolbar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F4FF' },
  filters:          { flexDirection: 'row', gap: 8 },
  filterChip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF' },
  filterChipActive: { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  filterText:       { fontSize: 12, fontWeight: '600', color: '#8899BB' },
  filterTextActive: { color: '#fff' },
  markAllBtn:       { paddingHorizontal: 10, paddingVertical: 6 },
  markAllBtnHidden: { opacity: 0 },
  markAllText:      { fontSize: 12, color: '#2E86FF', fontWeight: '600' },

  longPressHint: { textAlign: 'center', fontSize: 11, color: '#9BA8C0', paddingVertical: 6, backgroundColor: '#F8FAFF' },

  list:      { paddingHorizontal: 14, paddingTop: 12 },
  separator: { height: 1, backgroundColor: '#F0F4FF', marginHorizontal: 16 },

  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dateLine:   { flex: 1, height: 1, backgroundColor: '#E0E8FF' },
  dateLabel:  { fontSize: 11, fontWeight: '700', color: '#8899BB', letterSpacing: 0.5 },

  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#2E86FF',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: '#2E86FF', shadowOpacity: 0.35, shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '700' },
});

export const NotificationsRowStyles = StyleSheet.create({
  card:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 3, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, position: 'relative' },
  cardUnread:  { backgroundColor: '#FAFCFF' },
  cardRtl:     { flexDirection: 'row-reverse', borderLeftWidth: 0, borderRightWidth: 3 },
  unreadDot:   { position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: 4 },
  iconBubble:  { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12, flexShrink: 0 },
  iconText:    { fontSize: 20 },
  content:     { flex: 1 },
  contentRtl:  { marginRight: 12, marginLeft: 0 },
  titleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  rowReverse:  { flexDirection: 'row-reverse' },
  textRight:   { textAlign: 'right' },
  title:       { fontSize: 13, fontWeight: '500', color: '#445', flex: 1, marginRight: 8 },
  titleBold:   { fontWeight: '700', color: '#111' },
  time:        { fontSize: 11, color: '#9BA8C0', flexShrink: 0 },
  body:        { fontSize: 12, color: '#8899BB', lineHeight: 17 },
});

export const ChatRowStyles = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14 },
  rowRtl:       { flexDirection: 'row-reverse' },
  avatar:       { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:   { color: '#fff', fontWeight: '900', fontSize: 18 },
  body:         { flex: 1 },
  topLine:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  name:         { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  time:         { fontSize: 11, color: '#9BA8C0' },
  bottomLine:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  preview:      { fontSize: 13, color: '#8899BB', flex: 1, marginRight: 8 },
  previewBold:  { color: '#111827', fontWeight: '600' },
  badge:        { backgroundColor: '#2E86FF', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  rolePill:     { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  roleText:     { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  deleteHint:   { fontSize: 18, color: '#D0DEFF', paddingLeft: 8 },
});

export const MilestoneTimelineStyles = StyleSheet.create({
  progressCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowReverse:      { flexDirection: 'row-reverse' },
  textRight:       { textAlign: 'right' },
  progressTitle:   { fontSize: 14, fontWeight: '700', color: '#111' },
  progressPct:     { fontSize: 22, fontWeight: '900', color: '#2E86FF' },
  progressTrack:   { height: 8, backgroundColor: '#E0E8FF', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill:    { height: '100%', backgroundColor: '#2E86FF', borderRadius: 4 },
  progressSub:     { fontSize: 12, color: '#8899BB' },
  timeline:        { paddingLeft: 4 },
  empty:           { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji:      { fontSize: 40, marginBottom: 12 },
  emptyText:       { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },
});

export const MilestoneCardStyles = StyleSheet.create({
  wrapper:     { flexDirection: 'row', marginBottom: 4 },
  wrapperRtl:  { flexDirection: 'row-reverse' },
  rowReverse:  { flexDirection: 'row-reverse' },
  textRight:   { textAlign: 'right' },

  // Spine
  spine:       { width: 40, alignItems: 'center' },
  dot: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1, borderWidth: 2,
  },
  dotPending:   { backgroundColor: '#F0F4FF', borderColor: '#D0DEFF' },
  dotActive:    { backgroundColor: '#EFF6FF', borderColor: '#2E86FF' },
  dotCompleted: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  dotIcon:      { fontSize: 16 },
  line:         { width: 2, flex: 1, minHeight: 20, marginVertical: 2 },
  linePending:  { backgroundColor: '#E0E8FF' },
  lineCompleted:{ backgroundColor: '#10B981' },

  // Card
  card: {
    flex: 1, marginLeft: 12, marginBottom: 16,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#2E86FF', shadowOpacity: 0.06, shadowRadius: 8, elevation: 1,
  },
  cardExpanded:   { borderColor: '#2E86FF' },
  cardCompleted:  { backgroundColor: '#FAFFFE', borderColor: '#A7F3D0' },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitleWrap:  { flex: 1, marginRight: 10 },
  cardTitle:      { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 5 },
  cardTitleCompleted: { textDecorationLine: 'none', color: '#10B981' },

  statusBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  // Countdown chip
  dateChip: {
    borderRadius: 12, padding: 8, alignItems: 'center',
    minWidth: 52, borderWidth: 1,
  },
  dateChipDays:  { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  dateChipLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  dateChipText:  { fontSize: 20, fontWeight: '900' },

  dueDate:      { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  adjustBtn:    { color: '#2E86FF', fontSize: 12, fontWeight: '600' },
  submittedDate:{ fontSize: 12, color: '#10B981', marginBottom: 4 },

  // Defense banner
  defenseBanner: {
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginTop: 6,
    borderLeftWidth: 3, borderLeftColor: '#8B5CF6',
  },
  defenseBannerText: { fontSize: 13, color: '#6B21A8', fontWeight: '500' },

  // Grade chip
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    backgroundColor: '#ECFDF5', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  gradeChipLabel: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  gradeChipValue: { fontSize: 18, fontWeight: '900', color: '#10B981' },

  // Expanded
  expandedContent: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F4FF' },
  description:     { fontSize: 13, color: '#445', lineHeight: 19, marginBottom: 14 },
  chainTitle:      { fontSize: 12, fontWeight: '700', color: '#8899BB', marginBottom: 8, letterSpacing: 0.3 },
  chainStep:       { flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 8 },
  chainDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#D0DEFF', flexShrink: 0,
  },
  chainDotDone:   { backgroundColor: '#10B981' },
  chainText:      { fontSize: 12, color: '#8899BB', flex: 1 },
  chainTextDone:  { color: '#10B981', fontWeight: '600' },

  // Grade history (read-only)
  gradeHistorySection: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F4FF' },
  gradeHistoryLine:    { fontSize: 12, color: '#8899BB', marginBottom: 4 },

  // Action buttons
  actionBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', marginTop: 14,
    shadowColor: '#2E86FF', shadowOpacity: 0.25, shadowRadius: 6, elevation: 2,
  },
  actionBtnGreen:  { backgroundColor: '#10B981', shadowColor: '#10B981' },
  actionBtnPurple: { backgroundColor: '#8B5CF6', shadowColor: '#8B5CF6' },
  actionBtnOrange: { backgroundColor: '#F97316', shadowColor: '#F97316' },
  actionBtnText:   { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Chevron
  chevron: { textAlign: 'center', color: '#C0CCDD', fontSize: 11, marginTop: 6 },

  // Date picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    width: '80%', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  modalTitle:    { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 4 },
  modalSub:      { fontSize: 13, color: '#8899BB', marginBottom: 16, textAlign: 'center' },
  modalInput: {
    width: '100%', backgroundColor: '#F0F4FF', borderRadius: 12,
    padding: 14, fontSize: 18, fontWeight: '700', color: '#111',
    borderWidth: 1, borderColor: '#D0DEFF', marginBottom: 6,
  },
  modalHint:     { fontSize: 11, color: '#9BA8C0', marginBottom: 18 },
  modalBtns:     { flexDirection: 'row', gap: 10, width: '100%' },
  modalCancelBtn:{
    flex: 1, backgroundColor: '#F0F4FF', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  modalCancelText:{ fontSize: 14, fontWeight: '600', color: '#8899BB' },
  modalSaveBtn:  {
    flex: 1, backgroundColor: '#2E86FF', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  modalSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

export const MaintenanceScreenStyles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F0F4FF' },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },

  iconWrap: {
    width: 88, height: 88,
    borderRadius: 24,
    backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  iconEmoji: { fontSize: 42 },

  heading: {
    fontSize: 26, fontWeight: '700',
    color: '#1a1a2e', textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 15, fontWeight: '500',
    color: '#7F77DD', textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 14, color: '#64748B',
    textAlign: 'center', lineHeight: 22,
    marginBottom: 32,
  },

  // Countdown
  countdownCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  countdownLabel: {
    fontSize: 11, fontWeight: '600',
    color: '#94A3B8', textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 16,
  },
  countdownRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  countdownUnit:      { alignItems: 'center', minWidth: 56 },
  countdownNum: {
    fontSize: 44, fontWeight: '700',
    color: '#1a1a2e', lineHeight: 52,
  },
  countdownUnitLabel: {
    fontSize: 11, color: '#94A3B8',
    fontWeight: '500', marginTop: 2,
  },
  countdownColon: {
    fontSize: 38, fontWeight: '700',
    color: '#CBD5E1', marginBottom: 16, paddingHorizontal: 4,
  },
  endsAtText: {
    fontSize: 12, color: '#94A3B8',
    marginTop: 14, textAlign: 'center',
  },

  // Buttons
  refreshBtn: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    minWidth: 180,
    alignItems: 'center',
    marginBottom: 16,
  },
  refreshBtnText: { color: '#fff', fontSize: 15, fontWeight: '500' },

  signOutLink: {
    color: '#94A3B8', fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});

export const TabLayoutStyles = StyleSheet.create({
  tabBar: {
    backgroundColor:  '#FFFFFF',
    borderTopWidth:   1,
    borderTopColor:   '#E0E8FF',
    height:           Platform.OS === 'ios' ? 82 : 64,
    paddingBottom:    Platform.OS === 'ios' ? 20 : 6,
    paddingTop:       6,
    elevation:        8,
    shadowColor:      '#2E86FF',
    shadowOffset:     { width: 0, height: -2 },
    shadowOpacity:    0.08,
    shadowRadius:     12,
  },
  hidden: {
    display: 'none',
    height:  0,
  },
});

export const TabIconStyles = StyleSheet.create({
  wrap:        { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  emoji:       { fontSize: 22 },
  emojiDim:    { opacity: 0.4 },
  badge: {
    position:         'absolute',
    top:              -4,
    right:            -8,
    backgroundColor:  '#EF4444',
    borderRadius:     8,
    minWidth:         16,
    height:           16,
    justifyContent:   'center',
    alignItems:       'center',
    paddingHorizontal: 3,
  },
  badgeText:    { color: '#fff', fontSize: 9, fontWeight: '800' },
  label:        { fontSize: 10, color: '#9BA8C0', fontWeight: '600', marginTop: 3 },
  // labelFocused was a hardcoded blue — the focused tab label now colors
  // itself from the signed-in user's role accent instead (see TabIcon in
  // app/(tabs)/_layout.tsx), so every role's tab reflects its own color.
});

export const NotFoundScreenStyles = StyleSheet.create({
  root:  { flex: 1, justifyContent: 'center', alignItems: 'center',
           backgroundColor: '#F0F4FF', padding: 30 },
  emoji: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  sub:   { fontSize: 14, color: '#8899BB', textAlign: 'center', lineHeight: 20 },
});

export const ThesisTemplateCardStyles = StyleSheet.create({
  downloadBtn: {
    marginTop:       12,
    backgroundColor: '#2E86FF',
    borderRadius:    10,
    paddingVertical: 12,
    alignItems:      'center',
  },
  downloadBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   14,
  },
});

export const GradeBreakdownStyles = StyleSheet.create({
  container: {
    marginTop:       12,
    paddingTop:      12,
    borderTopWidth:  1,
    borderTopColor:  '#E0E8FF',
  },
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    10,
  },
  criterionLabel: {
    fontSize:   13,
    color:      '#445',
    fontWeight: '600',
    flex:       1,
    marginRight: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  miniTrack: {
    width:           80,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#F0F4FF',
    flexDirection:   'row',
    overflow:        'hidden',
  },
  miniFill: {
    borderRadius: 4,
    height:       '100%',
  },
  scoreText: {
    fontSize:   13,
    color:      '#445',
    fontWeight: '700',
    minWidth:   50,
    textAlign:  'right',
  },
  divider: {
    height:          1,
    backgroundColor: '#E0E8FF',
    marginVertical:  8,
  },
  commentsBox: {
    marginTop:       8,
    backgroundColor: '#F8FAFF',
    borderRadius:    10,
    padding:         10,
    borderWidth:     1,
    borderColor:     '#E0E8FF',
  },
  commentsLabel: {
    fontSize:     12,
    fontWeight:   '700',
    color:        '#8899BB',
    marginBottom: 4,
  },
  commentsText: {
    fontSize:   13,
    color:      '#445',
    lineHeight: 19,
  },
});

// ─── Remaining role dashboard styles ──────────────────────────────────────────

export const FacultyAdminDashboardStyles = StyleSheet.create({
  tabBar: { padding: 10, backgroundColor: '#F3F4F6' },
  tabLabel: { fontSize: 16, fontWeight: '600' },
  deadlineRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  studentName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  value: { fontSize: 13, fontWeight: '500', color: '#111827' },
  small: { fontSize: 13, color: '#666', marginTop: 2 },
  daysLeft: { fontSize: 18, fontWeight: '700' },
});

export const AdministrativeSecretaryDashboardStyles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#FFFBEB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:   { padding: 16 },

  statsStrip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statCard:   { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statValue:  { fontSize: 22, fontWeight: '800' },
  statLabel:  { fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 2 },

  searchInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5,
                 borderColor: '#E2E8F0', padding: 12, fontSize: 14, color: '#1E293B', marginBottom: 10 },
  filterRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                 backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },

  card:          { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14,
                   borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05,
                   shadowRadius: 6, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardTitle:     { fontSize: 15, fontWeight: '700', color: '#1E293B', flex: 1 },
  cardSub:       { fontSize: 13, color: '#64748B', marginBottom: 3 },
  overduePill:   { backgroundColor: '#FEE2E2', borderRadius: 8,
                   paddingHorizontal: 7, paddingVertical: 3 },
  overduePillText:{ color: '#991B1B', fontSize: 11, fontWeight: '700' },

  metaRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 6 },
  trackPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  trackPillText: { fontSize: 11, fontWeight: '600' },
  milestoneText: { fontSize: 12, color: '#64748B' },

  defensePill:     { backgroundColor: '#EFF6FF', borderRadius: 8, padding: 8, marginBottom: 6 },
  defensePillText: { color: '#1D4ED8', fontSize: 12, fontWeight: '600' },
  noDefenseText:   { fontSize: 12, color: '#94A3B8', marginBottom: 6 },

  actionRow:     { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  actionBtn:     { flex: 1, borderRadius: 8, padding: 9, alignItems: 'center', minWidth: 90 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#64748B' },
});

export const AdministrativeSecretaryModalStyles = StyleSheet.create({
  modal:        { flex: 1, backgroundColor: '#F8FAFC' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 16 },
  contextCard:  { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginBottom: 16 },
  contextTitle: { fontSize: 14, fontWeight: '700', color: '#1E3A8A', marginBottom: 4 },
  contextSub:   { fontSize: 13, color: '#1D4ED8' },
  fieldWrap:    { marginBottom: 14 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:        { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                  padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff' },
  langRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  langBtn:      { flex: 1, borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                  padding: 10, alignItems: 'center', backgroundColor: '#fff' },
  langBtnActive:{ backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  langBtnText:  { fontSize: 14, fontWeight: '600', color: '#374151' },
  langBtnTextActive: { color: '#fff' },
  linkBox:      { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 14 },
  linkLabel:    { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 6 },
  linkText:     { fontSize: 12, color: '#1E293B', fontFamily: 'monospace' },
  btnSend:      { backgroundColor: '#F59E0B', borderRadius: 12, padding: 15,
                  alignItems: 'center', marginBottom: 10 },
  btnSendText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnCancel:    { padding: 12, alignItems: 'center' },
  btnCancelText:{ color: '#64748B', fontSize: 15 },
});

export const GradSchoolHeadDashboardStyles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F5F3FF' },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:    { padding: 16 },

  statsStrip:  { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
                 backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statCard:    { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue:   { fontSize: 22, fontWeight: '800' },
  statLabel:   { fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 2 },

  tabBar:      { flexDirection: 'row', backgroundColor: '#fff',
                 borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 },
  // Fixed size (not flex:1) — matches admin/panel.tsx's tabsContainer; wrapped
  // in a horizontal ScrollView so extra tabs slide into view.
  // height fixed too — numberOfLines={1} on the label keeps long text from
  // wrapping and growing this past a single line.
  tab:         { width: 110, height: 46, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', flexDirection: 'row',
                 justifyContent: 'center', gap: 4, overflow: 'hidden' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: '#7C3AED' },
  tabText:     { fontSize: 13, color: '#64748B' },
  tabTextActive:{ fontSize: 12, color: '#7C3AED', fontWeight: '700' },
  badge:       { backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 5,
                 paddingVertical: 1 },
  badgeText:   { color: '#fff', fontSize: 10, fontWeight: '700' },

  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
                 borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05,
                 shadowRadius: 6, elevation: 2 },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: '#64748B', marginBottom: 2 },
  cardDate:    { fontSize: 12, color: '#94A3B8' },
  row:         { flexDirection: 'row', justifyContent: 'space-between',
                 alignItems: 'center', marginBottom: 6 },
  typePill:    { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typePillText:{ fontSize: 12, fontWeight: '600' },

  actionRow:   { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove:  { flex: 1, backgroundColor: '#D1FAE5', borderRadius: 8,
                 padding: 10, alignItems: 'center' },
  btnApproveText:{ color: '#065F46', fontWeight: '700', fontSize: 13 },
  btnReturn:   { flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8,
                 padding: 10, alignItems: 'center' },
  btnReturnText:{ color: '#92400E', fontWeight: '700', fontSize: 13 },

  statsRow:    { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  miniStat:    { alignItems: 'center' },
  miniStatValue:{ fontSize: 18, fontWeight: '800' },
  miniStatLabel:{ fontSize: 10, color: '#64748B', marginTop: 2 },

  stuckBadge:     { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10,
                    paddingVertical: 4, alignSelf: 'flex-start', marginTop: 8 },
  stuckBadgeText: { color: '#991B1B', fontWeight: '600', fontSize: 12 },

  empty:     { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji:{ fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#64748B', textAlign: 'center' },
});

export const ProgramHeadDashboardStyles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0F9FF' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:   { padding: 16 },

  statsStrip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  statCard:   { flex: 1, alignItems: 'center' },
  statValue:  { fontSize: 22, fontWeight: '800' },
  statLabel:  { fontSize: 10, color: '#64748B', marginTop: 2 },

  tabBar:      { flexDirection: 'row', backgroundColor: '#fff',
                 borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 },
  // Fixed size (not flex:1) — matches admin/panel.tsx's tabsContainer; wrapped
  // in a horizontal ScrollView so extra tabs slide into view.
  // height fixed too — numberOfLines={1} on the label keeps long text from
  // wrapping and growing this past a single line.
  tab:         { width: 110, height: 46, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center',
                 flexDirection: 'row', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  tabText:     { fontSize: 13, color: '#64748B' },
  badge:       { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText:   { color: '#fff', fontSize: 10, fontWeight: '700' },

  searchInput: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5,
                 borderColor: '#E2E8F0', padding: 12, fontSize: 14,
                 color: '#1E293B', marginBottom: 10 },
  filterRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                 backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipText:{ fontSize: 12, color: '#475569', fontWeight: '600' },

  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
                 borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.05,
                 shadowRadius: 6, elevation: 2 },
  cardTitle:   { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  cardSub:     { fontSize: 13, color: '#64748B', marginBottom: 2 },
  cardDate:    { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  row:         { flexDirection: 'row', justifyContent: 'space-between',
                 alignItems: 'center', marginTop: 4 },

  overduePill:     { backgroundColor: '#FEE2E2', borderRadius: 8,
                     paddingHorizontal: 8, paddingVertical: 3 },
  overduePillText: { color: '#991B1B', fontSize: 11, fontWeight: '700' },
  trackPill:       { backgroundColor: '#EFF6FF', borderRadius: 8,
                     paddingHorizontal: 8, paddingVertical: 3 },
  trackPillText:   { color: '#1D4ED8', fontSize: 11, fontWeight: '600' },
  deadlineText:    { fontSize: 11, color: '#64748B' },

  actionRow:      { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnApprove:     { flex: 1, backgroundColor: '#D1FAE5', borderRadius: 8,
                    padding: 10, alignItems: 'center' },
  btnApproveText: { color: '#065F46', fontWeight: '700', fontSize: 13 },
  btnReturn:      { flex: 1, backgroundColor: '#FEF3C7', borderRadius: 8,
                    padding: 10, alignItems: 'center' },
  btnReturnText:  { color: '#92400E', fontWeight: '700', fontSize: 13 },

  statsRow:       { flexDirection: 'row', gap: 24, marginTop: 8 },
  miniStat:       { alignItems: 'center' },
  miniStatValue:  { fontSize: 20, fontWeight: '800' },
  miniStatLabel:  { fontSize: 11, color: '#64748B', marginTop: 2 },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: '#64748B', textAlign: 'center' },
});

export const SupervisorExtraStyles = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingTop: 50 },
  emoji: { fontSize: 44, marginBottom: 12 },
  text:  { fontSize: 15, color: '#8899BB' },
});

// ─── Misc app + message screens ───────────────────────────────────────────────

export const DefenseAccessStyles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F0F4FF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content:  { flex: 1, alignItems: 'center', padding: 24, paddingTop: 64 },
  emoji:    { fontSize: 56, marginBottom: 16 },
  title:    { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
  sub:      { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  card:     { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 20,
              shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
              borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel:{ fontSize: 13, color: '#64748B' },
  infoValue:{ fontSize: 13, color: '#1E293B', fontWeight: '600' },
  footnote: { marginTop: 16, fontSize: 12, color: '#94A3B8', textAlign: 'center' },
});

export const AccountDeletionPendingStyles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#FEF2F2', justifyContent: 'center', padding: 24 },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2' },
  card:      { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center',
               shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  emoji:     { fontSize: 48, marginBottom: 16 },
  title:     { fontSize: 20, fontWeight: '800', color: '#991B1B', textAlign: 'center', marginBottom: 12 },
  textRight: { textAlign: 'right' },
  body:      { fontSize: 15, color: '#445', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  date:      { fontSize: 14, fontWeight: '700', color: '#991B1B', textAlign: 'center', marginBottom: 24 },
  cancelBtn: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 14,
               paddingHorizontal: 32, alignItems: 'center', width: '100%', marginBottom: 12 },
  btnDisabled:{ opacity: 0.5 },
  cancelBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  signOutBtn:{ paddingVertical: 10 },
  signOutText:{ color: '#64748B', fontWeight: '600', fontSize: 14 },
});

export const InfoFilesStyles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F0F4FF' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:    { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', padding: 20, paddingBottom: 8 },
  content:   { paddingHorizontal: 20, paddingBottom: 40 },
  uploadCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  textRight: { textAlign: 'right' },
  fieldLabel: { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#E0E8FF', borderRadius: 10,
    padding: 10, fontSize: 14, backgroundColor: '#F8FAFF', color: '#111',
  },
  pickBtn: {
    marginTop: 14, borderWidth: 1, borderColor: '#2E86FF', borderStyle: 'dashed',
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  pickBtnText: { color: '#2E86FF', fontWeight: '600', fontSize: 13 },
  uploadBtn: {
    backgroundColor: '#2E86FF', borderRadius: 10, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  uploadBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  fileTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  fileMeta:  { fontSize: 11, color: '#8899BB', marginTop: 2 },
  rowReverse: { flexDirection: 'row-reverse' },

  // Visibility scoping (Faculty / Major / Degree chip pickers on upload)
  scopeBox:        { marginTop: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E0E8FF', backgroundColor: '#F8FAFF', padding: 12 },
  scopeHint:       { fontSize: 11, color: '#8899BB', marginBottom: 10 },
  scopeGroupLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipActive:     { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  chipText:       { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#fff' },

  // Per-file scope summary badge shown in the uploaded-files list
  scopeBadge:     { backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  scopeBadgeRtl:  { marginLeft: 0, marginRight: 8 },
  scopeBadgeText: { fontSize: 10, fontWeight: '600', color: '#2E86FF' },
});

export const ExaminerAccessStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F0F4FF' },
  scroll:      { padding: 20 },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Loading
  loadingText: { marginTop: 12, color: '#2E86FF', fontSize: 15 },

  // Error / status states
  errorEmoji:   { fontSize: 56, marginBottom: 16 },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  errorTitle:   { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', marginBottom: 8 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#10B981', textAlign: 'center', marginBottom: 8 },
  errorSub:     { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  metaChip:     { marginTop: 16, fontSize: 13, color: '#64748B' },

  // Header
  header:        { marginBottom: 24 },
  headerRtl:     { alignItems: 'flex-end' },
  headerTitle:   { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 4, marginTop: 48 },
  headerSub:     { fontSize: 14, color: '#64748B', marginBottom: 16 },

  // Info card
  infoCard:      { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
                   shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
                   borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel:     { fontSize: 13, color: '#64748B', flex: 1 },
  infoValue:     { fontSize: 13, color: '#1E293B', fontWeight: '600', flex: 2, textAlign: 'right' },
  infoValueAccent: { color: '#2E86FF' },
  accessNote:    { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 },

  // Accepted banner
  acceptedBanner:     { backgroundColor: '#D1FAE5', borderRadius: 10, padding: 12,
                        alignItems: 'center', marginBottom: 20 },
  acceptedBannerText: { color: '#065F46', fontWeight: '700', fontSize: 15 },

  // Section
  section:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
                   shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },

  // Download
  downloadBtn:     { backgroundColor: '#2E86FF', borderRadius: 10, padding: 14, alignItems: 'center' },
  downloadBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Criterion rows
  criterionRow:    { marginBottom: 12 },
  criterionHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  criterionLabel:  { fontSize: 14, color: '#1E293B', fontWeight: '600' },
  criterionMax:    { fontSize: 13, color: '#64748B' },
  scoreInput:      { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                     padding: 10, fontSize: 16, color: '#1E293B', textAlign: 'center' },

  // Total
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                 paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginBottom: 16 },
  totalLabel:  { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  totalScore:  { fontSize: 22, fontWeight: '800' },

  // Radio
  radioRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                      paddingHorizontal: 12, borderRadius: 8, marginBottom: 6,
                      backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  radioRowSelected: { backgroundColor: '#EFF6FF', borderColor: '#2E86FF' },
  radioCircle:      { width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                      borderColor: '#CBD5E1', marginEnd: 10 },
  radioCircleSelected: { borderColor: '#2E86FF', backgroundColor: '#2E86FF' },
  radioLabel:       { fontSize: 14, color: '#475569' },
  radioLabelSelected: { color: '#1E3A8A', fontWeight: '600' },

  // Field label
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },

  // Textarea
  textarea:   { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10,
                padding: 12, fontSize: 14, color: '#1E293B',
                minHeight: 120, textAlignVertical: 'top' },
  textRtl:    { textAlign: 'right' },

  // Action buttons
  actionBlock:  { gap: 12, marginBottom: 24 },
  declineBlock: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12, marginBottom: 24 },

  btnPrimary:     { backgroundColor: '#2E86FF', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline:     { borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 12,
                    padding: 16, alignItems: 'center', backgroundColor: '#fff' },
  btnOutlineText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnDanger:      { backgroundColor: '#EF4444', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnGhost:       { padding: 12, alignItems: 'center' },
  btnGhostText:   { color: '#64748B', fontSize: 15 },
  btnDisabled:    { opacity: 0.55 },

  // Lang toggle
  langToggle:     { position: 'absolute', top: 0, right: 0, zIndex: 10,
                    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12,
                    paddingVertical: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  langToggleText: { fontWeight: '700', fontSize: 13, color: '#374151' },
});

export const ModalScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});

export const PrivacyPolicyStyles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F0F4FF' },
  content: { padding: 20 },
  topRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  rowReverse: { flexDirection: 'row-reverse' },
  backText: { color: '#2E86FF', fontWeight: '700', fontSize: 15 },
  langBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText: { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  title: { fontSize: 24, fontWeight: '900', color: '#111', marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111', marginBottom: 6 },
  sectionBody: { fontSize: 14, color: '#445', lineHeight: 21 },
  textRight: { textAlign: 'right' },
});

export const LoginSecurityStyles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F0F4FF' },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title:          { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', textAlign: 'center', marginBottom: 12 },
  body:           { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 16 },
  detailsBox:     { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20 },
  detailLine:     { fontSize: 14, color: '#333', marginBottom: 6 },
  question:       { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  button:         { padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  yesButton:      { backgroundColor: '#2E86FF' },
  noButton:       { backgroundColor: '#e74c3c' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});

export const NewMessageStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position:             'absolute',
    bottom: 0, left: 0, right: 0,
    height:               SCREEN_H * 0.82,
    backgroundColor:      palette.bgMain,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    overflow:             'hidden',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.15,
    shadowRadius:         20,
    elevation:            20,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: palette.borderLight,
    borderRadius:    2,
    alignSelf:       'center',
    marginTop:       spacing.md,
    marginBottom:    spacing.sm,
  },
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.xl,
    paddingVertical:   spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
    backgroundColor:   palette.bgWhite,
  },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: fontWeight.heavy, color: palette.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: palette.bgMain,
    justifyContent:  'center',
    alignItems:      'center',
  },
  closeText: { fontSize: fontSize.md, color: palette.textSecondary },

  modeRow: {
    flexDirection:     'row',
    margin:            spacing.lg,
    backgroundColor:   palette.bgWhite,
    borderRadius:      radius.xl,
    borderWidth:       1,
    borderColor:       palette.borderLight,
    padding:           spacing.xxs,
    gap:               spacing.xxs,
  },
  modeBtn:           { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center', borderRadius: radius.lg },
  modeBtnActive:     { backgroundColor: palette.primary },
  modeBtnText:       { fontSize: fontSize.md, fontWeight: fontWeight.semi,  color: palette.textSecondary },
  modeBtnTextActive: { color: palette.bgWhite, fontWeight: fontWeight.bold },

  searchWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   palette.bgWhite,
    margin:            spacing.lg,
    borderRadius:      radius.xl,
    paddingHorizontal: spacing.base,
    borderWidth:       1,
    borderColor:       palette.borderLight,
    height:            48,
  },
  searchIcon:  { fontSize: 16, marginRight: spacing.sm },
  searchInput: { flex: 1, fontSize: fontSize.base, color: palette.textPrimary },
  clearSearch: { fontSize: fontSize.md, color: palette.textMuted, paddingHorizontal: spacing.sm },

  list:    { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  userRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.xl,
    padding:         spacing.base,
    marginBottom:    spacing.sm,
    borderWidth:     1,
    borderColor:     palette.borderLight,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: '#fff', fontWeight: fontWeight.black, fontSize: fontSize.xl },
  userName:   { fontSize: fontSize.base, fontWeight: fontWeight.bold,  color: palette.textPrimary },
  userEmail:  { fontSize: fontSize.sm,   color: palette.textSecondary, marginTop: 2 },
  rolePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
    marginLeft:        spacing.sm,
  },
  rolePillText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'capitalize' },

  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: spacing.md },
  emptyText:  { fontSize: fontSize.md, color: palette.textSecondary, textAlign: 'center', maxWidth: 260 },

  broadcastForm:     { padding: spacing.lg, flex: 1 },
  broadcastSubtitle: { fontSize: fontSize.md, color: palette.textSecondary, marginBottom: spacing.lg },
  fieldLabel: {
    fontSize:     fontSize.md,
    fontWeight:   fontWeight.semi,
    color:        palette.textBody,
    marginBottom: spacing.xxs,
    marginTop:    spacing.md,
  },
  input: {
    backgroundColor:   palette.bgWhite,
    borderRadius:      radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical:   spacing.md,
    fontSize:          fontSize.base,
    color:             palette.textPrimary,
    borderWidth:       1,
    borderColor:       palette.borderLight,
  },
  textarea:          { minHeight: 110, textAlignVertical: 'top' },
  sendBroadcastBtn: {
    backgroundColor: palette.primary,
    borderRadius:    radius.xl,
    paddingVertical: spacing.base,
    alignItems:      'center',
    marginTop:       spacing.xl,
    shadowColor:     palette.primary,
    shadowOpacity:   0.3,
    shadowRadius:    8,
    elevation:       3,
  },
  sendBroadcastText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.lg },
});

export const ChatScreenStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF3FF' },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E8FF',
    elevation:         3,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 1 },
    shadowOpacity:     0.06,
    shadowRadius:      4,
    gap:               12,
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#F0F4FF',
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     '#D0DEFF',
  },
  backArrow:    { fontSize: 18, color: '#2E86FF', fontWeight: '700' },
  avatar: {
    width:          44,
    height:         44,
    borderRadius:   22,
    justifyContent: 'center',
    alignItems:     'center',
  },
  avatarText:   { color: '#fff', fontWeight: '900', fontSize: 16 },
  headerInfo:   { flex: 1, justifyContent: 'center' },
  headerName: {
    fontSize:     16,
    fontWeight:   '800',
    color:        '#111827',
    marginBottom: 3,
  },
  roleBadge: {
    alignSelf:         'flex-start',
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      999,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  messagesList:  { padding: 14, paddingBottom: 20 },
  timeStamp: {
    textAlign:    'center',
    fontSize:     11,
    color:        '#9BA8C0',
    marginBottom: 8,
    marginTop:    4,
  },
  msgWrap:      { alignItems: 'flex-start', marginBottom: 6 },
  msgWrapMine:  { alignItems: 'flex-end' },
  bubble: {
    maxWidth:               '78%',
    backgroundColor:        '#fff',
    borderRadius:           18,
    borderBottomLeftRadius: 4,
    paddingHorizontal:      14,
    paddingVertical:        10,
    shadowColor:            '#000',
    shadowOpacity:          0.04,
    shadowRadius:           4,
    elevation:              1,
  },
  bubbleMine: {
    backgroundColor:         '#2E86FF',
    borderBottomLeftRadius:  18,
    borderBottomRightRadius: 4,
  },
  bubbleText:     { color: '#111', fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },

  emptyChat: {
    alignItems:    'center',
    paddingTop:    80,
    paddingBottom: 40,
  },
  emptyChatEmoji: { fontSize: 48, marginBottom: 12 },
  emptyChatText:  { fontSize: 14, color: '#9BA8C0' },

  inputBar: {
    flexDirection:   'row',
    alignItems:      'flex-end',
    padding:         12,
    gap:             10,
    borderTopWidth:  1,
    borderTopColor:  '#DCE6FF',
    backgroundColor: '#fff',
  },
  input: {
    flex:              1,
    backgroundColor:   '#F3F6FD',
    borderRadius:      20,
    paddingHorizontal: 16,
    paddingVertical:   10,
    maxHeight:         120,
    fontSize:          15,
    color:             '#111',
  },
  sendBtn: {
    width:           46,
    height:          46,
    borderRadius:    23,
    backgroundColor: '#2E86FF',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#2E86FF',
    shadowOpacity:   0.35,
    shadowRadius:    6,
    elevation:       3,
  },
  sendBtnDisabled: { backgroundColor: '#B0C8F0', shadowOpacity: 0 },
  sendIcon:        { color: '#fff', fontSize: 18, fontWeight: '700' },
});

// ─── Shared components ────────────────────────────────────────────────────────

export const TopBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E8EDF5',
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  textRight:  { textAlign: 'right' },
  left:       { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  right:      { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  name:        { fontSize: 14, fontWeight: '600', color: '#111' },
  roleBadge:   { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2, alignSelf: 'flex-start' },
  roleText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  langBtn: {
    backgroundColor: '#F0F4FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#D0DEFF',
  },
  langText:  { fontSize: 12, fontWeight: '700', color: '#2E86FF' },
  iconBtn:   { padding: 4 },
  iconBtnText: { fontSize: 18 },
  signOutBtn: {
    backgroundColor: '#FFF0F0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  signOutText: { fontSize: 12, fontWeight: '600', color: '#D32F2F' },
  hamburgerBtn: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF',
  },
  hamburgerIcon: { fontSize: 20, color: '#111' },
});

// ─── HeaderMenu — the dropdown a TopBar's hamburger button opens ──────────────
export const HeaderMenuStyles = StyleSheet.create({
  trigger: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0F4FF', borderWidth: 1, borderColor: '#D0DEFF',
  },
  triggerIcon: { fontSize: 20, color: '#111' },
  badgeDot: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeDotText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.25)' },
  panel: {
    position: 'absolute', top: 64, minWidth: 240, maxWidth: 320,
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12,
    elevation: 8,
  },
  panelRight: { right: 16 },
  panelLeft:  { left: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  rowIcon:    { fontSize: 18, width: 22, textAlign: 'center' },
  rowLabel:   { flex: 1, fontSize: 14, fontWeight: '600', color: '#1F2937' },
  rowLabelDanger: { color: '#D32F2F' },
  rowDivider: { height: 1, backgroundColor: '#F0F2F5', marginVertical: 4 },
  badge: {
    backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

export const StatCardStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    padding: 14, alignItems: 'center',
    borderTopWidth: 3,
    borderWidth: 1, borderColor: '#E0E8FF',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  emoji:      { fontSize: 24, marginBottom: 6 },
  value:      { fontSize: 26, fontWeight: '900', marginBottom: 2 },
  label:      { fontSize: 11, color: '#8899BB', fontWeight: '500', textAlign: 'center' },
  labelRight: { textAlign: 'right' },
});

export const SectionHeaderStyles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12, marginTop: 4 },
  right: { textAlign: 'right' },
});

export const FacultyBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  dot:  { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  text: { fontSize: 11, fontWeight: '600' },
});

export const StatusBadgeStyles = StyleSheet.create({
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  text:  { fontSize: 11, fontWeight: '700' },
});

export const SecurityModalStyles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#F0F4FF',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E8FF',
  },
  title:    { fontSize: 17, fontWeight: '700', color: '#111', flex: 1, textAlign: 'center' },
  backBtn:  { padding: 4, minWidth: 60 },
  backText: { fontSize: 14, color: '#2E86FF', fontWeight: '600' },
  closeBtn: { padding: 4, minWidth: 60, alignItems: 'flex-end' },
  closeText:{ fontSize: 18, color: '#8899BB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body:     { flex: 1, padding: 24 },
  textRight:{ textAlign: 'right' },

  // Status card
  statusCard: {
    borderRadius: 16, padding: 24, alignItems: 'center',
    marginBottom: 24, borderWidth: 1,
  },
  statusCardOn:  { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  statusCardOff: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  statusIcon:    { fontSize: 48, marginBottom: 12 },
  statusTitle:   { fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  statusSub:     { fontSize: 13, color: '#667', textAlign: 'center', lineHeight: 20 },
  adminNote:     { fontSize: 12, color: '#8899BB', textAlign: 'center', marginTop: 8 },

  // Setup screen
  setupTitle:    { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 8 },
  setupSub:      { fontSize: 13, color: '#667', lineHeight: 20, marginBottom: 24 },
  qr: {
    width: 200, height: 200, alignSelf: 'center',
    marginBottom: 24, borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  qrPlaceholder: {
    width: 200, height: 200, alignSelf: 'center',
    marginBottom: 24, borderRadius: 12,
    backgroundColor: '#E0E8FF',
    justifyContent: 'center', alignItems: 'center',
  },
  codeLabel: { fontSize: 14, fontWeight: '600', color: '#334', marginBottom: 10 },
  codeInput: {
    borderWidth: 2, borderColor: '#2E86FF', borderRadius: 12,
    padding: 16, fontSize: 28, letterSpacing: 10,
    backgroundColor: '#fff', marginBottom: 12,
  },
  error: { color: '#E74C3C', fontSize: 13, textAlign: 'center', marginBottom: 10 },

  // Buttons
  primaryBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnDisabled:    { backgroundColor: '#A0C4FF' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  openAuthBtn: {
    backgroundColor: '#F0F4FF', borderRadius: 12, padding: 14,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#2E86FF',
  },
  openAuthText: { color: '#2E86FF', fontWeight: '700', fontSize: 14 },
});

export const ChatbotFabStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#8B5CF6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: { fontSize: 26 },
  tooltip: {
    position: 'absolute',
    bottom: 64,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  tooltipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

export const FloatingActionMenuStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: { color: '#fff', fontSize: 30, fontWeight: '400', marginTop: -2 },
  pillWrapper: {
    position: 'absolute',
    bottom: 0,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 24, paddingVertical: 6, paddingHorizontal: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4,
    elevation: 4,
  },
  pillRtl: { flexDirection: 'row-reverse' },
  pillIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  pillIconText: { fontSize: 18 },
  pillLabel: {
    fontSize: 13, fontWeight: '700', color: '#1a1a2e',
    marginHorizontal: 10,
  },
  tooltip: {
    position: 'absolute',
    bottom: 64,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  tooltipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

export const DefenseBuildingPickerStyles = StyleSheet.create({
  row:              { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:             { minWidth: 44, alignItems: 'center', borderWidth: 1.5, borderColor: '#CBD5E1',
                       borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#fff' },
  chipSelected:     { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  chipDisabled:     { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  chipText:         { fontSize: 15, fontWeight: '700', color: '#374151' },
  chipTextSelected: { color: '#fff' },
  chipTextDisabled: { color: '#94A3B8' },
  chipSubText:      { fontSize: 8, color: '#94A3B8', marginTop: 2 },
});

export const FeedbackChatStyles = StyleSheet.create({
  root:     { flex: 1 },
  textRight:{ textAlign: 'right' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  intro: {
    fontSize: 12, color: '#64748B', lineHeight: 17,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F0F4FF',
  },

  emptyEmoji: { fontSize: 48, marginBottom: 10 },
  emptyText:  { fontSize: 14, color: '#8899BB' },

  list: { padding: 14, gap: 10 },
  bubble: {
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#E0E8FF', alignSelf: 'flex-start', maxWidth: '90%',
  },
  bubbleRtl:  { alignSelf: 'flex-end' },
  bubbleText: { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  statusTag:  { fontSize: 11, color: '#2E86FF', fontWeight: '600', marginTop: 6 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: '#E0E8FF', backgroundColor: '#fff',
  },
  composerRtl: { flexDirection: 'row-reverse' },
  input: {
    flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#1E293B',
    maxHeight: 100, backgroundColor: '#F8FAFF',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E86FF',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText:     { color: '#fff', fontSize: 18, fontWeight: '700' },
});

export const NotificationBellStyles = StyleSheet.create({
  bellBtn: { position: 'relative', padding: 6 },
  bellIcon: { fontSize: 22 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#EF4444',
    borderRadius: 10, minWidth: 18, height: 18,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

export const ThemedTextStyles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});

export const CollapsibleStyles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});

// ─── Modal components ─────────────────────────────────────────────────────────

export const EditUserModalExtraStyles = StyleSheet.create({
  roleOptionRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  roleDot: {
    width:  10,
    height: 10,
    borderRadius: 5,
  },
  sectionHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      16,
  },
  clearAllText: {
    fontSize:   13,
    color:      '#EF4444',
    fontWeight: '600',
  },
  hint: {
    fontSize:     12,
    color:        '#8899BB',
    marginBottom: 10,
    marginTop:    2,
  },
  additionalRoleBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       '#D0DEFF',
    backgroundColor:   '#F8FAFF',
    marginBottom:      8,
    gap:               10,
  },
  additionalRoleBtnActive: {
    borderColor:     '#2E86FF',
    backgroundColor: '#EBF3FF',
  },
  checkbox: {
    width:           20,
    height:          20,
    borderRadius:    6,
    borderWidth:     2,
    borderColor:     '#9BA8C0',
    alignItems:      'center',
    justifyContent:  'center',
  },
  checkboxActive: {
    borderColor:     '#2E86FF',
    backgroundColor: '#2E86FF',
  },
  checkmark: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '700',
  },
  additionalRoleText: {
    fontSize:   14,
    color:      '#374151',
    fontWeight: '500',
  },
  additionalRoleTextActive: {
    color:      '#1A5FCC',
    fontWeight: '600',
  },
  summaryBox: {
    marginTop:       10,
    padding:         12,
    backgroundColor: '#F0F7FF',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#C7DCFF',
  },
  summaryLabel: {
    fontSize:     12,
    color:        '#5577AA',
    fontWeight:   '600',
    marginBottom: 8,
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
  },
  chip: {
    backgroundColor: '#2E86FF',
    borderRadius:    20,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  chipText: {
    color:      '#fff',
    fontSize:   12,
    fontWeight: '600',
  },
  // Student Status dropdowns (Primary/Secondary) — same wrap/picker look as
  // MaintenanceModalStyles' time pickers, reused here so EditUserModal
  // doesn't need to import a second stylesheet just for this.
  pickerWrap: {
    backgroundColor: '#F8FAFF',
    borderWidth:      1.5,
    borderColor:      '#D0DEFF',
    borderRadius:     12,
    overflow:         'hidden',
    marginBottom:     10,
  },
  picker: {
    height: Platform.OS === 'ios' ? 120 : 50,
  },
});

export const PermissionsEditorModalStyles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#EEF2FF',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  close:       { fontSize: 20, color: '#8899BB' },

  countBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#F8FAFF', borderBottomWidth: 1, borderBottomColor: '#EEF2FF',
  },
  countText: { fontSize: 13, fontWeight: '700', color: '#2E86FF' },
  countHint: { fontSize: 11, color: '#8899BB' },

  groupTabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  groupTab: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', backgroundColor: '#F1F5FF',
  },
  groupTabActive:     { backgroundColor: '#2E86FF' },
  groupTabText:       { fontSize: 14, fontWeight: '700', color: '#64748B' },
  groupTabTextActive: { color: '#fff' },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  facultySection: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#EEF2FF', overflow: 'hidden',
  },
  facultyHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  facultyDot:  { width: 12, height: 12, borderRadius: 6 },
  facultyName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111' },
  facultyCount:  { fontSize: 12, fontWeight: '700', color: '#8899BB', marginRight: 4 },
  facultyChevron: { fontSize: 14, color: '#8899BB' },

  degreeBlock: { paddingHorizontal: 14, paddingBottom: 12 },
  degreeHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, marginBottom: 6,
  },
  degreeLabel:    { fontSize: 12, fontWeight: '700', color: '#374151' },
  selectAllText:  { fontSize: 11, fontWeight: '600', color: '#2E86FF' },

  permRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 2,
    borderColor: '#9BA8C0', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { borderColor: '#2E86FF', backgroundColor: '#2E86FF' },
  checkmark:      { color: '#fff', fontSize: 12, fontWeight: '700' },
  permLabel:      { fontSize: 13, color: '#374151', flex: 1 },

  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#EEF2FF', backgroundColor: '#fff',
  },
  footerNote: { fontSize: 11, color: '#9BA8C0', textAlign: 'center', marginBottom: 10 },
  doneBtn: {
    backgroundColor: '#2E86FF', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export const DeleteAccountModalStyles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#fff' },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
               padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title:     { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  closeBtn:  { padding: 4 },
  closeText: { fontSize: 20, color: '#64748B' },
  body:      { padding: 20 },
  textRight: { textAlign: 'right' },
  warning:   { fontSize: 14, color: '#991B1B', backgroundColor: '#FEE2E2', borderRadius: 10,
               padding: 14, marginBottom: 20, lineHeight: 20 },
  label:     { fontSize: 13, fontWeight: '600', color: '#445', marginBottom: 6 },
  input:     { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
               padding: 14, fontSize: 16, color: '#111', marginBottom: 8 },
  error:     { color: '#EF4444', fontSize: 13, marginBottom: 8 },
  confirmBtn:{ backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 14,
               alignItems: 'center', marginTop: 12 },
  btnDisabled:{ opacity: 0.5 },
  confirmBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText:{ color: '#64748B', fontWeight: '600', fontSize: 14 },
});

export const ScheduleDefenseModalStyles = StyleSheet.create({
  modal:        { flex: 1, backgroundColor: '#F8FAFC' },
  content:      { padding: 20, paddingBottom: 60 },
  title:        { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  subtitle:     { fontSize: 13, color: '#64748B', marginBottom: 16 },
  label:        { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 10 },
  input:        { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                  padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff' },
  saveBtn:      { backgroundColor: '#10B981', borderRadius: 12, padding: 15,
                  alignItems: 'center', marginTop: 20, marginBottom: 10 },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:    { padding: 12, alignItems: 'center' },
  cancelBtnText:{ color: '#64748B', fontSize: 15 },
});

export const NewProjectModalStyles = StyleSheet.create({
  facultyList: {
    gap:          8,
    marginBottom: 16,
  },
  facultyBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       '#D0DEFF',
    backgroundColor:   '#F8FAFF',
    gap:               8,
  },
  facultyDot: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  facultyBtnText: {
    fontSize:   14,
    color:      '#374151',
    fontWeight: '500',
    flexShrink: 1,
  },
  section: {
    marginTop:       12,
    marginBottom:    8,
    backgroundColor: '#F8FAFF',
    borderRadius:    16,
    padding:         16,
    borderWidth:     1,
    borderColor:     '#E0E8FF',
  },
  sectionTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#111827',
  },
  programBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderRadius:      12,
    borderWidth:       1.5,
    borderColor:       '#D0DEFF',
    backgroundColor:   '#fff',
    marginBottom:      8,
    gap:               10,
  },
  programBtnActive: {
    borderColor:     '#2E86FF',
    backgroundColor: '#EBF3FF',
  },
  programBtnText: {
    fontSize:   14,
    color:      '#374151',
    fontWeight: '500',
    flexShrink: 1,
  },
  programBtnTextActive: {
    color:      '#1A5FCC',
    fontWeight: '600',
  },
  programRadio: {
    width:           18,
    height:          18,
    borderRadius:    9,
    borderWidth:     2,
    borderColor:     '#9BA8C0',
    alignItems:      'center',
    justifyContent:  'center',
  },
  programRadioActive: {
    borderColor: '#2E86FF',
  },
  programRadioDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#2E86FF',
  },
  supervisorFacultyBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      12,
    borderWidth:       1.5,
    gap:               8,
    marginBottom:      16,
  },
  supervisorFacultyText: {
    fontSize:   14,
    fontWeight: '600',
  },
  supervisorFacultyLock: {
    fontSize: 13,
    marginLeft: 2,
  },
  emptyHint: {
    padding:         12,
    backgroundColor: '#FFFBEB',
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     '#FDE68A',
    marginBottom:    12,
  },
  emptyHintText: {
    fontSize: 13,
    color:    '#92400E',
  },
});

export const CriteriaModalStyles = StyleSheet.create({
  section: {
    marginTop:        20,
    marginBottom:     8,
    backgroundColor:  '#F8FAFF',
    borderRadius:     16,
    padding:          16,
    borderWidth:      1,
    borderColor:      '#E0E8FF',
  },
  sectionHeader: {
    flexDirection:    'row',
    justifyContent:  'space-between',
    alignItems:       'center',
    marginBottom:     12,
  },
  sectionTitle: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#111827',
  },
  totalBadge: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      20,
  },
  totalBadgeText: {
    fontSize:   12,
    fontWeight: '700',
  },
  warning: {
    fontSize:     12,
    color:        '#EF4444',
    marginBottom: 10,
    fontWeight:   '600',
  },
  criterionRow: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    marginBottom:  10,
  },
  criterionLabel: {
    fontSize:     11,
    color:        '#8899BB',
    fontWeight:   '600',
    marginBottom: 4,
  },
  criterionInput: {
    backgroundColor:   '#fff',
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       '#D0DEFF',
    paddingHorizontal: 10,
    paddingVertical:   8,
    fontSize:          14,
    color:             '#111',
  },
  removeBtn: {
    marginLeft:      8,
    marginBottom:    2,
    width:           32,
    height:          36,
    borderRadius:    10,
    backgroundColor: '#FEE2E2',
    justifyContent:  'center',
    alignItems:      'center',
  },
  removeBtnText: {
    color:      '#EF4444',
    fontWeight: '700',
    fontSize:   14,
  },
  addBtn: {
    marginTop:       8,
    paddingVertical: 10,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2E86FF',
    borderStyle:     'dashed',
    alignItems:      'center',
  },
  addBtnText: {
    color:      '#2E86FF',
    fontWeight: '700',
    fontSize:   14,
  },
});

export const BulkDueDateModalStyles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#F8FAFC' },
  content:  { padding: 20, paddingBottom: 60 },
  title:    { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  subtitle: { fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 18 },
  textRight:{ textAlign: 'right' },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 6 },

  projectList: { marginBottom: 8, gap: 8 },
  projectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff',
  },
  projectRowActive:    { borderColor: '#2E86FF', backgroundColor: '#EBF3FF' },
  projectRowText:      { flex: 1, fontSize: 13, color: '#334155' },
  projectRowTextActive:{ color: '#1A5FCC', fontWeight: '600' },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 2,
    borderColor: '#9BA8C0', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { borderColor: '#2E86FF', backgroundColor: '#2E86FF' },
  checkmark:      { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyText:      { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },
  selectAll:      { fontSize: 12, color: '#2E86FF', fontWeight: '600', marginBottom: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipActive:     { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  chipText:       { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#fff' },

  input: {
    borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
    padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff', marginBottom: 4,
  },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },

  submitBtn:         { backgroundColor: '#F59E0B', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:         { padding: 12, alignItems: 'center' },
  cancelBtnText:     { color: '#64748B', fontSize: 15 },
});

export const MaintenanceModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet:   { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "94%", overflow: "hidden" },

  header:      { backgroundColor: "#1a1a2e", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerIcon:  { width: 40, height: 40, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerIconText: { fontSize: 20 },
  headerTitle: { fontSize: 16, fontWeight: "500", color: "#FFFFFF", marginBottom: 2 },
  headerSub:   { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  closeBtn:    { width: 30, height: 30, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 8, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  closeBtnText:{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "500" },

  body:         { paddingBottom: 8 },
  section:      { paddingHorizontal: 20, paddingVertical: 18 },
  sectionLabel: { fontSize: 11, fontWeight: "600", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
  input:        { backgroundColor: "#F8FAFC", borderWidth: 0.5, borderColor: "#CBD5E1", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: "#0F172A", marginBottom: 6 },
  fieldHint:    { fontSize: 12, color: "#94A3B8", lineHeight: 18, marginBottom: 12 },
  divider:      { height: 0.5, backgroundColor: "#E2E8F0", marginHorizontal: 20 },

  // Role chips
  selectAllRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  selectAllBox:     { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  selectAllBoxActive:{ backgroundColor: "#1a1a2e", borderColor: "#1a1a2e" },
  selectAllCheck:   { color: "#fff", fontSize: 13, fontWeight: "700" },
  selectAllText:    { fontSize: 13, color: "#475569", fontWeight: "500" },

  rolesGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  roleChip:        { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  roleChipSelected:{ backgroundColor: "#EEF2FF", borderColor: "#7F77DD" },
  roleChipDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: "#CBD5E1" },
  roleChipDotSelected: { backgroundColor: "#7F77DD" },
  roleChipText:    { fontSize: 13, color: "#64748B", fontWeight: "500" },
  roleChipTextSelected: { color: "#4338CA" },
  roleChipCheck:   { fontSize: 12, color: "#7F77DD", fontWeight: "700" },

  warningBox:  { backgroundColor: "#FFF7ED", borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: "#FED7AA", marginTop: 8 },
  warningText: { fontSize: 12, color: "#C2410C", lineHeight: 18 },

  infoBox:  { backgroundColor: "#F0F9FF", borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: "#BAE6FD", marginTop: 10 },
  infoText: { fontSize: 12, color: "#0369A1", lineHeight: 18 },

  // Time pickers
  timeRow:      { flexDirection: "row", gap: 8 },
  timeUnit:     { flex: 1, alignItems: "center" },
  timeUnitLabel:{ fontSize: 11, fontWeight: "500", color: "#64748B", marginBottom: 4 },
  pickerWrap:   { backgroundColor: "#F8FAFC", borderWidth: 0.5, borderColor: "#CBD5E1", borderRadius: 10, overflow: "hidden", width: "100%" },
  picker:       { height: 100 },
  pickerItem:   { fontSize: 18, fontWeight: "500", color: "#0F172A" },
  hintBelow:    { fontSize: 12, color: "#7C3AED", textAlign: "center", marginTop: 10 },

  // Broadcast row
  broadcastRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F8FAFC", borderWidth: 0.5, borderColor: "#E2E8F0", borderRadius: 12, padding: 14 },
  broadcastInfo:{ flex: 1, marginRight: 12 },
  broadcastLabel:{ fontSize: 13, fontWeight: "500", color: "#0F172A", marginBottom: 2 },
  broadcastSub:  { fontSize: 11, color: "#94A3B8" },

  // Preview
  previewBox:   { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: "#7F77DD" },
  previewLabel: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  previewText:  { fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 20 },

  // Footer
  footer:          { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 8, borderTopWidth: 0.5, borderTopColor: "#E2E8F0", backgroundColor: "#FFFFFF" },
  saveBtn:         { backgroundColor: "#1a1a2e", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnDisabled: { backgroundColor: "#94A3B8" },
  saveBtnText:     { color: "#FFFFFF", fontSize: 15, fontWeight: "500" },
  cancelBtn:       { borderWidth: 0.5, borderColor: "#CBD5E1", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  cancelBtnText:   { color: "#64748B", fontSize: 14 },
});

// Student Statuses admin settings modal (system_admin only — see
// components/modals/StudentStatusesModal.tsx). Reuses MaintenanceModalStyles'
// shell (overlay/sheet/header/section/footer/save button) for the outer
// chrome and only adds the row-list-editor-specific bits here, mirroring the
// add/remove row pattern from WorkflowTemplateManager.tsx.
export const StudentStatusesModalStyles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   10,
  },
  sectionCountText: {
    fontSize:   13,
    fontWeight: '700',
    color:      '#374151',
  },
  addBtn: {
    backgroundColor:   '#2E86FF',
    borderRadius:      8,
    paddingHorizontal: 12,
    paddingVertical:   6,
  },
  addBtnText: {
    color:      '#fff',
    fontWeight: '700',
    fontSize:   13,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    backgroundColor:   '#F8FAFF',
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       '#E0E8FF',
    padding:           12,
    marginBottom:      8,
    gap:               10,
  },
  rowInputs: {
    flex: 1,
  },
  rowInput: {
    backgroundColor:   '#fff',
    borderWidth:       1,
    borderColor:       '#D0DEFF',
    borderRadius:      8,
    paddingHorizontal: 12,
    paddingVertical:   9,
    fontSize:          13,
    color:             '#0F172A',
  },
  deleteBtn: {
    width:          32,
    height:         32,
    borderRadius:   8,
    backgroundColor:'#FEF2F2',
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize:     12,
    color:        '#94A3B8',
    fontStyle:    'italic',
    marginBottom: 8,
  },
});
