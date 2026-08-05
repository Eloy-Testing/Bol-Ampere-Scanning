const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function parts(value) {
  return Object.fromEntries(formatter.formatToParts(value).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

export function scannerWorkday(reference = new Date()) {
  const date = reference instanceof Date ? reference : new Date(reference);
  const local = parts(date);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + (local.hour >= 16 ? 1 : 0)));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}
