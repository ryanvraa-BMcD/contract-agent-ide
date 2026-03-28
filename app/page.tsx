import { redirect } from "next/navigation";
import { Scale } from "lucide-react";
import { createProject, listProjects } from "@/src/features/projects/actions";
import { ProjectList } from "@/src/features/projects/components/project-list";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await listProjects();

  async function createProjectAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");
    const project = await createProject({ name, description });
    redirect(`/projects/${project.id}`);
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Scale size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Contract Agent IDE
          </h1>
          <p className="text-sm text-muted-foreground">
            Agent-assisted contract review and analysis workspace
          </p>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-[360px_1fr]">
        <form
          action={createProjectAction}
          className="rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-lg font-semibold text-card-foreground">
            New Project
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up a workspace for a contract review matter.
          </p>

          <label className="mt-4 block text-sm font-medium text-card-foreground">
            Project name
            <input
              required
              name="name"
              placeholder="Master Services Agreement Review"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-card-foreground">
            Description (optional)
            <textarea
              name="description"
              rows={4}
              placeholder="Matter context and review goals..."
              className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>

          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create project
          </button>
        </form>

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Your Projects
          </h2>
          <ProjectList projects={projects} />
        </div>
      </section>
    </div>
  );
}
