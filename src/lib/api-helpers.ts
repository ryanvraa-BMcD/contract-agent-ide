import { NextResponse } from "next/server";
import type { z } from "zod";

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(entity: string) {
  return NextResponse.json({ error: `${entity} not found.` }, { status: 404 });
}

export function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

/**
 * Safely parse a JSON request body and validate it against a Zod schema.
 * Returns `{ data }` on success or a pre-built NextResponse on failure.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: badRequest("Invalid JSON body.") };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const message = first ? first.message : "Invalid request payload.";
    return { error: badRequest(message) };
  }

  return { data: result.data };
}
