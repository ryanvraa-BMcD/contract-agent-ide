import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { notFound, parseJsonBody } from "@/src/lib/api-helpers";
import { reorderRequestSchema } from "@/src/lib/validation";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  const result = await parseJsonBody(request, reorderRequestSchema);
  if (result.error) return result.error;
  const { orders } = result.data;

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
    return notFound("No matching documents found for this project");
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
