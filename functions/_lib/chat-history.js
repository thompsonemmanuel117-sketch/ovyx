import { addFirestoreDocument } from './firebase-admin.js';

function safeId(value) {
  const candidate = String(value || '').trim();

  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

export function resolveConversationId(value) {
  return safeId(value);
}

export async function saveChatTurn({
  env,
  userId,
  conversationId,
  messages,
  result,
  requestId,
  requestedProvider,
}) {
  const uid = String(userId || '').trim();

  if (!uid) {
    throw new Error(
      'Authenticated user ID is required for chat history.'
    );
  }

  const conversation = safeId(
    conversationId
  );

  const lastUserMessage =
    [...messages]
      .reverse()
      .find(
        message =>
          message?.role === 'user'
      );

  const collection =
    'users/' +
    encodeURIComponent(uid) +
    '/aiConversations/' +
    encodeURIComponent(conversation) +
    '/messages';

  const timestamp = new Date().toISOString();

  const base = {
    conversationId: conversation,
    requestId: String(requestId || ''),
    requestedProvider:
      String(
        requestedProvider ||
          'automatic'
      ),
    routedProvider:
      String(
        result?.provider ||
          ''
      ),
    model:
      String(
        result?.model ||
          ''
      ),
    createdAt: timestamp,
  };

  const records = [
    {
      ...base,
      role: 'user',
      content: String(
        lastUserMessage?.content || ''
      ).slice(0, 30000),
    },
    {
      ...base,
      role: 'assistant',
      content: String(
        result?.text || ''
      ).slice(0, 30000),
      usage:
        result?.rawUsage ||
        null,
    },
  ];

  const savedIds =
    await Promise.all(
      records.map(
        record =>
          addFirestoreDocument(
            env,
            collection,
            record
          )
      )
    );

  return {
    conversationId: conversation,
    savedMessageIds: savedIds,
  };
}
