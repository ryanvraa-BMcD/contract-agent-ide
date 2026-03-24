import { prisma } from "@/src/lib/prisma";
import { createProjectSchema } from "@/src/lib/validation";

export async function listProjects() {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { documents: true } },
    },
  });
}

export async function createProject(input: { name: string; description?: string }) {
  const parsed = createProjectSchema.parse(input);

  return prisma.project.create({
    data: {
      name: parsed.name,
      description: parsed.description || null,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

export async function getProjectWorkspace(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      documents: {
        orderBy: { updatedAt: "desc" },
        include: {
          activeVersion: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            select: {
              id: true,
              versionNumber: true,
              createdAt: true,
              sourceLabel: true,
              createdBy: true,
              plainText: true,
            },
          },
        },
      },
      chatThreads: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 50,
          },
        },
      },
    },
  });
}
