import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

type OrderEntry = { id: string; sortOrder: number };

function parseBody(body: unknown): OrderEntry[] {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be an object.");
  }
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.orders)) {
    throw new Error("orders must be an array.");
  }
  return payload.orders.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each order entry must be an object.");
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id.trim().length === 0) {
      throw new Error("Each order entry must have a string id.");
    }
    if (typeof e.sortOrder !== "number" || !Number.isInteger(e.sortOrder)) {
      throw new Error("Each order entry must have an integer sortOrder.");
    }
    return { id: e.id.trim(), sortOrder: e.sortOrder };
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let orders: OrderEntry[];
  try {
    orders = parseBody(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request payload." },
      { status: 400 },
    );
  }

  if (orders.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const ids = orders.map((o) => o.id);
  const docs = await prisma.document.findMany({
    where: { id: { in: ids }, projectId },
    select: { id: true },
  });
  const validIds = new Set(docs.map((d) => d.id));

  const validOrders = orders.filter((o) => validIds.has(o.id));
  if (validOrders.length === 0) {
    return NextResponse.json(
      { error: "No matching documents found for this project." },
      { status: 404 },
    );
  }

  await prisma.$transaction(
    validOrders.map((o) =>
      prisma.document.update({
        where: { id: o.id },
        data: { sortOrder: o.sortOrder },
      }),
    ),
  );

  return NextResponse.json({ updated: validOrders.length });
}
