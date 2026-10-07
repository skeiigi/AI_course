/**
 * Сквозной сценарий: гость открывает страницу, выбирает вид активности,
 * бронирует свободный слот, видит подтверждение, а повторная попытка занять
 * тот же слот получает отказ.
 *
 * Тесты идут по порядку и делят одну базу: второй проверяет то,
 * что создал первый.
 */

import { expect, test } from '@playwright/test';

interface CreatedBooking {
  id: number;
  activity_id: number;
  date: string;
  start_time: string;
}

let created: CreatedBooking;
let secretLink: string;

test.describe.serial('бронирование тайм-слота', () => {
  test('гость выбирает активность, бронирует слот и видит подтверждение', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Тайм-слоты' })).toBeVisible();

    // Выбор активности меняет сетку: у код-ревью другая длительность и другие дни.
    await page.getByRole('radio', { name: /Код-ревью/ }).check();
    await expect(page.getByText(/длительность встречи 45 минут/)).toBeVisible();

    // Уходим на следующую неделю: там нет броней из демонстрационных данных,
    // поэтому сценарий не зависит от текущего дня.
    await page.getByRole('button', { name: 'Следующая неделя' }).click();

    const freeSlot = page.getByRole('button', { name: /свободно$/ }).first();
    await expect(freeSlot).toBeVisible();

    const answer = page.waitForResponse(
      (response) =>
        response.url().includes('/api/bookings') && response.request().method() === 'POST',
    );

    await freeSlot.click();
    await expect(page.getByTestId('booking-form')).toBeVisible();

    await page.getByLabel('Как вас зовут').fill('Иван Петров');
    await page.getByLabel('Почта').fill('ivan@example.com');
    await page.getByRole('button', { name: 'Забронировать' }).click();

    const response = await answer;
    expect(response.status()).toBe(201);
    created = ((await response.json()) as { booking: CreatedBooking }).booking;

    const confirmation = page.getByTestId('booking-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Вы записаны');
    await expect(confirmation).toContainText('Код-ревью');
    secretLink = await page.getByLabel('Секретная ссылка на бронь').inputValue();
    expect(secretLink).toMatch(/#booking=\d+\.[0-9a-f]{64}$/);
    await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secretLink);

    // Бронь сразу видна в списке гостя.
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await page.getByRole('button', { name: 'Записаться ещё раз' }).click();
    await page.getByRole('button', { name: /Скопировать ссылку на бронь/ }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secretLink);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole('button', { name: /Скопировать ссылку на бронь/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('повторная попытка занять тот же слот получает отказ', async ({ page, request }) => {
    const repeated = await request.post('/api/bookings', {
      data: {
        activity_id: created.activity_id,
        date: created.date,
        start_time: created.start_time,
        guest_name: 'Мария Орлова',
        guest_email: 'maria@example.com',
      },
    });

    expect(repeated.status()).toBe(409);
    expect(await repeated.json()).toEqual({
      code: 'slot_taken',
      message: 'Этот слот уже забронирован',
    });

    // В интерфейсе тот же слот показан занятым, и нажатие на него объясняет причину.
    await page.goto('/');
    await page.getByRole('radio', { name: /Код-ревью/ }).check();
    await page.getByRole('button', { name: 'Следующая неделя' }).click();

    const busySlots = page.getByRole('button', { name: /занято$/ });
    await expect(busySlots).toHaveCount(1);

    await busySlots.first().click();
    await expect(page.getByTestId('toast')).toContainText('Этот слот уже забронирован');
  });

  test('секретная ссылка открывает бронь в новом браузере и позволяет её отменить', async ({ page }) => {
    await page.goto(secretLink);
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(page.getByRole('group', { name: /Подтверждение отмены брони/ })).toBeVisible();
    await page.getByRole('button', { name: 'Оставить бронь' }).click();
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await page.getByRole('button', { name: 'Отменить' }).click();
    await page.getByRole('button', { name: 'Да, отменить' }).click();
    await expect(page.getByText('Бронь отменена')).toBeVisible();
    await expect(page.getByText('Переписка закрыта после отмены или начала встречи.')).toBeVisible();
  });

  test('неверная секретная ссылка не показывает чужую бронь', async ({ page }) => {
    await page.goto(`/#booking=${created.id}.${'0'.repeat(64)}`);
    await expect(page.getByRole('alert')).toContainText('Бронь не найдена');
    await expect(page.getByRole('button', { name: 'Отменить' })).toHaveCount(0);
  });

  test('гость выбирает слоты в разных неделях и бронирует их одним действием', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: /Код-ревью/ }).check();
    await page.getByRole('button', { name: 'Следующая неделя' }).click();
    await page.getByRole('button', { name: /свободно$/ }).first().click();
    await page.getByRole('button', { name: 'Следующая неделя' }).click();
    await page.getByRole('button', { name: /свободно$/ }).first().click();

    const form = page.getByTestId('booking-form');
    await expect(form).toContainText('2 слота');
    await page.getByLabel('Как вас зовут').fill('Иван Петров');
    await page.getByLabel('Почта').fill('ivan@example.com');

    const answer = page.waitForResponse((response) =>
      response.url().endsWith('/api/bookings/batch') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Забронировать 2 слота' }).click();
    const response = await answer;
    expect(response.status()).toBe(201);
    const result = await response.json() as { bookings: Array<{ booking: CreatedBooking; access_token: string }> };
    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0].access_token).not.toBe(result.bookings[1].access_token);
    await expect(page.getByTestId('booking-confirmation')).toContainText('2 слота');
    await expect(page.getByLabel(/Секретная ссылка на бронь \d/)).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Отменить' })).toHaveCount(2);
  });

  test('ручной интервал выделяет несколько слотов в календаре', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: /Консультация по проекту/ }).check();
    const slotsAnswer = page.waitForResponse((response) =>
      response.url().includes('/api/slots?') && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Следующая неделя' }).click();
    const daySlots = await (await slotsAnswer).json() as Array<{ date: string; start_time: string }>;
    const date = daySlots.find((slot) => slot.start_time === '10:00:00')?.date;
    expect(date).toBeDefined();
    await page.getByRole('button', { name: 'Предыдущая неделя' }).click();

    const picker = page.getByTestId('manual-time');
    await picker.getByLabel('Дата').fill(date!);
    await picker.getByLabel('Начало').fill('10:00');
    await picker.getByLabel('Конец').fill('11:00');
    await picker.getByRole('button', { name: 'Выделить слоты' }).click();

    await expect(page.getByRole('button', { name: /выбрано$/ })).toHaveCount(2);
    await expect(page.getByTestId('booking-form')).toContainText('2 слота');
    await expect(picker.getByRole('alert')).toHaveCount(0);

    await picker.getByLabel('Конец').fill('11:10');
    await picker.getByRole('button', { name: 'Выделить слоты' }).click();
    await expect(picker.getByRole('alert')).toContainText('границами слотов');
    await expect(page.getByRole('button', { name: /выбрано$/ })).toHaveCount(2);
  });
});

test('на узком экране можно перейти от выбранного слота к форме без горизонтальной прокрутки', async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Следующая неделя' }).click();
    await page.getByRole('button', { name: /свободно$/ }).first().click();

    const bookingLink = page.getByRole('link', { name: /Перейти к оформлению/ });
    await expect(bookingLink).toBeVisible();
    await bookingLink.click();
    await expect(page.getByTestId('booking-form')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('тема переключается, сохраняется и учитывает настройки системы', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Включить тёмную тему' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 244, 238)');

  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 29, 26)');
  expect(await page.evaluate(() => localStorage.getItem('booking.theme'))).toBe('dark');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Включить светлую тему' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 29, 26)');

  await page.evaluate(() => localStorage.removeItem('booking.theme'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 29, 26)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 244, 238)');

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole('button', { name: 'Включить тёмную тему' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('body').evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  );
  expect(parseFloat(duration)).toBeLessThan(0.001);
});

test('участники переписываются на странице по общей секретной ссылке', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Следующая неделя' }).click();
  await page.getByRole('button', { name: /свободно$/ }).first().click();
  await page.getByLabel('Как вас зовут').fill('Иван Петров');
  await page.getByLabel('Почта').fill('ivan@example.com');
  await page.getByRole('button', { name: 'Забронировать' }).click();
  const link = await page.getByLabel('Секретная ссылка на бронь').inputValue();

  await page.getByRole('link', { name: 'Открыть страницу брони' }).click();
  await expect(page.getByRole('heading', { name: 'Переписка перед встречей' })).toBeVisible();
  await page.getByLabel('Ваше имя').fill('Иван');
  await page.getByLabel('Сообщение').fill('Встреча будет онлайн?');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByText('Встреча будет онлайн?')).toBeVisible();

  const otherContext = await browser.newContext();
  try {
    const organizerPage = await otherContext.newPage();
    await organizerPage.goto(link);
    await expect(organizerPage.getByText('Встреча будет онлайн?')).toBeVisible();
    await organizerPage.getByLabel('Ваше имя').fill('Организатор');
    await organizerPage.getByLabel('Сообщение').fill('Да, отправлю ссылку перед встречей.');
    await organizerPage.getByRole('button', { name: 'Отправить сообщение' }).click();
    await expect(organizerPage.getByText('Да, отправлю ссылку перед встречей.')).toBeVisible();
  } finally {
    await otherContext.close();
  }

  await page.reload();
  await expect(page.getByText('Да, отправлю ссылку перед встречей.')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
