import { ObjectId, type WithId } from "mongodb";
import { getDb } from "./mongodb";
import type {
  ContentType,
  Language,
  Length,
  Tone,
} from "./content";

export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  role: ConversationRole;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
};

export type ConversationDoc = {
  userId: string;
  clientId: string;
  title: string;
  type: ContentType;
  tone: Tone;
  language: Language;
  length: Length;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
};

export type ConversationItem = {
  id: string;
  clientId: string;
  title: string;
  type: ContentType;
  tone: Tone;
  language: Language;
  length: Length;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};

let indexPromise: Promise<void> | null = null;

export async function conversationsCollection() {
  const collection = getDb().collection<ConversationDoc>("conversations");

  if (!indexPromise) {
    indexPromise = Promise.all([
      collection.createIndex({ userId: 1, updatedAt: -1 }),
      collection.createIndex({ userId: 1, clientId: 1 }, { unique: true }),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        indexPromise = null;
        throw error;
      });
  }

  await indexPromise;
  return collection;
}

export function serializeConversation(
  doc: WithId<ConversationDoc>,
): ConversationItem {
  return {
    id: doc._id.toString(),
    clientId: doc.clientId,
    title: doc.title,
    type: doc.type,
    tone: doc.tone,
    language: doc.language,
    length: doc.length,
    messages: doc.messages,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function conversationTitle(firstUserText: string) {
  const flat = firstUserText.replace(/\s+/g, " ").trim();
  if (!flat) return "New chat";
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

export function parseConversationId(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}
