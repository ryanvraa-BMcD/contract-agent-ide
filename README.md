# Contract Agent IDE

A Next.js App Router + TypeScript workspace for legal-document review.  
This project includes project creation, `.docx` upload metadata capture, a 3-pane review UI, and stubbed chat/agent run flows backed by Prisma + Postgres.

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL

## Domain Models

The Prisma schema defines:

- `Project`
- `Document`
- `DocumentVersion`
- `ChatThread`
- `ChatMessage`
- `AgentRun`
- `EditProposal`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
cp .env.example .env
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run database migrations (after pointing `DATABASE_URL` to a live Postgres instance):

```bash
npm run prisma:migrate:dev -- --name init
```

5. Start the app:

```bash
npm run dev
```

## Key Routes

- `/` - create and browse projects
- `/projects/:projectId` - 3-pane project workspace
- `POST /api/projects/:projectId/upload` - `.docx` upload metadata stub endpoint
- `POST /api/projects/:projectId/chat` - chat + agent run stub endpoint

## Notes on Stubs

- Upload endpoint currently stores **metadata only**; blob/object storage integration is intentionally stubbed.
- Chat endpoint stores user/assistant messages and `AgentRun` records with deterministic placeholder responses.
- Center pane is an editor/viewer placeholder for future document rendering and compare tooling.
