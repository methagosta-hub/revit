import type { ReactNode } from 'react';
import ProjectTabs from '@/components/layout/ProjectTabs';

export default function ProjectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-slate-50">
      <ProjectTabs />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
