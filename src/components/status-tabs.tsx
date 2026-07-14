import Link from "next/link";

interface StatusTabsProps {
  activeHref: string;
  archivedHref: string;
  currentStatus: "active" | "archived";
  label: string;
}

export function StatusTabs({
  activeHref,
  archivedHref,
  currentStatus,
  label,
}: StatusTabsProps) {
  const tabs = [
    { href: activeHref, label: "Active", status: "active" },
    { href: archivedHref, label: "Archived", status: "archived" },
  ] as const;

  return (
    <nav aria-label={label} className="flex border-b border-[var(--border)]">
      {tabs.map((tab) => {
        const isCurrent = currentStatus === tab.status;
        return (
          <Link
            key={tab.status}
            href={tab.href}
            aria-current={isCurrent ? "page" : undefined}
            className={`min-h-11 border-b-2 px-4 py-3 font-semibold no-underline transition-colors ${
              isCurrent
                ? "border-[var(--action)] text-[var(--text-strong)]"
                : "border-transparent text-[var(--muted-strong)] hover:border-[var(--border)] hover:text-[var(--text-strong)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
