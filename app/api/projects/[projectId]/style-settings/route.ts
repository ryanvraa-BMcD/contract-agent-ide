import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { DEFAULT_STYLE_SETTINGS } from "@/src/types/style-settings";
import { notFound, parseJsonBody } from "@/src/lib/api-helpers";
import { updateStyleSettingsSchema } from "@/src/lib/validation";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { styleSettings: true },
  });

  if (!project) return notFound("Project");

  const settings = project.styleSettings ?? DEFAULT_STYLE_SETTINGS;

  return NextResponse.json({ styleSettings: settings });
}

export async function PUT(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  const result = await parseJsonBody(request, updateStyleSettingsSchema);
  if (result.error) return result.error;

  const { styleSettings } = result.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) return notFound("Project");

  await prisma.project.update({
    where: { id: projectId },
    data: { styleSettings: styleSettings as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ styleSettings });
}
