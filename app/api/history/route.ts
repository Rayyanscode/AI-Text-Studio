import { HOURLY_LIMIT } from "@/lib/content";
import { countGenerationsSince, hourAgo } from "@/lib/generations";
import {
  conversationsCollection,
  serializeConversation,
} from "@/lib/conversations";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in to view history." }, { status: 401 });
  }

  try {
    const collection = await conversationsCollection();
    const [docs, usedThisHour] = await Promise.all([
      collection
        .find({ userId: session.user.id })
        .sort({ updatedAt: -1 })
        .limit(40)
        .toArray(),
      countGenerationsSince(session.user.id, hourAgo()),
    ]);

    return Response.json({
      items: docs.map(serializeConversation),
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
