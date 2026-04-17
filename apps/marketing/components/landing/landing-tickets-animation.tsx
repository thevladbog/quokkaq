'use client';

import { useEffect, useState } from 'react';

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

const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateTicketNumber(): string {
  const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const number = Math.floor(Math.random() * 999) + 1;
  return `${letter}-${number.toString().padStart(3, '0')}`;
}

function randomPalette(): TicketPalette {
  const i = Math.floor(Math.random() * TICKET_PALETTES.length);
  return TICKET_PALETTES[i]!;
}

function generateInitialTickets(): Ticket[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i,
    number: generateTicketNumber(),
    left: Math.random() * 100,
    delay: Math.random() * 15,
    duration: 15 + Math.random() * 10,
    palette: randomPalette()
  }));
}

export function LandingTicketsAnimation() {
  const [tickets, setTickets] = useState<Ticket[]>(generateInitialTickets);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickets((prev) =>
        prev.map((ticket) => ({
          ...ticket,
          number: generateTicketNumber(),
          palette: randomPalette()
        }))
      );
    }, 25000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className='pointer-events-none fixed inset-0 overflow-hidden'
      aria-hidden='true'
    >
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className='ticket-fall absolute w-20 sm:w-24'
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
            <div className='font-landing-label tabular-nums text-center text-sm font-bold sm:text-base'>
              {ticket.number}
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        .ticket-fall {
          animation: fall linear infinite;
          will-change: transform;
        }

        @keyframes fall {
          0% {
            transform: translateY(-120px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 0.7;
          }
          50% {
            opacity: 0.6;
          }
          90% {
            opacity: 0.4;
          }
          100% {
            transform: translateY(100vh) rotate(15deg);
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
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
