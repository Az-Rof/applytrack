import { getCurrentUser } from "@/lib/auth";
import {
  changeStatus,
  deleteApplication,
  getApplication,
  updateApplication,
} from "@/lib/services/applications";
import {
  changeStatusSchema,
  updateApplicationSchema,
} from "@/lib/validation";
import { fail, handleError, ok } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const application = await getApplication(user.id, id);
    if (!application) return fail("Not found", 404);
    return ok(application);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const body = await request.json();

    // Dedicated status transition payload
    if (body && typeof body.status === "string" && Object.keys(body).length <= 2) {
      const { status, note } = changeStatusSchema.parse(body);
      const updated = await changeStatus(user.id, id, status, note);
      if (!updated) return fail("Not found", 404);
      return ok(updated);
    }

    const input = updateApplicationSchema.parse(body);
    const updated = await updateApplication(user.id, id, {
      ...input,
      location: input.location || null,
      jobUrl: input.jobUrl || null,
      employmentType: input.employmentType || null,
      salary: input.salary || null,
      notes: input.notes || null,
    });
    if (!updated) return fail("Not found", 404);
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const deleted = await deleteApplication(user.id, id);
    if (!deleted) return fail("Not found", 404);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
