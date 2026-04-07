import { ScreenUnitClient } from '@/components/screen/screen-unit-client';

interface PageProps {
  params: Promise<{ unitId: string }>;
}

export default async function ScreenUnitPage({ params }: PageProps) {
  const { unitId } = await params;
  return <ScreenUnitClient unitId={unitId} />;
}
