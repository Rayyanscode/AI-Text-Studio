export const CONTENT_TYPES = [
  {
    id: "blog",
    label: "Blog post",
    hint: "Topic, angle, and who it is for.",
  },
  {
    id: "product",
    label: "Product description",
    hint: "Name, features, and the buyer.",
  },
  {
    id: "email",
    label: "Email",
    hint: "Goal, recipient, and the ask.",
  },
  {
    id: "summary",
    label: "Summary",
    hint: "Paste the text you want condensed.",
  },
  {
    id: "social",
    label: "Social post",
    hint: "Topic, platform, and the point.",
  },
] as const;

export const TONES = [
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "witty", label: "Witty" },
  { id: "persuasive", label: "Persuasive" },
  { id: "friendly", label: "Friendly" },
] as const;

export const LENGTHS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
] as const;

export const LANGUAGES = [
  "English",
  "Urdu",
  "Hindi",
  "Arabic",
  "Spanish",
  "French",
  "German",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number]["id"];
export type Tone = (typeof TONES)[number]["id"];
export type Length = (typeof LENGTHS)[number]["id"];
export type Language = (typeof LANGUAGES)[number];

export type GenerationItem = {
  id: string;
  type: ContentType;
  tone: Tone;
  language: Language;
  length: Length;
  prompt: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
};

export const MAX_PROMPT_LENGTH = 8000;
export const HOURLY_LIMIT = 30;
export const MODEL_ID = "claude-haiku-5-5";
export const MODEL_LABEL = "Claude Haiku 5.5";

const INPUT_USD_PER_TOKEN = 0.1 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.5 / 1_000_000;

const LENGTH_GUIDE: Record<Length, string> = {
  short: "about 80 to 140 words",
  medium: "about 220 to 320 words",
  long: "about 550 to 750 words",
};

export type GenerationInput = {
  type: ContentType;
  tone: Tone;
  language: Language;
  length: Length;
  prompt: string;
};

export function isContentType(value: unknown): value is ContentType {
  return CONTENT_TYPES.some((item) => item.id === value);
}

export function isTone(value: unknown): value is Tone {
  return TONES.some((item) => item.id === value);
}

export function isLength(value: unknown): value is Length {
  return LENGTHS.some((item) => item.id === value);
}

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((item) => item === value);
}

export function validateGeneration(body: unknown): GenerationInput | string {
  if (!body || typeof body !== "object") {
    return "Send a prompt and the writing controls.";
  }

  const record = body as Record<string, unknown>;
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";

  if (!prompt) {
    return "Add a prompt before generating.";
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return `Keep the prompt under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`;
  }
  if (!isContentType(record.type)) {
    return "Choose a content type.";
  }
  if (!isTone(record.tone)) {
    return "Choose a tone.";
  }
  if (!isLength(record.length)) {
    return "Choose a length.";
  }
  if (!isLanguage(record.language)) {
    return "Choose a language.";
  }

  return {
    type: record.type,
    tone: record.tone,
    language: record.language,
    length: record.length,
    prompt,
  };
}

export function buildInstructions(input: GenerationInput) {
  const kind = CONTENT_TYPES.find((item) => item.id === input.type)?.label;
  const shape =
    input.type === "email"
      ? "Start with a subject line, then the email body."
      : input.type === "blog"
        ? "Open with a title, then write the post in short sections."
        : input.type === "social"
          ? "Write a ready-to-post caption. Add a few relevant hashtags only if they help."
          : input.type === "summary"
            ? "Summarize only what the user provided. Do not invent facts."
            : "Lead with a headline, then benefit-led product copy.";

  return [
    "You are Text Studio, an editor who writes finished copy.",
    `Write a ${kind}.`,
    shape,
    `Tone: ${input.tone}.`,
    `Write the entire piece in ${input.language}.`,
    `Length: ${LENGTH_GUIDE[input.length]}.`,
    "Return only the finished piece. Do not explain your choices.",
  ].join(" ");
}

export function estimateCostUsd(inputTokens: number, outputTokens: number) {
  return inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
}

export function formatCost(usd: number) {
  if (usd <= 0) return "$0.0000";
  if (usd < 0.0001) return "< $0.0001";
  return `$${usd.toFixed(4)}`;
}

export function formatTokens(count: number) {
  return count.toLocaleString();
}
