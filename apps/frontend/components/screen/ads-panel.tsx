import { Card } from '@/components/ui/card';

export function AdsPanel() {
  return (
    <Card className='bg-muted/50 flex h-full w-full items-center justify-center rounded-none border-none shadow-none'>
      <div className='p-8 text-center'>
        <h2 className='text-muted-foreground mb-4 text-3xl font-bold'>
          Advertisement Space
        </h2>
        <p className='text-muted-foreground text-xl'>Place your content here</p>
        {/* Placeholder for image/video carousel */}
        <div className='mt-8 text-9xl opacity-10'>📺</div>
      </div>
    </Card>
  );
}
