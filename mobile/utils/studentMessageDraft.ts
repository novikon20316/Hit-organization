// utils/studentMessageDraft.ts
// Hands the administrative coordinator's Students Report selection over to
// the Notifications screen's compose panel (mirrors web's
// lib/studentMessageDraft.ts). Kept in memory rather than in route params: a
// "select all" can be hundreds of ids, and names don't belong in a deep
// link. Lives as long as the app process — exactly the span of one
// "pick students → write message → send" trip.

export interface StudentMessageRecipient {
  id: string;
  name: string;
}

let recipients: StudentMessageRecipient[] = [];

export function saveStudentMessageRecipients(next: StudentMessageRecipient[]): void {
  recipients = next;
}

export function loadStudentMessageRecipients(): StudentMessageRecipient[] {
  return recipients;
}

export function clearStudentMessageRecipients(): void {
  recipients = [];
}
