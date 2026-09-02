// lib/examinerSignature.ts
// Deterministic "digital signature" — a stylized rendering of the signer's
// own name, never drawn/uploaded/verified. Same faculty+role+major+name
// inputs always render identically; different inputs render visibly
// differently. Originally built for the Data Science examiner evaluation
// form (Project_examiner.docx); also reused for the research-proposal form's
// supervisor/coordinator sign-off (see ResearchProposalFormModal.tsx /
// SignResearchProposalModal.tsx / ProposalRecommendationModal.tsx) — `role`
// is only ever hashed, never displayed, so widening it from the original
// 'internal'|'external' examiner-panel union to a plain string is safe; the
// examiner call sites keep passing those same two literal strings unchanged.
// Follows facultyColors.ts's plain-lookup-function pattern (no state, no
// async, no storage).

const SIGNATURE_PALETTE = ['#3E6C8C', '#8A6A3B', '#736B8C', '#3F7A73', '#8C4F6B', '#6E5A99', '#5C7A3F'] as const;
// Cursive-ish stacks with real fallbacks — no custom font asset required.
const SIGNATURE_FONTS = [
  '"Segoe Script", "Brush Script MT", cursive',
  '"Lucida Handwriting", cursive',
  'Georgia, serif',
  'cursive',
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export interface ExaminerSignatureStyle {
  color: string;
  fontFamily: string;
}

export function examinerSignatureStyle(
  examinerName: string,
  facultyId: string,
  role: string,
  major: string | null,
): ExaminerSignatureStyle {
  const h = hashString(`${examinerName}|${facultyId}|${role}|${major ?? ''}`);
  return {
    color: SIGNATURE_PALETTE[h % SIGNATURE_PALETTE.length],
    fontFamily: SIGNATURE_FONTS[h % SIGNATURE_FONTS.length],
  };
}
