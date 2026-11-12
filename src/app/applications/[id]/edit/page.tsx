import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getApplication } from "@/lib/services/applications";
import { PageHeader } from "@/components/ui/primitives";
import { ApplicationForm } from "@/components/applications/application-form";

export const dynamic = "force-dynamic";

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const app = await getApplication(user.id, id);
  if (!app) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit Application" description={app.jobTitle} />
      <ApplicationForm mode="edit" application={app} />
    </div>
  );
}
