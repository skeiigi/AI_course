/** Миграция старой базы и однократная выдача секрета оператором. */

import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { createAccessToken, hashAccessToken } from '../src/bookingAccess.js';
import { openDatabase } from '../src/db.js';
import type { Db } from '../src/db.js';
import { createRepository } from '../src/repository.js';
import { MONDAY } from './helpers.js';

it('открывает старую базу и выдаёт секрет существующей брони только один раз', () => {
  const directory = mkdtempSync(join(tmpdir(), 'booking-legacy-'));
  const file = join(directory, 'booking.db');
  let db: Db | null = null;

  try {
    db = openDatabase(file);
    const original = createRepository(db);
    const activity = original.createActivity({
      name: 'Консультация',
      duration_minutes: 30,
      description: '',
      color: '#3b5bdb',
    });
    const booking = original.createBooking({
      activity_id: activity.id,
      date: MONDAY,
      start_time: '10:00:00',
      end_time: '10:30:00',
      guest_name: 'Иван Петров',
      guest_email: 'ivan@example.com',
    }, hashAccessToken(createAccessToken()));

    // У старой базы есть бронь, но ещё нет таблицы секретов.
    db.exec('DROP TABLE booking_access');
    db.close();
    db = openDatabase(file);
    const repository = createRepository(db);
    const token = createAccessToken();
    const hash = hashAccessToken(token);

    expect(repository.issueLegacyAccess(booking.id, hash)).toBe(true);
    expect(repository.getAuthorizedBooking(booking.id, hash)?.id).toBe(booking.id);
    expect(repository.issueLegacyAccess(booking.id, hashAccessToken(createAccessToken()))).toBe(false);
    expect(repository.issueLegacyAccess(999, hashAccessToken(createAccessToken()))).toBe(false);
  } finally {
    db?.close();
    for (const name of readdirSync(directory)) {
      unlinkSync(join(directory, name));
    }
    rmdirSync(directory);
  }
});
