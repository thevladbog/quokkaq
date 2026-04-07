'use client';

import { useEffect, useState } from 'react';

interface AdPlayerProps {
  materials: Array<{
    id: string;
    type: string;
    url: string;
  }>;
  duration: number; // seconds for images
}

export function AdPlayer({ materials, duration }: AdPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (materials.length === 0) return;

    const currentMaterial = materials[currentIndex];

    // For images, rotate after duration
    if (currentMaterial.type === 'image') {
      const timer = setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % materials.length);
      }, duration * 1000);

      return () => clearTimeout(timer);
    }

    // For videos, the onEnded event will handle rotation
  }, [currentIndex, materials, duration]);

  const handleVideoEnded = () => {
    setCurrentIndex((prev) => (prev + 1) % materials.length);
  };

  if (materials.length === 0) {
    return (
      <div className='bg-muted/20 flex h-full w-full items-center justify-center rounded-lg'>
        <p className='text-muted-foreground text-xl'>No ads configured</p>
      </div>
    );
  }

  const currentMaterial = materials[currentIndex];

  return (
    <div className='flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-transparent'>
      {currentMaterial.type === 'image' ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={currentMaterial.id}
            src={currentMaterial.url}
            alt='Advertisement'
            className='max-h-full max-w-full object-contain'
          />
        </>
      ) : (
        <video
          key={currentMaterial.id}
          src={currentMaterial.url}
          autoPlay
          muted
          onEnded={handleVideoEnded}
          className='max-h-full max-w-full object-contain'
        />
      )}
    </div>
  );
}
