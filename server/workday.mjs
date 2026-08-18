const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(value) {
  return Object.fromEntries(formatter.formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function dateKeyParts(value) {
  const match = typeof value === 'string' ? DATE_KEY.exec(value) : null;
  if (!match) throw new RangeError('Invalid workday.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new RangeError('Invalid workday.');
  }
  return { year, month, day };
}

function addDays(value, amount) {
  const { year, month, day } = dateKeyParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function amsterdamInstant(workday, hour) {
  const desired = dateKeyParts(workday);
  const desiredWallClock = Date.UTC(desired.year, desired.month - 1, desired.day, hour);
  let instant = desiredWallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = parts(new Date(instant));
    const observedWallClock = Date.UTC(local.year, local.month - 1, local.day, local.hour);
    const adjustment = desiredWallClock - observedWallClock;
    instant += adjustment;
    if (adjustment === 0) return new Date(instant);
  }
  throw new RangeError('Unable to resolve Amsterdam workday boundary.');
}

export function scannerWorkday(reference = new Date()) {
  const date = reference instanceof Date ? reference : new Date(reference);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid reference time.');
  const local = parts(date);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + (local.hour >= 16 ? 1 : 0)));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function previousWorkday(workday) {
  return addDays(workday, -1);
}

export function workdayBounds(workday) {
  dateKeyParts(workday);
  return Object.freeze({
    start: amsterdamInstant(previousWorkday(workday), 16),
    end: amsterdamInstant(workday, 16),
  });
}
