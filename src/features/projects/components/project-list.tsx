import Link from "next/link";

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

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No projects yet. Create your first workspace to start reviewing documents.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">{project.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {project.description || "No project description provided."}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {project._count.documents} docs
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
