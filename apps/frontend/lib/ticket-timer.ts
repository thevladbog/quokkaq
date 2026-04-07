import { useState, useEffect } from 'react';

interface TicketTimerResult {
  elapsed: number;
  remaining: number;
  percent: number;
  isOverdue: boolean;
  isWarning: boolean;
  color: string;
  background: string;
  formatTime: (seconds: number) => string;
}

export function useTicketTimer(
  createdAt?: string | Date,
  maxWaitingTime?: number | null
): TicketTimerResult {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const created = createdAt ? new Date(createdAt).getTime() : now;
  const elapsed = Math.max(0, Math.floor((now - created) / 1000));

  let percent = 0;
  let remaining = 0;
  let isOverdue = false;
  let isWarning = false;
  let color = 'transparent';
  let background = '';

  if (maxWaitingTime && maxWaitingTime > 0) {
    percent = (elapsed / maxWaitingTime) * 100;
    remaining = maxWaitingTime - elapsed;

    if (remaining < 0) {
      isOverdue = true;
      remaining = 0;
      percent = 100;
    } else if (remaining <= maxWaitingTime * 0.1) {
      isWarning = true;
    }

    // Colors
    if (isOverdue) {
      color = '#ef4444'; // Red-500
    } else if (isWarning) {
      color = '#eab308'; // Yellow-500
    } else {
      color = '#22c55e'; // Green-500
    }

    // Gradient: Left (transparent) -> Right (Color)
    // "Sleva okraski net, a sprava - 100%"
    // If we want a progress bar that fills from left to right:
    // background: linear-gradient(to right, ${color} ${percent}%, transparent ${percent}%)
    // If we want a gradient that is transparent on left and colored on right, but static?
    // The user said "background of the ticket... gradient... left no color... right 100%".
    // AND "color signaling".
    // I will implement a progress fill with opacity or gradient.

    // Let's try a smooth gradient that shifts?
    // Or just a hard stop for progress bar?
    // "Gradient" implies smooth.
    // Maybe: linear-gradient(to right, transparent, ${color} ${percent}%)? No.

    // Let's stick to the progress bar interpretation as it's most functional for "waiting time".
    // Using a hard stop for clear indication of time passed.
    // To make it "gradient-like" as requested, maybe the *filled* part is a gradient?
    // linear-gradient(to right, transparent, ${color}) ?

    // Let's try:
    // background: `linear-gradient(to right, transparent, ${color} ${percent}%, transparent ${percent}%)`
    // This looks weird.

    // Let's go with a standard progress fill but maybe with low opacity to not obscure text.
    // And use the requested "left transparent, right 100%" as the *style* of the fill?
    // Maybe he means the *intensity* increases to the right?

    // I will use a simple progress bar fill for now.
    // background: `linear-gradient(90deg, ${color}20 ${percent}%, transparent ${percent}%)` (20% opacity)
    // But he said "red" for overdue.

    // Let's use a solid border-bottom or similar? No, he said "background".

    // I will use:
    // background: `linear-gradient(90deg, ${color}33 ${percent}%, transparent ${percent}%)`
    // 33 = ~20% opacity.

    background = `linear-gradient(90deg, ${color}33 ${percent}%, transparent ${percent}%)`;
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return {
    elapsed,
    remaining,
    percent,
    isOverdue,
    isWarning,
    color,
    background,
    formatTime
  };
}
