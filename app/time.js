// Incident times in the viewer's zone. Day and month keep the locale's order, joined by "/".
export function formatLocalTime(iso, locale, timeZone) {
  const date = new Date(iso);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone })
    .formatToParts(date)
    .filter((part) => part.type === 'day' || part.type === 'month')
    .map((part) => part.value)
    .join('/');
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(date);
  return `${dayMonth} ${time}`;
}
