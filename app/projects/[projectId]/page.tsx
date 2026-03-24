import { notFound } from "next/navigation";
import { getProjectWorkspace } from "@/src/features/projects/actions";
import { WorkspaceLayout } from "@/src/features/workspace/components/workspace-layout";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const project = await getProjectWorkspace(projectId);

  if (!project) {
    notFound();
  }

  const thread = project.chatThreads[0] ?? null;

  const normalizeCitations = (
    value: unknown
  ): {
    documentId: string;
    versionId: string;
    chunkId: string;
    snippet: string;
  }[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.documentId === "string" &&
          typeof candidate.versionId === "string" &&
          typeof candidate.chunkId === "string" &&
          typeof candidate.snippet === "string"
        );
      })
      .map((item) => {
        const candidate = item as {
          documentId: string;
          versionId: string;
          chunkId: string;
          snippet: string;
        };
        return candidate;
      });
  };

  return (
    <WorkspaceLayout
      projectId={project.id}
      projectName={project.name}
      documents={project.documents.map((document) => ({
        id: document.id,
        title: document.title,
        originalFilename: document.originalFilename,
        sizeBytes: document.originalSizeBytes,
        updatedAt: document.updatedAt.toISOString(),
        activeVersion: document.activeVersion
          ? { versionNumber: document.activeVersion.versionNumber }
          : null,
      }))}
      threadId={thread?.id ?? null}
      initialMessages={(thread?.messages || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        citations: normalizeCitations(message.citationsJson),
      }))}
    />
  );
}

export function generateMetadata() {
  return {
    title: "Project Workspace | Contract Agent IDE",
  };
}
