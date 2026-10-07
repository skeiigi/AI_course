/** Проверка готового Docker-образа через его публичный HTTP-интерфейс. */

import assert from 'node:assert/strict';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8124';

async function expectStatus(path, status, options) {
  const response = await fetch(new URL(path, baseUrl), options);
  if (response.status !== status) {
    assert.fail(`${path}: ожидался HTTP ${status}, получен ${response.status}: ${await response.text()}`);
  }
  return response;
}

function post(body, headers = {}) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

const page = await expectStatus('/', 200);
assert.match(page.headers.get('content-type') ?? '', /text\/html/);
const html = await page.text();
const scriptPath = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
assert.ok(scriptPath, 'В собранной странице нет скрипта интерфейса');
await expectStatus(scriptPath, 200);

assert.deepEqual(await (await expectStatus('/api/activities', 200)).json(), []);

const activity = await (await expectStatus('/api/activities', 201, post({
  name: 'Проверка контейнера',
  duration_minutes: 30,
}))).json();
assert.ok(activity.id > 0);

await expectStatus('/api/schedules', 201, post({
  activity_id: activity.id,
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  start_time: '10:00:00',
  end_time: '11:00:00',
  step_minutes: 30,
}));

const dateParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Krasnoyarsk',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
);
const today = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
const nextWeek = new Date(`${today}T00:00:00Z`);
nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
const date = nextWeek.toISOString().slice(0, 10);
const slotsPath = `/api/slots?activity_id=${activity.id}&date_from=${date}&date_to=${date}`;

const slots = await (await expectStatus(slotsPath, 200)).json();
assert.deepEqual(slots.map(({ start_time, is_free }) => [start_time, is_free]), [
  ['10:00:00', true], ['10:30:00', true],
]);

const createdResponse = await expectStatus('/api/bookings/batch', 201, post({
  activity_id: activity.id,
  slots: slots.map(({ date, start_time }) => ({ date, start_time })),
  guest_name: 'Проверка CI',
  guest_email: 'ci@example.com',
}));
assert.equal(createdResponse.headers.get('cache-control'), 'no-store');
const { bookings } = await createdResponse.json();
assert.equal(bookings.length, 2);
assert.notEqual(bookings[0].access_token, bookings[1].access_token);

const busySlots = await (await expectStatus(slotsPath, 200)).json();
assert.deepEqual(busySlots.map(({ is_free }) => is_free), [false, false]);

const first = bookings[0];
const bookingPath = `/api/bookings/${first.booking.id}`;
await expectStatus(bookingPath, 404);
await expectStatus(bookingPath, 404, {
  headers: { Authorization: `Bearer ${'0'.repeat(64)}` },
});
const authorized = await expectStatus(bookingPath, 200, {
  headers: { Authorization: `Bearer ${first.access_token}` },
});
assert.equal((await authorized.json()).status, 'active');

const cancelled = await expectStatus(`${bookingPath}/cancel`, 200, post({}, {
  Authorization: `Bearer ${first.access_token}`,
}));
assert.equal((await cancelled.json()).status, 'cancelled');
const availableAgain = await (await expectStatus(slotsPath, 200)).json();
assert.deepEqual(availableAgain.map(({ is_free }) => is_free), [true, false]);

console.log('Docker smoke test: интерфейс, API, групповая бронь, доступ и отмена прошли.');
