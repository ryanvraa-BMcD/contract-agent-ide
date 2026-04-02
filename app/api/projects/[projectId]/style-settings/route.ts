import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { parseStyleSettings, DEFAULT_STYLE_SETTINGS } from "@/src/types/style-settings";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { styleSettings: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const settings = project.styleSettings
    ? parseStyleSettings(project.styleSettings)
    : DEFAULT_STYLE_SETTINGS;

  return NextResponse.json({ styleSettings: settings });
}

export async function PUT(request: Request, context: RouteContext) {
  const { projectId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const raw = payload.styleSettings;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "styleSettings is required." }, { status: 400 });
  }

  const settings = parseStyleSettings(raw);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { styleSettings: settings as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ styleSettings: settings });
}
