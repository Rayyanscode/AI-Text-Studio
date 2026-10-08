import { HOURLY_LIMIT } from "@/lib/content";
import {
  countGenerationsSince,
  generationsCollection,
  hourAgo,
  serializeGeneration,
} from "@/lib/generations";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in to view history." }, { status: 401 });
  }

  try {
    const collection = await generationsCollection();
    const [docs, usedThisHour] = await Promise.all([
      collection
        .find({ userId: session.user.id })
        .sort({ createdAt: -1 })
        .limit(40)
        .toArray(),
      countGenerationsSince(session.user.id, hourAgo()),
    ]);

    return Response.json({
      items: docs.map(serializeGeneration),
      usedThisHour,
      hourlyLimit: HOURLY_LIMIT,
    });
  } catch (error) {
    console.error("history fetch failed", error);
    return Response.json(
      { error: "Could not load history. Check that MongoDB is running." },
      { status: 503 },
    );
  }
}
