import { generationsCollection, parseGenerationId } from "@/lib/generations";
import { getSession } from "@/lib/session";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Sign in to delete history." }, { status: 401 });
  }

  const { id } = await context.params;
  const objectId = parseGenerationId(id);
  if (!objectId) {
    return Response.json({ error: "That history item does not exist." }, { status: 404 });
  }

  try {
    const collection = await generationsCollection();
    const result = await collection.deleteOne({
      _id: objectId,
      userId: session.user.id,
    });

    if (result.deletedCount === 0) {
      return Response.json({ error: "That history item does not exist." }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("history delete failed", error);
    return Response.json(
      { error: "Could not delete that draft. Try again." },
      { status: 503 },
    );
  }
}
