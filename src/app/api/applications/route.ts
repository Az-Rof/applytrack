import { getCurrentUser } from "@/lib/auth";
import {
  createApplication,
  listApplications,
  type ListFilters,
} from "@/lib/services/applications";
import { createApplicationSchema } from "@/lib/validation";
import { handleError, ok, fail } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const { searchParams } = new URL(request.url);
    const filters: ListFilters = {
      platform: searchParams.get("platform") ?? undefined,
      status: (searchParams.get("status") as ListFilters["status"]) ?? undefined,
      company: searchParams.get("company") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      take: Number(searchParams.get("take") ?? 50),
      skip: Number(searchParams.get("skip") ?? 0),
    };
    const result = await listApplications(user.id, filters);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("Not authenticated — open /login", 401);
    const body = await request.json();
    const input = createApplicationSchema.parse(body);
    const { application, duplicate } = await createApplication(user.id, input);
    if (duplicate) {
      return ok(
        { application, duplicate: true },
        { status: 409 },
      );
    }
    return ok({ application, duplicate: false }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
