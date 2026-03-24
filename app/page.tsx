import { redirect } from "next/navigation";
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
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Contract Agent IDE</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create a project workspace and upload contracts for agent-assisted review.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-[360px_1fr]">
        <form action={createProjectAction} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">New Project</h2>
          <p className="mt-1 text-sm text-slate-600">Set up a workspace for a contract review matter.</p>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Project name
            <input
              required
              name="name"
              placeholder="Master Services Agreement Review"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            Description (optional)
            <textarea
              name="description"
              rows={4}
              placeholder="Matter context and review goals..."
              className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
            />
          </label>

          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Create project
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Your Projects</h2>
          <ProjectList projects={projects} />
        </div>
      </section>
    </div>
  );
}
