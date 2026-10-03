/** Короткое напоминание о порядке действий. Три шага, без картинок и лишних слов. */

const STEPS = [
  'Выберите вид активности: от него зависят длительность встречи и часы приёма.',
  'Нажмите на свободный слот в календаре. Занятые слоты отмечены штриховкой.',
  'Оставьте имя и почту. Бронь появится в списке «Мои брони», её можно отменить.',
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
