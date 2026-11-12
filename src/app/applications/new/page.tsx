import { PageHeader } from "@/components/ui/primitives";
import { ApplicationForm } from "@/components/applications/application-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add Application"
        description="Log a job you've applied to manually."
      />
      <ApplicationForm mode="create" />
    </div>
  );
}
