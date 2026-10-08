import { ObjectId, type WithId } from "mongodb";
import { getDb } from "./mongodb";
import type {
  ContentType,
  GenerationItem,
  Language,
  Length,
  Tone,
} from "./content";

export type GenerationDoc = {
  userId: string;
  type: ContentType;
  tone: Tone;
  language: Language;
  length: Length;
  prompt: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: Date;
};

let indexPromise: Promise<void> | null = null;

export async function generationsCollection() {
  const collection = getDb().collection<GenerationDoc>("generations");

  if (!indexPromise) {
    indexPromise = collection
      .createIndex({ userId: 1, createdAt: -1 })
      .then(() => undefined)
      .catch((error: unknown) => {
        indexPromise = null;
        throw error;
      });
  }

  await indexPromise;
  return collection;
}

export function serializeGeneration(doc: WithId<GenerationDoc>): GenerationItem {
  return {
    id: doc._id.toString(),
    type: doc.type,
    tone: doc.tone,
    language: doc.language,
    length: doc.length,
    prompt: doc.prompt,
    output: doc.output,
    inputTokens: doc.inputTokens,
    outputTokens: doc.outputTokens,
    estimatedCostUsd: doc.estimatedCostUsd,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function countGenerationsSince(userId: string, since: Date) {
  const collection = await generationsCollection();
  return collection.countDocuments({ userId, createdAt: { $gte: since } });
}

export function hourAgo() {
  return new Date(Date.now() - 60 * 60 * 1000);
}

export function parseGenerationId(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}
