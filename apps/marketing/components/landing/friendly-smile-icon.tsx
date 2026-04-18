type Props = {
  className?: string;
};

/**
 * Outline smile used next to the hero “eyebrow” line (replaces a stray emoji)
 * so EN/RU and all themes render the same mark.
 */
export function FriendlySmileIcon({ className }: Props) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      width='24'
      height='24'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      aria-hidden
    >
      <circle
        cx='12'
        cy='12'
        r='9.25'
        stroke='currentColor'
        strokeWidth='1.75'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <circle cx='9' cy='10.25' r='1.1' fill='currentColor' />
      <circle cx='15' cy='10.25' r='1.1' fill='currentColor' />
      <path
        d='M8.25 14.25c1.15 1.85 2.65 2.75 3.75 2.75s2.6-.9 3.75-2.75'
        stroke='currentColor'
        strokeWidth='1.75'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}
