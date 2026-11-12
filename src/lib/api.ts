import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, err.issues);
  }
  console.error("[api]", err);
  return fail("Internal server error", 500);
}
