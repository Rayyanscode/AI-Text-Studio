import { anthropic } from "@ai-sdk/anthropic";
import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import {
  HOURLY_LIMIT,
  MAX_PROMPT_LENGTH,
  MODEL_ID,
  buildInstructions,
  estimateCostUsd,
  validateChatSettings,
} from "@/lib/content";
import {
  countGenerationsSince,
  generationsCollection,
  hourAgo,
} from "@/lib/generations";
import {
  conversationsCollection,
  conversationTitle,
  type ConversationMessage,
} from "@/lib/conversations";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function messageText(message: UIMessage) {
  return (message.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
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

  const record = (body ?? {}) as Record<string, unknown>;

  const settings = validateChatSettings(record);
  if (typeof settings === "string") {
    return textError(settings, 400);
  }

  const uiMessages = Array.isArray(record.messages)
    ? (record.messages as UIMessage[])
    : [];
  if (uiMessages.length === 0) {
    return textError("Send a message before generating.", 400);
  }

  const lastMessage = uiMessages[uiMessages.length - 1];
  const latestPrompt = lastMessage ? messageText(lastMessage) : "";
  if (lastMessage?.role !== "user" || !latestPrompt) {
    return textError("Add a prompt before generating.", 400);
  }
  if (latestPrompt.length > MAX_PROMPT_LENGTH) {
    return textError(
      `Keep each message under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`,
      400,
    );
  }

  const conversationId =
    typeof record.conversationId === "string" && record.conversationId.trim()
      ? record.conversationId.trim()
      : null;
  if (!conversationId) {
    return textError("The conversation id is missing.", 400);
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
  const modelMessages = await convertToModelMessages(uiMessages);

  const priorMessages: ConversationMessage[] = uiMessages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as ConversationMessage["role"],
      text: messageText(message),
    }));

  const result = streamText({
    model: anthropic(MODEL_ID),
    instructions: buildInstructions(settings),
    messages: modelMessages,
    onError({ error }) {
      console.error("generation stream failed:", publicModelError(error));
    },
    async onEnd({ text, usage }) {
      const output = text.trim();
      if (!output) return;

      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      const estimatedCostUsd = estimateCostUsd(inputTokens, outputTokens);

      try {
        const collection = await generationsCollection();
        await collection.insertOne({
          userId,
          type: settings.type,
          tone: settings.tone,
          language: settings.language,
          length: settings.length,
          prompt: latestPrompt,
          output,
          inputTokens,
          outputTokens,
          estimatedCostUsd,
          createdAt: new Date(),
        });
      } catch (error) {
        console.error("failed to save generation", error);
      }

      try {
        const messages: ConversationMessage[] = [
          ...priorMessages,
          { role: "assistant", text: output, inputTokens, outputTokens, estimatedCostUsd },
        ];
        const firstUser = messages.find((message) => message.role === "user");
        const now = new Date();

        const conversations = await conversationsCollection();
        await conversations.updateOne(
          { userId, clientId: conversationId },
          {
            $set: {
              title: conversationTitle(firstUser?.text ?? latestPrompt),
              type: settings.type,
              tone: settings.tone,
              language: settings.language,
              length: settings.length,
              messages,
              updatedAt: now,
            },
            $setOnInsert: {
              userId,
              clientId: conversationId,
              createdAt: now,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        console.error("failed to save conversation", error);
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
