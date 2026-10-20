'use client';

// app/message/[chatId]/page.tsx
// Ported from mobile/app/message/[chatId].tsx — the conversation itself
// lives in components/ChatConversation.tsx so the staff student-detail
// page's Messages tab can embed the same thread.

import { useParams, useSearchParams } from 'next/navigation';
import { ChatConversation } from '@/components/ChatConversation';

export default function ChatConversationPage() {
  const params = useParams<{ chatId: string }>();
  const searchParams = useSearchParams();
  return (
    <ChatConversation
      key={params.chatId}
      chatId={params.chatId}
      initialName={searchParams.get('otherName') ?? ''}
      initialRole={searchParams.get('otherRole') ?? ''}
    />
  );
}
