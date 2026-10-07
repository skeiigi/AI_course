/** Секретные ссылки сохраняются только в браузере гостя. */

export interface BookingLink {
  id: number;
  token: string;
}

const STORAGE_KEY = 'booking.access-links';
const HASH_PATTERN = /^#booking=([1-9]\d*)\.([0-9a-f]{64})$/;

export function readBookingLinks(): BookingLink[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is BookingLink =>
          typeof item === 'object' && item !== null &&
          Number.isSafeInteger(item.id) && item.id > 0 &&
          typeof item.token === 'string' && /^[0-9a-f]{64}$/.test(item.token),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveBookingLink(link: BookingLink): BookingLink[] {
  const links = [link, ...readBookingLinks().filter((item) => item.id !== link.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  return links;
}

export function bookingLinkUrl(link: BookingLink): string {
  return `${window.location.origin}${window.location.pathname}#booking=${link.id}.${link.token}`;
}

export function bookingLinkFromHash(hash: string): BookingLink | null {
  const match = HASH_PATTERN.exec(hash);
  if (match === null) {
    return null;
  }
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? { id, token: match[2] } : null;
}
