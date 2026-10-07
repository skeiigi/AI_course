/** Короткое напоминание о порядке действий. Три шага, без картинок и лишних слов. */

const STEPS = [
  'Выберите вид активности: от него зависят длительность встречи и часы приёма.',
  'Выберите один или несколько свободных слотов, можно в разных неделях. Занятые отмечены штриховкой.',
  'Оставьте имя и почту. Сохраните секретные ссылки, чтобы открыть или отменить брони позже.',
];

export function HowItWorks() {
  return (
    <section className="steps" aria-labelledby="steps-title">
      <h2 className="steps__title" id="steps-title">
        Как записаться
      </h2>
      <ol className="steps__list">
        {STEPS.map((text, index) => (
          <li className="step" key={text}>
            <span className="step__number" aria-hidden="true">
              {index + 1}
            </span>
            <p className="step__text">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
