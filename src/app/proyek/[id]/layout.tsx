import type { ReactNode } from 'react';
import ProjectAccessGate from '@/components/layout/ProjectAccessGate';

export default function ProjectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProjectAccessGate>{children}</ProjectAccessGate>;
}
