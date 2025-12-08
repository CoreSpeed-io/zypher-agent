import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { source, bottomLinks } from '@/lib/source';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const options = baseOptions();

  const tree = {
    ...source.pageTree,
    children: [...source.pageTree.children, ...bottomLinks],
  };

  return (
    <DocsLayout tree={tree} {...options} links={[]}>
      {children}
    </DocsLayout>
  );
}
