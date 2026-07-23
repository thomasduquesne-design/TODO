import { asc, desc, eq } from "drizzle-orm";
import { ensureSchema, getDb } from "@/db";
import { streams } from "@/db/schema";

type StreamPayload = {
  id?: number;
  title?: string;
  owner?: string;
  dueDate?: string;
  progress?: number;
  prompt?: string;
};

function normalize(payload: StreamPayload) {
  const title = payload.title?.trim() ?? "";
  const owner = payload.owner?.trim() ?? "";
  const dueDate = payload.dueDate?.trim() ?? "";
  const progress = Math.min(100, Math.max(0, Math.round(Number(payload.progress ?? 0))));
  const prompt = payload.prompt?.trim() ?? "";

  if (!title) throw new Error("Le nom du stream est obligatoire.");
  if (!owner) throw new Error("L’owner est obligatoire.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error("La date limite est invalide.");
  }

  return { title, owner, dueDate, progress, prompt };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Une erreur est survenue.";
  return Response.json({ error: message }, { status: 400 });
}

export async function GET() {
  try {
    await ensureSchema();
    const db = getDb();
    const rows = await db
      .select()
      .from(streams)
      .orderBy(asc(streams.dueDate), desc(streams.updatedAt));
    return Response.json({ streams: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const values = normalize((await request.json()) as StreamPayload);
    await ensureSchema();
    const db = getDb();
    const [stream] = await db.insert(streams).values(values).returning();
    return Response.json({ stream }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as StreamPayload;
    if (!Number.isInteger(payload.id)) throw new Error("Stream introuvable.");

    const values = normalize(payload);
    await ensureSchema();
    const db = getDb();
    const [stream] = await db
      .update(streams)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(eq(streams.id, payload.id!))
      .returning();

    if (!stream) throw new Error("Stream introuvable.");
    return Response.json({ stream });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as StreamPayload;
    if (!Number.isInteger(payload.id)) throw new Error("Stream introuvable.");

    await ensureSchema();
    const db = getDb();
    const [deleted] = await db
      .delete(streams)
      .where(eq(streams.id, payload.id!))
      .returning({ id: streams.id });

    if (!deleted) throw new Error("Stream introuvable.");
    return Response.json({ id: deleted.id });
  } catch (error) {
    return errorResponse(error);
  }
}
