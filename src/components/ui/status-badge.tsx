import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_STYLE, type ApplicationStatus } from "@/lib/status";

export function StatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span className={cn("badge", STATUS_STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}
