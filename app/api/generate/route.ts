import { anthropic } from "@ai-sdk/anthropic";
import {
  APICallError,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import {
  HOURLY_LIMIT,
  MODEL_ID,
  buildInstructions,
  estimateCostUsd,
  validateGeneration,
} from "@/lib/content";
import {
  countGenerationsSince,
  generationsCollection,
  hourAgo,
} from "@/lib/generations";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function publicModelError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const body = APICallError.isInstance(error) ? (error.responseBody ?? "") : "";
  const combined = `${message} ${body}`;

  if (/credit_balance_exhausted|insufficient_quota|no credits remaining|low.?balance/i.test(combined)) {
    return "This Anthropic API key has no credits left. Add billing credit, then try again.";
  }
  if (APICallError.isInstance(error) && error.statusCode === 401) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (/model .*not found|does not exist|invalid_model|not_found_error/i.test(combined)) {
    return "The writing model is unavailable right now.";
  }
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return "Anthropic is rate limiting requests. Wait a moment and try again.";
  }

  return "The draft could not be finished. Try again.";
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return textError("Sign in to generate text.", 401);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return textError("The Anthropic API key is missing on the server.", 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return textError("The request body must be JSON.", 400);
  }

  const input = validateGeneration(body);
  if (typeof input === "string") {
    return textError(input, 400);
  }

  try {
    const used = await countGenerationsSince(session.user.id, hourAgo());
    if (used >= HOURLY_LIMIT) {
      return textError(
        `You have used ${HOURLY_LIMIT} generations this hour. Try again later.`,
        429,
      );
    }
  } catch (error) {
    console.error("generation quota check failed", error);
    return textError("The database is unavailable. Check that MongoDB is running.", 503);
  }

  const userId = session.user.id;
  const result = streamText({
    model: anthropic(MODEL_ID),
    instructions: buildInstructions(input),
    prompt: input.prompt,
    onError({ error }) {
      console.error("generation stream failed:", publicModelError(error));
    },
    async onEnd({ text, usage }) {
      const output = text.trim();
      if (!output) return;

      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;

      try {
        const collection = await generationsCollection();
        await collection.insertOne({
          userId,
          type: input.type,
          tone: input.tone,
          language: input.language,
          length: input.length,
          prompt: input.prompt,
          output,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
          createdAt: new Date(),
        });
      } catch (error) {
        console.error("failed to save generation", error);
      }
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: publicModelError,
    }),
  });
}
