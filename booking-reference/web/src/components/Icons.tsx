/**
 * Иконки нарисованы прямо в разметке, без библиотеки: их немного,
 * а лишняя зависимость обошлась бы дороже, чем эти двадцать строк.
 * Атрибут aria-hidden скрывает их от программ чтения с экрана:
 * рядом всегда есть текст, который несёт тот же смысл.
 */

interface IconProps {
  className?: string;
}

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const ChevronLeft = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const ChevronRight = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m5 13 4.5 4.5L19 7" />
  </svg>
);

export const LockIcon = ({ className }: IconProps) => (
  <svg {...base} className={className} strokeWidth={1.6}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
  </svg>
);

export const AlertIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.4h.01" />
  </svg>
);
