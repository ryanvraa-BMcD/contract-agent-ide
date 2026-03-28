import Link from "next/link";
import { FileText, Clock, ChevronRight, Briefcase } from "lucide-react";

type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  _count: {
    documents: number;
  };
};

type ProjectListProps = {
  projects: ProjectListItem[];
};

function formatRelativeDate(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <Briefcase size={32} className="text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-card-foreground">
            No projects yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first workspace to start reviewing documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="group block rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/20 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors">
                  {project.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {project.description || "No project description provided."}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText size={12} />
                    {project._count.documents} doc{project._count.documents !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatRelativeDate(project.updatedAt)}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="mt-1 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary"
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
