// Что написал Coder. Это единственный источник истины для проверки.
const CODE = `export function slotEnd(start: string, durationMinutes: number): string {
  const [hours, minutes] = start.split(':').map(Number);
  return minutesToTime(hours * 60 + minutes + durationMinutes);
}`;

interface Note {
  quote: string;
  note: string;
}

// Что вернул Reviewer. Второе замечание выдумано: такой строки в коде нет.
const REVIEW: Note[] = [
  {
    quote: 'hours * 60 + minutes + durationMinutes',
    note: 'переход за полночь не обработан',
  },
  {
    quote: 'if (durationMinutes < 0)',
    note: 'отрицательная длительность не проверяется',
  },
];

/** Проверка на границе: цитата обязана дословно встречаться в коде. */
function gate(review: Note[], code: string): { passed: Note[]; dropped: Note[] } {
  return {
    passed: review.filter((item) => code.includes(item.quote)),
    dropped: review.filter((item) => !code.includes(item.quote)),
  };
}

/** Сводка для оркестратора: только замечания, короткой строкой. */
function summarize(review: Note[]): string {
  return review.map((item) => item.note).join('; ');
}

const gateEnabled = !process.argv.includes('--broken');
let accepted = REVIEW;

if (gateEnabled) {
  const { passed, dropped } = gate(REVIEW, CODE);
  accepted = passed;
  console.log('Проверка на границе включена.');
  console.log('Принято замечаний:', passed.length, 'отброшено:', dropped.length);
  for (const item of dropped) {
    console.log(' отброшено, цитаты нет в коде:', item.quote);
  }
} else {
  console.log('Проверка на границе выключена.');
}

console.log('СВОДКА ДЛЯ ОРКЕСТРАТОРА:', summarize(accepted));
