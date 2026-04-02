import { notFound } from "next/navigation";
import { getProjectWorkspace } from "@/src/features/projects/actions";
import { WorkspaceLayout } from "@/src/features/workspace/components/workspace-layout";
import { parseStyleSettings } from "@/src/types/style-settings";
import { normalizeCitations } from "@/src/types/workspace";

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

  const styleSettings = parseStyleSettings(project.styleSettings);

  return (
    <WorkspaceLayout
      projectId={project.id}
      projectName={project.name}
      styleSettings={styleSettings}
      documents={project.documents.map((document) => ({
        id: document.id,
        title: document.title,
        role: document.role,
        originalFilename: document.originalFilename,
        originalMimeType: document.originalMimeType,
        sizeBytes: document.originalSizeBytes,
        sortOrder: document.sortOrder,
        updatedAt: document.updatedAt.toISOString(),
        activeVersion: document.activeVersion
          ? { versionNumber: document.activeVersion.versionNumber }
          : null,
        versions: document.versions.map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt.toISOString(),
          sourceLabel: version.sourceLabel,
          createdBy: version.createdBy,
          plainText: version.plainText || "",
          richJson: version.richJson ?? undefined,
        })),
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
