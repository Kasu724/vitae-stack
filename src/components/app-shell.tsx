"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const primaryNavigation = [
  { href: "/dashboard", label: "Overview" },
  { href: "/career", label: "Career evidence" },
  { href: "/documents", label: "Documents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/sources", label: "Sources" },
] as const;

const secondaryNavigation = [
  { href: "/ats", label: "ATS analysis" },
  { href: "/exports", label: "Exports" },
  { href: "/settings/providers", label: "Model providers" },
  { href: "/settings/privacy", label: "Privacy & data" },
] as const;

function NavigationLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const isCurrent =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <Link
      className="app-nav-link"
      href={href}
      aria-current={isCurrent ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="mobile-app-header">
        <Link
          className="app-brand"
          href="/dashboard"
          aria-label="Vitae Stack overview"
        >
          <span className="app-brand-mark" aria-hidden="true">
            VS
          </span>
          <span>Vitae Stack</span>
        </Link>
        <span className="local-status">
          <span aria-hidden="true" /> Local installation
        </span>
      </header>
      <aside className="app-sidebar" aria-label="Application navigation">
        <div className="sidebar-brand-row">
          <Link
            className="app-brand"
            href="/dashboard"
            aria-label="Vitae Stack overview"
          >
            <span className="app-brand-mark" aria-hidden="true">
              VS
            </span>
            <span>Vitae Stack</span>
          </Link>
        </div>
        <div className="sidebar-local-panel">
          <span className="local-status">
            <span aria-hidden="true" /> Local installation
          </span>
          <p>
            Stored on this device. Optional provider tasks disclose their data
            destination before use.
          </p>
        </div>
        <nav className="app-navigation" aria-label="Primary">
          {primaryNavigation.map((item) => (
            <NavigationLink key={item.href} {...item} pathname={pathname} />
          ))}
          <p className="app-nav-label">Tools & controls</p>
          {secondaryNavigation.map((item) => (
            <NavigationLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>
        <p className="sidebar-footnote">
          Evidence-backed documents with final-export safeguards.
        </p>
      </aside>
      <div className="mobile-navigation-wrap">
        <nav className="mobile-navigation" aria-label="Primary">
          {[...primaryNavigation, ...secondaryNavigation].map((item) => (
            <NavigationLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>
      </div>
      <div className="app-content">{children}</div>
    </div>
  );
}
