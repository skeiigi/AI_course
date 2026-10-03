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
  activity_id: number;
  date: string;
  start_time: string;
}

let created: CreatedBooking;

test.describe.serial('бронирование тайм-слота', () => {
  test('гость выбирает активность, бронирует слот и видит подтверждение', async ({ page }) => {
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
    created = (await response.json()) as CreatedBooking;

    const confirmation = page.getByTestId('booking-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Вы записаны');
    await expect(confirmation).toContainText('Код-ревью');

    // Бронь сразу видна в списке гостя.
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible();
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
});
