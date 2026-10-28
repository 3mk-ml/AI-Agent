import { notFound } from 'next/navigation';
import { Workspace } from '@/components/workspace';
export default async function Page({ params }: { params: Promise<{ page?: string[] }> }) {
  const { page } = await params; const screen = page?.join('/') || 'overview';
  if (!['overview','inbox','assistant','leads','appointments','knowledge','automations','executions','settings'].includes(screen)) notFound();
  return <Workspace screen={screen} />;
}
