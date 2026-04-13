'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
  const reduceMotion = useReducedMotion();

  const fadeDuration = reduceMotion ? 0 : 0.5;
  const fadeEase = [0.22, 1, 0.36, 1] as const;

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
    <div className='relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-transparent'>
      <AnimatePresence initial={false} mode='sync'>
        <motion.div
          key={currentMaterial.id}
          className='absolute inset-0 flex items-center justify-center'
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{
            duration: fadeDuration,
            ease: fadeEase
          }}
        >
          {currentMaterial.type === 'image' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentMaterial.url}
              alt='Advertisement'
              className='max-h-full max-w-full object-contain'
              draggable={false}
            />
          ) : (
            <video
              src={currentMaterial.url}
              autoPlay
              muted
              playsInline
              onEnded={handleVideoEnded}
              className='max-h-full max-w-full object-contain'
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
