import { NextResponse } from "next/server";
import { createWorkspace } from "@/lib/workspace";
import { handleError } from "@/lib/api";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/workspace
 * Creates a new workspace and returns its code. No signup, no email —
 * this is what the extension calls on first run so anyone can use it.
 */
export async function POST() {
  try {
    const user = await createWorkspace();
    return NextResponse.json(
      { code: user.code, name: user.name },
      { status: 201, headers: CORS_HEADERS },
    );
  } catch (err) {
    return handleError(err);
  }
}
