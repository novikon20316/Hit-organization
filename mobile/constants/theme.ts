import { Platform, StyleSheet } from 'react-native';

// ─── Existing Expo defaults (kept as-is) ─────────────────────────────────────

const tintColorLight = '#0a7ea4';
const tintColorDark  = '#fff';

export const Colors = {
  light: {
    text:           '#11181C',
    background:     '#fff',
    tint:           tintColorLight,
    icon:           '#687076',
    tabIconDefault: '#687076',
    tabIconSelected:tintColorLight,
  },
  dark: {
    text:           '#ECEDEE',
    background:     '#151718',
    tint:           tintColorDark,
    icon:           '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected:tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// ─── Color palette ────────────────────────────────────────────────────────────

export const palette = {
  // Backgrounds
  bgMain:        '#F0F4FF',  // student/supervisor screens
  bgAlt:         '#F3F6FF',  // admin modalRoot
  bgWhite:       '#FFFFFF',
  bgSubtle:      '#F8FAFC',  // coverNote, userPreview
  bgBlueTint:    '#EFF6FF',  // roleBadge, gradeContext
  bgTabInactive: '#F1F5FF',  // admin pill tab
  bgAmberTint:   '#FFFBEB',  // appCount badge
  bgExaminer:    '#F0FDF9',  // examiner screen bg + modal
  bgCoordinator: '#F5F0FF',  // coordinator screen bg + modal
  bgPurpleTint:  '#EDE9FE',  // coordinator scheduleBtn, dialog

  // Brand
  primary:     '#2E86FF',
  primaryDark: '#2563EB',
  purple:      '#6C5CE7',    // chip alt (browse)

  // Role accent colors
  examinerGreen:    '#10B981',
  examinerGreenDark:'#065F46',
  coordinatorPurple:'#8B5CF6',
  coordinatorPurpleDark: '#7C3AED',
  adminRed:         '#EF4444', // admin accent / tab active

  // Semantic
  success:       '#10B981',
  successBg:     '#ECFDF5',
  successBorder: '#A7F3D0',
  warning:       '#F59E0B',
  warningBg:     '#FFF7ED',
  warningBorder: '#FED7AA',
  danger:        '#EF4444',
  dangerDark:    '#DC2626',
  dangerBg:      '#FEF2F2',
  dangerBorder:  '#FECACA',
  dangerSurface: '#FEE2E2',
  orange:        '#F97316',
  notifRed:      '#FF3B30',

  // Text
  textPrimary:   '#111827',
  textBody:      '#445577',
  textSecondary: '#6B7280',
  textMuted:     '#9BA8C0',
  textBlue:      '#5577AA',
  textGray:      '#374151',

  // Borders
  borderLight:       '#E0E8FF',
  borderMid:         '#D0DEFF',
  borderBase:        '#E5E7EB',
  borderGreen:       '#D1FAE5',  // examiner cards
  borderPurpleLight: '#C4B5FD',  // coordinator scheduleBtn
  borderPurple:      '#E8E0FF',  // coordinator tabBar / card
  borderPurpleInput: '#E0E7FF',  // coordinator inputs
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────

export const spacing = {
  xxs:  4,
  xs:   6,
  sm:   8,
  md:  12,
  base:14,
  lg:  16,
  xl:  20,
  xxl: 24,
} as const;

// ─── Font sizes ───────────────────────────────────────────────────────────────

export const fontSize = {
  badge:   9,
  tiny:   10,
  xs:     11,
  sm:     12,
  md:     13,
  base:   14,
  lg:     15,
  xl:     16,
  xxl:    18,
  h3:     20,
  h2:     22,
  h1:     24,
  display:28,
} as const;

// ─── Font weights ─────────────────────────────────────────────────────────────

export const fontWeight = {
  regular: '400' as const,
  medium:  '500' as const,
  semi:    '600' as const,
  bold:    '700' as const,
  heavy:   '800' as const,
  black:   '900' as const,
};

// ─── Border radii ─────────────────────────────────────────────────────────────

export const radius = {
  xs:   6,
  sm:   8,
  md:  10,
  lg:  12,
  xl:  14,
  xxl: 16,
  card:20,
  full:999,
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const shadows = {
  none: {},
  xs: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius:  6,
    elevation:     1,
  },
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  4,
    elevation:     2,
  },
  md: {
    shadowColor:   '#2E86FF',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.07,
    shadowRadius:  8,
    elevation:     2,
  },
  blue: {
    shadowColor:   '#2E86FF',
    shadowOpacity: 0.30,
    shadowRadius:  8,
    elevation:     3,
  },
  blueLg: {
    shadowColor:   '#2E86FF',
    shadowOpacity: 0.35,
    shadowRadius:  10,
    elevation:     4,
  },
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// SHARED STYLESHEETS
// ═════════════════════════════════════════════════════════════════════════════

export const layoutStyles = StyleSheet.create({
  flex1:      { flex: 1 },
  root:       { flex: 1, backgroundColor: palette.bgMain },
  rootAlt:    { flex: 1, backgroundColor: palette.bgAlt },
  rootGreen:  { flex: 1, backgroundColor: palette.bgExaminer },
  rootPurple: { flex: 1, backgroundColor: palette.bgCoordinator },
  rootAdmin:  { flex: 1, backgroundColor: palette.bgAlt },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loader:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:    { padding: spacing.lg },
  row:        { flexDirection: 'row', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse', alignItems: 'center' },
  rowWrap:    { flexDirection: 'row', flexWrap: 'wrap' },
  rowGap:     { flex: 1 },
  textRight:  { textAlign: 'right' },
});

export const typographyStyles = StyleSheet.create({
  heroTitle:    { fontSize: fontSize.h1,  fontWeight: fontWeight.black, color: palette.textPrimary },
  heroSub:      { fontSize: fontSize.sm,  color: palette.textSecondary, marginTop: spacing.xs },
  sectionTitle: { fontSize: fontSize.xl,  fontWeight: fontWeight.heavy, color: palette.textPrimary, marginBottom: spacing.lg },
  cardTitle:    { fontSize: fontSize.lg,  fontWeight: fontWeight.bold,  color: palette.textPrimary },
  cardMeta:     { fontSize: fontSize.xs,  color: palette.textSecondary },
  fieldLabel:   { fontSize: fontSize.md,  fontWeight: fontWeight.semi,  color: palette.textBody, marginBottom: spacing.xs, marginTop: spacing.base },
  loadingText:  { marginTop: spacing.md,  color: palette.textSecondary, fontSize: fontSize.lg },
  pageTitle:    { fontSize: fontSize.h3,  fontWeight: fontWeight.black, color: palette.textPrimary, marginBottom: spacing.lg },
  sectionDivider: {
    fontSize: fontSize.md, fontWeight: fontWeight.heavy, color: palette.textSecondary,
    marginTop: spacing.xxl, marginBottom: spacing.xxs,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
});

// ─── Top bar ──────────────────────────────────────────────────────────────────

export const topBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: palette.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF5',
    ...shadows.sm,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:  { color: palette.bgWhite, fontWeight: fontWeight.bold, fontSize: fontSize.xl },
  welcomeText: { fontSize: fontSize.base, fontWeight: fontWeight.semi, color: palette.textPrimary },
  roleTag:     { fontSize: fontSize.xs, color: palette.primary, fontWeight: fontWeight.medium, marginTop: 1 },
  langToggle: {
    backgroundColor: palette.bgMain, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    marginRight: spacing.sm, borderWidth: 1, borderColor: palette.borderMid,
  },
  langText:   { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.primary },
  bellBtn:    { marginRight: spacing.sm, position: 'relative' },
  bellIcon:   { fontSize: 22 },
  badge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: palette.notifRed, borderRadius: radius.sm,
    minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  badgeText:  { color: palette.bgWhite, fontSize: fontSize.badge, fontWeight: fontWeight.heavy },
  signOutBtn: {
    backgroundColor: '#FFF0F0', borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    borderWidth: 1, borderColor: '#FFCDD2',
  },
  signOutText: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: '#D32F2F' },
});

// ─── Cards ────────────────────────────────────────────────────────────────────

export const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.xl,
    padding:         spacing.base,
    marginBottom:    spacing.md,
    borderWidth:     1,
    borderColor:     palette.borderLight,
    ...shadows.xs,
  },
  accented: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.xl,
    padding:         spacing.base,
    marginBottom:    spacing.md,
    borderLeftWidth: 4,
    borderWidth:     1,
    borderColor:     palette.borderLight,
    ...shadows.xs,
  },
  round: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.card,
    padding:         spacing.lg,
    marginBottom:    spacing.base,
  },
  section: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.card,
    padding:         spacing.lg,
    marginTop:       18,
  },
  greenCard: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.xxl,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
    borderLeftWidth: 4,
    borderWidth:     1,
    borderColor:     palette.borderGreen,
  },
  purpleCard: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.xxl,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
    borderWidth:     1,
    borderColor:     palette.borderPurple,
  },
});

// ─── Inputs ───────────────────────────────────────────────────────────────────

export const inputStyles = StyleSheet.create({
  base: {
    backgroundColor:  palette.bgWhite,
    borderRadius:     radius.lg,
    paddingHorizontal:spacing.base,
    paddingVertical:  spacing.md,
    fontSize:         fontSize.base,
    color:            palette.textPrimary,
    borderWidth:      1,
    borderColor:      palette.borderLight,
  },
  tall: {
    backgroundColor:  palette.bgWhite,
    borderRadius:     radius.xl,
    paddingHorizontal:spacing.base,
    height:           54,
    marginTop:        10,
  },
  textarea:    { textAlignVertical: 'top', minHeight: 90 },
  score:       { fontSize: fontSize.display, fontWeight: fontWeight.black, height: 70, color: palette.primary },
  searchBar: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  palette.bgWhite,
    borderRadius:     radius.xl,
    paddingHorizontal:spacing.base,
    borderWidth:      1,
    borderColor:      palette.borderLight,
    ...shadows.md,
  },
  searchInput: {
    flex: 1, paddingVertical: spacing.md,
    fontSize: fontSize.base, color: palette.textPrimary,
  },
  // Admin search box (no shadow, tall)
  adminSearchBox: {
    backgroundColor:  palette.bgWhite,
    borderRadius:     radius.xxl,
    paddingHorizontal:spacing.lg,
    marginBottom:     spacing.base,
  },
  adminSearchInput: { height: 52, fontSize: fontSize.base },
  // Coordinator / examiner inputs
  purpleInput: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.lg,
    paddingHorizontal: spacing.base,
    height:          52,
    fontSize:        fontSize.base,
    borderWidth:     1,
    borderColor:     palette.borderPurpleInput,
    marginTop:       spacing.xxs,
  },
  weightInput: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.md,
    paddingHorizontal: spacing.base,
    height:          48,
    fontSize:        fontSize.xl,
    fontWeight:      fontWeight.bold,
    borderWidth:     1,
    borderColor:     palette.borderPurpleInput,
  },
  examinerScore: {
    backgroundColor: palette.bgWhite,
    borderRadius:    radius.md,
    paddingHorizontal: spacing.base,
    height:          48,
    fontSize:        20,
    fontWeight:      fontWeight.heavy,
    color:           palette.examinerGreen,
    borderWidth:     1,
    borderColor:     palette.borderGreen,
    textAlign:       'center',
  },
});

// ─── Buttons ──────────────────────────────────────────────────────────────────

export const buttonStyles = StyleSheet.create({
  primary:        { backgroundColor: palette.primary, borderRadius: radius.xl, paddingVertical: spacing.base, alignItems: 'center', marginBottom: spacing.lg, ...shadows.blue },
  primaryText:    { color: palette.bgWhite, fontWeight: fontWeight.bold, fontSize: fontSize.lg },

  submit:         { backgroundColor: palette.primary, borderRadius: radius.xl, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xl, ...shadows.blueLg },
  submitText:     { color: palette.bgWhite, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  submitDisabled: { opacity: 0.6 },

  // Admin red submit
  submitRed:     { marginTop: spacing.xl, backgroundColor: palette.adminRed, paddingVertical: spacing.lg, borderRadius: radius.xxl, alignItems: 'center' },
  submitRedText: { color: palette.bgWhite, fontWeight: fontWeight.heavy, fontSize: fontSize.lg },

  // Examiner green submit
  submitGreen:    { backgroundColor: palette.examinerGreen, borderRadius: radius.xl, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xl },
  submitGreenText:{ color: palette.bgWhite, fontSize: fontSize.lg, fontWeight: fontWeight.bold },

  // Coordinator purple submit
  submitPurple:    { backgroundColor: palette.coordinatorPurple, borderRadius: radius.xl, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xxl },
  submitPurpleText:{ color: palette.bgWhite, fontSize: fontSize.lg, fontWeight: fontWeight.bold },

  // Cancel (text-only)
  cancel:     { borderRadius: radius.xl, paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm },
  cancelText: { color: palette.examinerGreen, fontSize: fontSize.base, fontWeight: fontWeight.semi },
  cancelPurpleText: { color: palette.coordinatorPurple, fontSize: fontSize.base, fontWeight: fontWeight.semi },

  // Decision row (approve / meeting / reject)
  approve:     { flex: 1, backgroundColor: palette.successBg,  borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: palette.successBorder },
  approveText: { color: palette.success,  fontWeight: fontWeight.bold, fontSize: fontSize.md },
  meeting:     { flex: 1, backgroundColor: palette.warningBg,  borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: palette.warningBorder },
  meetingText: { color: palette.orange,   fontWeight: fontWeight.bold, fontSize: fontSize.md },
  reject:      { flex: 1, backgroundColor: palette.dangerBg,   borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: palette.dangerBorder },
  rejectText:  { color: palette.danger,   fontWeight: fontWeight.bold, fontSize: fontSize.md },

  // Edit / delete action buttons inside cards
  actionRow:   { flexDirection: 'row', marginTop: spacing.base, gap: spacing.sm + 2 },
  actionBtn:   { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.md, alignItems: 'center' },
  editBtn:     { backgroundColor: palette.primaryDark },
  deleteBtn:   { backgroundColor: palette.dangerDark },
  actionBtnText: { color: palette.bgWhite, fontWeight: fontWeight.bold },

  // Standalone delete (surface style)
  deleteSurface:     { backgroundColor: palette.dangerSurface, borderWidth: 1, borderColor: palette.dangerBorder, paddingVertical: spacing.sm + 2, borderRadius: radius.lg, alignItems: 'center', marginTop: spacing.md },
  deleteSurfaceText: { color: palette.dangerDark, fontSize: fontSize.base, fontWeight: fontWeight.bold },

  // Admin edit button (red)
  editRed:     { backgroundColor: palette.adminRed, paddingHorizontal: spacing.lg, paddingVertical: 9, borderRadius: radius.lg },
  editRedText: { color: palette.bgWhite, fontWeight: fontWeight.bold },

  // Toggle buttons
  toggle:             { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.md, alignItems: 'center', backgroundColor: palette.bgWhite, borderWidth: 1, borderColor: palette.borderLight },
  toggleActive:       { backgroundColor: palette.primary, borderColor: palette.primary },
  toggleDisabled:     { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', opacity: 0.4 },
  toggleText:         { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: palette.textSecondary },
  toggleTextActive:   { color: palette.bgWhite },
  toggleTextDisabled: { color: '#9CA3AF' },

  // Upload
  upload:     { backgroundColor: palette.bgWhite, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 2, borderColor: palette.borderMid, borderStyle: 'dashed', alignItems: 'center' },
  uploadDone: { borderColor: '#4CAF50', borderStyle: 'solid', backgroundColor: '#F1FFF3' },
  uploadText: { fontSize: fontSize.base, color: palette.textBlue, fontWeight: fontWeight.medium },

  // Add project / add student primary button
  addBtn:     { backgroundColor: palette.primary, borderRadius: radius.xl, paddingVertical: spacing.base, alignItems: 'center', marginBottom: spacing.lg, ...shadows.blue },
  addBtnText: { color: palette.bgWhite, fontWeight: fontWeight.bold, fontSize: fontSize.lg },

  // Add student (outlined blue)
  addStudentBtn:     { marginTop: spacing.sm, backgroundColor: palette.bgBlueTint, borderWidth: 1, borderColor: '#BFDBFE', paddingVertical: spacing.sm + 2, borderRadius: radius.lg, alignItems: 'center' },
  addStudentBtnText: { color: palette.primaryDark, fontSize: fontSize.md, fontWeight: fontWeight.bold },

  // Coordinator approve
  coordinatorApprove:     { flex: 1, backgroundColor: palette.coordinatorPurple, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  coordinatorApproveText: { color: palette.bgWhite, fontWeight: fontWeight.bold, fontSize: fontSize.md },

  // Coordinator schedule
  scheduleBtn:     { backgroundColor: palette.bgPurpleTint, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md, borderWidth: 1, borderColor: palette.borderPurpleLight },
  scheduleBtnText: { color: palette.coordinatorPurpleDark, fontWeight: fontWeight.bold },

  // Grade button (dynamic bg color set inline)
  gradeBtn:     { borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', marginTop: spacing.xxs },
  gradeBtnText: { color: palette.bgWhite, fontWeight: fontWeight.bold, fontSize: fontSize.md },
});

// ─── Modal ────────────────────────────────────────────────────────────────────

export const modalStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: palette.bgMain },
  rootAlt:     { flex: 1, backgroundColor: palette.bgAlt },
  rootGreen:   { flex: 1, backgroundColor: palette.bgExaminer },
  rootPurple:  { flex: 1, backgroundColor: palette.bgCoordinator },
  content:     { padding: spacing.xl, paddingBottom: 60 },
  contentTall: { padding: spacing.xl, paddingBottom: 100 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title:       { fontSize: fontSize.h3, fontWeight: fontWeight.heavy, color: palette.textPrimary },
  titleLg:     { fontSize: fontSize.h2, fontWeight: fontWeight.black, color: palette.textPrimary },
  close:       { fontSize: fontSize.xxl, color: '#888', padding: spacing.xxs },
  closeLg:     { fontSize: 24, color: palette.textSecondary },

  // Overlay / dialog (coordinator approve confirm)
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  dialog: {
    backgroundColor: palette.bgWhite, borderRadius: radius.card,
    padding: spacing.xxl, width: '80%',
  },
  dialogTitle:   { fontSize: 17, fontWeight: fontWeight.bold, marginBottom: spacing.xl, textAlign: 'center' },
  dialogBtns:    { flexDirection: 'row', gap: spacing.md },
  dialogCancel:  { flex: 1, backgroundColor: '#F3F4F6', borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  dialogConfirm: { flex: 1, backgroundColor: palette.coordinatorPurple, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  dialogConfirmText: { color: palette.bgWhite, fontWeight: fontWeight.bold },
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export const tabStyles = StyleSheet.create({
  // Underline variant (supervisor / coordinator)
  barUnderline:           { flexDirection: 'row', backgroundColor: palette.bgWhite, borderBottomWidth: 1, borderBottomColor: palette.borderLight },
  tabUnderline:           { flex: 1, paddingVertical: spacing.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabUnderlineActive:     { borderBottomColor: palette.primary },
  tabUnderlineText:       { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: palette.textSecondary },
  tabUnderlineTextActive: { color: palette.primary },

  // Purple underline (coordinator)
  barPurple:                  { flexDirection: 'row', backgroundColor: palette.bgWhite, borderBottomWidth: 1, borderBottomColor: palette.borderPurple },
  tabPurpleActive:            { borderBottomColor: palette.coordinatorPurple },
  tabPurpleText:              { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: '#9CA3AF' },
  tabPurpleTextActive:        { color: palette.coordinatorPurple },

  // Pill variant (admin)
  barPill:           { flexDirection: 'row', backgroundColor: palette.bgWhite, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm + 2, gap: spacing.sm },
  tabPill:           { flex: 1, backgroundColor: palette.bgTabInactive, paddingVertical: spacing.md, borderRadius: radius.xl, alignItems: 'center' },
  tabPillActive:     { backgroundColor: palette.adminRed },
  tabPillText:       { color: palette.textSecondary, fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  tabPillTextActive: { color: palette.bgWhite },

  // Badge on tab
  badge:           { backgroundColor: palette.borderLight, borderRadius: radius.sm, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxs },
  badgeActive:     { backgroundColor: palette.primary },
  badgeText:       { fontSize: fontSize.tiny, fontWeight: fontWeight.heavy, color: palette.primary },
  badgePurple:     { backgroundColor: palette.coordinatorPurple },
  badgePurpleText: { color: palette.bgWhite, fontSize: fontSize.tiny, fontWeight: fontWeight.heavy },
});

// ─── Chips / badges ───────────────────────────────────────────────────────────

export const chipStyles = StyleSheet.create({
  base:       { paddingHorizontal: spacing.base, paddingVertical: 7, borderRadius: radius.full, backgroundColor: palette.bgWhite, borderWidth: 1, borderColor: palette.borderMid, marginRight: spacing.sm },
  active:     { backgroundColor: palette.primary, borderColor: palette.primary },
  activeAlt:  { backgroundColor: palette.purple,  borderColor: palette.purple },
  text:       { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: '#555' },
  textActive: { color: palette.bgWhite },
  divider:    { width: 1, height: 28, backgroundColor: palette.borderLight, marginRight: spacing.sm, alignSelf: 'center' },

  skill:      { backgroundColor: palette.bgMain, borderRadius: radius.xs, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  skillText:  { fontSize: fontSize.xs, color: palette.primary, fontWeight: fontWeight.medium },

  doc:        { backgroundColor: palette.bgBlueTint, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: 5, borderWidth: 1, borderColor: '#BFDBFE' },
  docText:    { fontSize: fontSize.sm, color: palette.primary, fontWeight: fontWeight.medium },

  // Browse Projects badges
  degreeBadge:      { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.xs },
  badgeBachelors:   { backgroundColor: '#E3F2FD' },
  badgeMasters:     { backgroundColor: '#F3E5F5' },
  badgeType:        { backgroundColor: '#E8F5E9' },
  badgeText:        { fontSize: fontSize.xs, fontWeight: fontWeight.semi, color: '#555' },

  // Stats row appCount
  appCount:     { marginTop: spacing.sm, backgroundColor: palette.bgAmberTint, borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xxs, alignSelf: 'flex-start' },
  appCountText: { fontSize: fontSize.sm, color: palette.warning, fontWeight: fontWeight.semi },

  // Role badge (admin user card)
  roleBadge:     { backgroundColor: palette.bgBlueTint, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full },
  roleBadgeText: { color: palette.primaryDark, fontWeight: fontWeight.bold, fontSize: fontSize.sm },

  // Examiner date chip
  dateChip:     { backgroundColor: palette.successBg, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: palette.successBorder },
  dateChipText: { color: palette.examinerGreenDark, fontSize: fontSize.sm, fontWeight: fontWeight.semi },

  // Examiner graded badge
  gradedBadge:     { marginTop: spacing.md, backgroundColor: '#F0FDF4', borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: palette.successBorder },
  gradedBadgeText: { color: palette.examinerGreen, fontWeight: fontWeight.bold },

  // Coordinator defense date badge
  defenseDateBadge: { backgroundColor: '#F0FDF4', borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm, borderWidth: 1, borderColor: palette.successBorder },
  defenseDateText:  { color: palette.examinerGreenDark, fontSize: fontSize.md, fontWeight: fontWeight.semi },
});

// ─── Avatar ───────────────────────────────────────────────────────────────────

export const avatarStyles = StyleSheet.create({
  sm:     { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.borderLight, justifyContent: 'center', alignItems: 'center' },
  md:     { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  textSm: { fontWeight: fontWeight.bold,  color: palette.primary, fontSize: fontSize.xl },
  textMd: { color: palette.bgWhite, fontWeight: fontWeight.black, fontSize: 18 },
});

// ─── Supervisor screen specifics ──────────────────────────────────────────────

export const supervisorStyles = StyleSheet.create({
  statsRow:  { flexDirection: 'row', padding: spacing.base, gap: spacing.sm },
  statGap:   { width: 0 },

  // Project card
  projectCard: {
    backgroundColor: palette.bgWhite, borderRadius: radius.xl, padding: spacing.base, marginBottom: spacing.md,
    borderLeftWidth: 4, borderWidth: 1, borderColor: palette.borderLight, ...shadows.xs,
  },
  cardTitle:  { fontSize: fontSize.lg, fontWeight: fontWeight.bold,  color: palette.textPrimary },
  cardMeta:   { fontSize: fontSize.xs, color: palette.textSecondary },

  // Application card
  appCard: {
    backgroundColor: palette.bgWhite, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderColor: palette.borderLight, ...shadows.xs,
  },
  appProjectLabel:   { fontSize: fontSize.sm, color: palette.textSecondary, marginBottom: spacing.xxs },
  studentAvatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.borderLight, justifyContent: 'center', alignItems: 'center' },
  studentAvatarText: { fontWeight: fontWeight.bold, color: palette.primary, fontSize: fontSize.xl },
  studentName:       { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: palette.textPrimary },
  studentEmail:      { fontSize: fontSize.sm, color: palette.textSecondary },

  coverNote:     { backgroundColor: palette.bgSubtle, borderRadius: radius.md, padding: spacing.sm + 2, marginVertical: spacing.sm, borderLeftWidth: 3, borderLeftColor: palette.borderMid },
  coverNoteText: { fontSize: fontSize.md, color: palette.textBody, fontStyle: 'italic', lineHeight: 18 },

  docsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },

  decisionRow: { flexDirection: 'row', gap: spacing.sm },

  // Grade card
  gradeCard: {
    backgroundColor: palette.bgWhite, borderRadius: radius.xl, padding: spacing.base, marginBottom: spacing.md,
    borderLeftWidth: 4, borderWidth: 1, borderColor: palette.borderLight,
  },
  gradeMilestoneType: { fontSize: fontSize.md, fontWeight: fontWeight.heavy, marginBottom: spacing.xxs, letterSpacing: 0.3 },
  gradeProjectTitle:  { fontSize: fontSize.base, fontWeight: fontWeight.semi, color: palette.textPrimary, marginBottom: spacing.xxs },
  gradeStudents:      { fontSize: fontSize.sm, color: palette.textSecondary, marginBottom: spacing.xxs },
  gradeDate:          { fontSize: fontSize.sm, color: palette.textSecondary, marginBottom: spacing.xxs },
  filesNote:          { fontSize: fontSize.sm, color: palette.textBlue, marginBottom: spacing.xxs },
  submissionNote:     { fontSize: fontSize.sm, color: palette.textBody, fontStyle: 'italic', marginBottom: spacing.sm + 2 },

  // Grade modal context box
  gradeContext:      { backgroundColor: palette.bgBlueTint, borderRadius: radius.lg, padding: spacing.base, marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: palette.primary },
  gradeContextTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.heavy, color: palette.textPrimary, marginBottom: spacing.xxs },
  gradeContextSub:   { fontSize: fontSize.md, color: palette.textBlue, marginBottom: 2 },

  // Faculty dot (shared)
  facultyDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  facultyOption: { backgroundColor: palette.bgWhite, borderRadius: radius.xl, padding: spacing.base, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  facultyOptionActive: { backgroundColor: palette.adminRed },
});

// ─── Browse Projects screen ───────────────────────────────────────────────────

export const browseStyles = StyleSheet.create({
  resultsCount:   { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, fontSize: fontSize.sm, color: palette.textSecondary, fontWeight: fontWeight.medium },
  list:           { paddingHorizontal: spacing.base },
  empty:          { alignItems: 'center', paddingTop: 60 },
  emptyEmoji:     { fontSize: 48, marginBottom: spacing.md },
  emptyText:      { fontSize: fontSize.lg, color: palette.textSecondary },
  badges:         { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.xs },
  cardHeader:     { marginBottom: spacing.sm },
  cardSupervisor: { fontSize: fontSize.md, color: palette.textBlue, marginBottom: spacing.sm },
  skillsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xxs },
  moreSkills:     { fontSize: fontSize.xs, color: palette.textMuted, alignSelf: 'center' },
  expanded:       { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.bgMain },
  descText:       { fontSize: fontSize.md, color: palette.textBody, lineHeight: 20, marginBottom: spacing.lg },
  applyBtn:       { backgroundColor: palette.primary, borderRadius: radius.lg, paddingVertical: 13, alignItems: 'center', ...shadows.blue },
  applyBtnText:   { color: palette.bgWhite, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  applyProjectInfo: { backgroundColor: palette.bgWhite, borderRadius: radius.lg, padding: spacing.base, marginBottom: spacing.xl, borderLeftWidth: 4, borderLeftColor: palette.primary },
  applyForLabel:    { fontSize: fontSize.sm, color: '#888', marginBottom: spacing.xxs },
  applyProjectTitle:{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: palette.textPrimary },
  applyMessage:        { marginTop: spacing.base, padding: spacing.md, borderRadius: radius.md, textAlign: 'center', fontSize: fontSize.base },
  applyMessageSuccess: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  applyMessageError:   { backgroundColor: '#FFEBEE', color: '#C62828' },
});

// ─── Admin panel screen ───────────────────────────────────────────────────────

export const adminStyles = StyleSheet.create({
  hero:         { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 18, backgroundColor: palette.bgWhite },
  heroTitle:    { fontSize: fontSize.h1, fontWeight: fontWeight.black, color: palette.textPrimary },
  heroSub:      { marginTop: spacing.xs, fontSize: fontSize.md, color: palette.textSecondary },

  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },

  sectionCard:  { backgroundColor: palette.bgWhite, borderRadius: radius.card, padding: spacing.lg, marginTop: 18 },
  sectionTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.heavy, color: palette.textPrimary, marginBottom: spacing.lg },

  // Faculty bar chart
  facultyRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  facultyDot:   { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  facultyText:  { width: 90, fontWeight: fontWeight.bold, color: palette.textPrimary, fontSize: fontSize.sm },
  facultyBar:   { flex: 1, height: 8, backgroundColor: palette.borderBase, borderRadius: radius.full, overflow: 'hidden' },
  facultyFill:  { height: '100%', borderRadius: radius.full },
  facultyCount: { width: 40, textAlign: 'right', fontWeight: fontWeight.heavy, color: palette.textPrimary },

  // User card
  userCard:   { backgroundColor: palette.bgWhite, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.base },
  userTop:    { flexDirection: 'row', alignItems: 'center' },
  userName:   { fontSize: fontSize.lg, fontWeight: fontWeight.heavy, color: palette.textPrimary },
  userEmail:  { marginTop: 2, color: palette.textSecondary, fontSize: fontSize.sm },
  userBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.base },

  // Project card (admin)
  projectCard:   { backgroundColor: palette.bgWhite, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.base },
  projectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  projectTitle:  { fontSize: fontSize.lg, fontWeight: fontWeight.heavy, color: palette.textPrimary, marginBottom: spacing.sm },
  projectMeta:   { color: palette.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.xxs },

  // Milestone card (admin)
  milestoneCard: { backgroundColor: palette.bgWhite, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.base, borderLeftWidth: 5, borderLeftColor: palette.warning },
  milestoneType: { fontSize: fontSize.md, fontWeight: fontWeight.black, color: palette.warning },

  // Add student modal header
  addStudentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.borderBase },
  addStudentTitle:    { fontSize: fontSize.xxl, fontWeight: fontWeight.black, color: palette.textPrimary },
  addStudentSubtitle: { fontSize: fontSize.sm, color: palette.textSecondary, marginTop: spacing.xxs, maxWidth: 260 },
  addStudentSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.bgWhite, marginHorizontal: spacing.lg, marginVertical: spacing.md, borderRadius: radius.xl, paddingHorizontal: spacing.base, borderWidth: 1, borderColor: palette.borderLight, height: 52 },
  addStudentSearchIcon:  { fontSize: fontSize.xl, marginRight: spacing.sm },
  addStudentSearchInput: { flex: 1, fontSize: fontSize.base, color: palette.textPrimary },

  // Student picker card
  studentPickerCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.bgWhite, borderRadius: radius.xxl, padding: spacing.base, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.borderBase },
  studentPickerName:  { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: palette.textPrimary },
  studentPickerEmail: { fontSize: fontSize.sm, color: palette.textSecondary, marginTop: 2 },
  studentPickerArrow: { fontSize: 22, color: '#D1D5DB', fontWeight: fontWeight.regular },

  // Faculty picker grid
  facultyGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  facultyPickerBtn:  { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.bgWhite, borderRadius: radius.lg, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: palette.borderLight, marginBottom: spacing.xxs },
  facultyPickerDot:  { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  facultyPickerText: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: palette.textGray },

  // Supervisor pill picker
  supOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: '#f0f0f0', marginRight: spacing.sm + 2, borderWidth: 1, borderColor: '#ddd', minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  supOptionActive: { backgroundColor: palette.bgWhite, borderColor: '#ff4444', borderWidth: 2, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 2 },

  // User preview
  userPreview:      { backgroundColor: '#F8FAFF', borderRadius: radius.xl, padding: spacing.base, marginTop: spacing.lg, borderWidth: 1, borderColor: palette.borderLight },
  userPreviewTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  userPreviewRow:   { fontSize: fontSize.md, color: palette.textGray, marginBottom: spacing.xxs, fontWeight: fontWeight.medium },

  // Role / major options
  roleOption:           { backgroundColor: palette.bgWhite, borderRadius: radius.xl, paddingVertical: spacing.base, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  roleOptionActive:     { backgroundColor: palette.adminRed },
  roleOptionText:       { color: palette.textPrimary, fontWeight: fontWeight.bold },
  roleOptionTextActive: { color: palette.bgWhite },

  majorOption:          { backgroundColor: palette.bgWhite, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: palette.borderLight },
  majorOptionActive:    { backgroundColor: palette.bgBlueTint, borderColor: palette.primaryDark, borderWidth: 1.5 },
  majorOptionInner:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  majorOptionText:      { fontSize: fontSize.base, fontWeight: fontWeight.semi, color: palette.textGray },
  majorOptionTextActive:{ color: palette.primaryDark },
  majorOptionSub:       { fontSize: fontSize.xs, color: palette.textMuted, marginTop: 3 },
  majorOptionSubActive: { color: '#93C5FD' },
  majorCheckmark:       { color: palette.primaryDark, fontWeight: fontWeight.heavy, fontSize: fontSize.xl },
});

// ─── Examiner screen specifics ────────────────────────────────────────────────

export const examinerStyles = StyleSheet.create({
  criterionRow:   { marginBottom: spacing.lg },
  criterionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  criterionLabel: { fontSize: fontSize.base, fontWeight: fontWeight.semi, color: palette.textGray },
  criterionMax:   { fontSize: fontSize.sm, color: '#9CA3AF' },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.lg, paddingVertical: spacing.base, backgroundColor: palette.bgWhite, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  totalLabel:     { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: palette.textGray },
  totalScore:     { fontSize: fontSize.display, fontWeight: fontWeight.black },
  context:        { backgroundColor: palette.successBg, borderRadius: radius.lg, padding: spacing.base, marginBottom: spacing.xl, borderLeftWidth: 3, borderLeftColor: palette.examinerGreen },
  contextTitle:   { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: palette.textPrimary, marginBottom: spacing.xxs },
  contextSub:     { fontSize: fontSize.md, color: palette.examinerGreenDark, marginBottom: 2 },
  fieldLabel:     { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: palette.textGray, marginBottom: spacing.sm },
  textarea:       { backgroundColor: palette.bgWhite, borderRadius: radius.lg, paddingHorizontal: spacing.base, paddingVertical: spacing.md, fontSize: fontSize.base, color: palette.textPrimary, borderWidth: 1, borderColor: palette.borderGreen, textAlignVertical: 'top', minHeight: 100 },
});

// ─── Coordinator screen specifics ─────────────────────────────────────────────

export const coordinatorStyles = StyleSheet.create({
  examinerOption:       { backgroundColor: palette.bgWhite, borderRadius: radius.lg, padding: spacing.base, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.borderPurpleInput },
  examinerOptionActive: { backgroundColor: palette.coordinatorPurple, borderColor: palette.coordinatorPurple },
  examinerOptionText:   { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: palette.textGray },
  weightLabel:          { fontSize: fontSize.sm, color: palette.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xxs },
  weightSum:            { marginTop: spacing.md, fontSize: fontSize.base, fontWeight: fontWeight.heavy, color: palette.coordinatorPurple, textAlign: 'center' },
  fieldLabel:           { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: palette.textGray, marginTop: spacing.lg, marginBottom: spacing.sm },
});

// ─── Shared empty state ───────────────────────────────────────────────────────

export const emptyStyles = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingTop: 50 },
  emoji: { fontSize: 44, marginBottom: spacing.md },
  text:  { fontSize: fontSize.lg, color: palette.textSecondary },
  wrapLg:    { alignItems: 'center', paddingTop: 80 },
  emojiLg:   { fontSize: 44, marginBottom: spacing.md },
  textMuted: { fontSize: fontSize.lg, color: '#9CA3AF' },
});