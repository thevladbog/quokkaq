'use client';

import { useMemo } from 'react';

import type { AppLocale } from '@/src/messages';

type TicketPalette = {
  border: string;
  text: string;
  bg: string;
};

type Ticket = {
  id: number;
  number: string;
  left: number;
  delay: number;
  duration: number;
  palette: TicketPalette;
};

/** Pastel / accent combos that read well on the hero cream background */
const TICKET_PALETTES: TicketPalette[] = [
  {
    border: 'rgb(255 107 53 / 0.55)',
    text: '#c2410c',
    bg: 'rgb(255 255 255 / 0.94)'
  },
  {
    border: 'rgb(247 147 30 / 0.55)',
    text: '#b45309',
    bg: 'rgb(255 250 245 / 0.94)'
  },
  {
    border: 'rgb(13 148 136 / 0.45)',
    text: '#0f766e',
    bg: 'rgb(240 253 250 / 0.92)'
  },
  {
    border: 'rgb(37 99 235 / 0.45)',
    text: '#1d4ed8',
    bg: 'rgb(239 246 255 / 0.92)'
  },
  {
    border: 'rgb(124 58 237 / 0.45)',
    text: '#6d28d9',
    bg: 'rgb(245 243 255 / 0.92)'
  },
  {
    border: 'rgb(225 29 72 / 0.4)',
    text: '#be123c',
    bg: 'rgb(255 241 242 / 0.92)'
  },
  {
    border: 'rgb(5 150 105 / 0.45)',
    text: '#047857',
    bg: 'rgb(236 253 245 / 0.92)'
  },
  {
    border: 'rgb(217 119 6 / 0.5)',
    text: '#b45309',
    bg: 'rgb(255 251 235 / 0.94)'
  }
];

const LETTERS_RU = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
const LETTERS_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** How many tickets fall at once (each has stable number/color from its seed). */
const TICKET_COUNT = 24;

/** Deterministic 0..1 PRNG so SSR and hydration output match (avoids hydration mismatch). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alphabetForLocale(locale: AppLocale): string {
  return locale === 'ru' ? LETTERS_RU : LETTERS_EN;
}

/** Prefix: 1–3 letters from locale alphabet + numeric suffix (stable per rng stream). */
function generateTicketNumber(rng: () => number, locale: AppLocale): string {
  const alphabet = alphabetForLocale(locale);
  const prefixLen = 1 + Math.floor(rng() * 3);
  let prefix = '';
  for (let i = 0; i < prefixLen; i += 1) {
    prefix += alphabet[Math.floor(rng() * alphabet.length)]!;
  }
  const number = Math.floor(rng() * 999) + 1;
  return `${prefix}-${number.toString().padStart(3, '0')}`;
}

function pickPalette(rng: () => number): TicketPalette {
  const i = Math.floor(rng() * TICKET_PALETTES.length);
  return TICKET_PALETTES[i]!;
}

/**
 * PRNG draw count inside `generateTicketNumber` does not depend on locale (only
 * alphabet choice uses the same number of `rng()` calls). Discarding any
 * locale’s number advances the stream identically so layout matches the legacy
 * `ticketFromStableSeed` ordering.
 */
function advanceRngPastTicketNumber(rng: () => number): void {
  void generateTicketNumber(rng, 'en');
}

function buildStableTicketLayouts(): Omit<Ticket, 'number'>[] {
  return Array.from({ length: TICKET_COUNT }, (_, id) => {
    const rng = mulberry32(0x9e3779b9 ^ (id * 0x85ebca6b));
    advanceRngPastTicketNumber(rng);
    return {
      id,
      /** % по ширине вьюпорта; с translateX(-50%) держим якорь внутри полосы, без вылезания за край */
      left: 12 + rng() * 76,
      /** Phased + short jitter so the first tickets appear within ~1s, all started within ~4s (not 0–15s blank). */
      delay: id * 0.12 + rng() * 0.85,
      duration: 15 + rng() * 10,
      palette: pickPalette(rng)
    };
  });
}

function ticketNumberFromStableSeed(id: number, locale: AppLocale): string {
  const rng = mulberry32(0x9e3779b9 ^ (id * 0x85ebca6b));
  return generateTicketNumber(rng, locale);
}

type AnimationProps = {
  locale: AppLocale;
};

export function LandingTicketsAnimation({ locale }: AnimationProps) {
  const ticketLayouts = useMemo(() => buildStableTicketLayouts(), []);

  const tickets = useMemo(
    (): Ticket[] =>
      ticketLayouts.map((layout) => ({
        ...layout,
        number: ticketNumberFromStableSeed(layout.id, locale)
      })),
    [ticketLayouts, locale]
  );

  return (
    <div
      className='pointer-events-none absolute inset-0 z-0 overflow-hidden'
      aria-hidden='true'
    >
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className='ticket-fall absolute w-[5.75rem] min-w-0 sm:w-28'
          style={{
            left: `${ticket.left}%`,
            animationDelay: `${ticket.delay}s`,
            animationDuration: `${ticket.duration}s`
          }}
        >
          <div
            className='ticket-card rounded-xl border-2 px-4 py-3 shadow-lg backdrop-blur-sm'
            style={{
              borderColor: ticket.palette.border,
              backgroundColor: ticket.palette.bg,
              color: ticket.palette.text
            }}
          >
            <div className='font-landing-label text-center text-sm font-bold tabular-nums sm:text-base'>
              {ticket.number}
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        .ticket-fall {
          animation: fall linear infinite;
          animation-fill-mode: backwards;
          will-change: transform;
        }

        @keyframes fall {
          0% {
            transform: translate(-50%, calc(-45vh - 120px)) rotate(0deg);
            opacity: 0;
          }
          2% {
            opacity: 0.72;
          }
          50% {
            opacity: 0.65;
          }
          92% {
            opacity: 0.45;
          }
          100% {
            transform: translate(-50%, calc(100vh + 120px)) rotate(15deg);
            opacity: 0;
          }
        }

        .ticket-card {
          animation: sway 3s ease-in-out infinite;
        }

        @keyframes sway {
          0%,
          100% {
            transform: rotate(-2deg);
          }
          50% {
            transform: rotate(2deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ticket-fall,
          .ticket-card {
            display: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
