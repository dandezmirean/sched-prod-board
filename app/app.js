import { fetchIncidents, ack } from './api.js';
import { formatLocalTime } from './time.js';

const REFRESH_MS = 2000;

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const viewerLocale = navigator.language;

function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function ackedMark() {
  const mark = span('acked', 'acked');
  mark.dataset.testid = 'acked';
  return mark;
}

function ackButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.testid = 'ack';
  button.textContent = 'Ack';
  return button;
}

function incidentRow(incident) {
  const row = document.createElement('li');
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;
  row.className = `row ${incident.severity}`;
  const time = document.createElement('time');
  time.dateTime = incident.openedAt;
  time.textContent = formatLocalTime(incident.openedAt, viewerLocale);
  row.append(
    span('id', incident.id),
    span('sev', incident.severity),
    span('what', `${incident.service} · ${incident.region} · ${incident.summary}`),
    time,
    ackButton(),
  );
  return row;
}

// Rows already on screen stay in the DOM, so a refresh does not reset a row's button or focus.
function render(incidents) {
  const shown = new Map([...list.children].map((row) => [row.dataset.id, row]));
  const rows = incidents.map((incident) => shown.get(incident.id) ?? incidentRow(incident));
  list.replaceChildren(...rows);
  loader.hidden = true;
  empty.hidden = incidents.length > 0;
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button) return;
  const row = button.closest('[data-testid="incident-row"]');
  button.disabled = true;
  try {
    await ack(row.dataset.id);
    button.replaceWith(ackedMark());
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Retry ack';
    console.error(error);
  }
});

async function refresh() {
  try {
    render((await fetchIncidents()).incidents);
  } catch (error) {
    // The next refresh retries; the board keeps the last list it showed.
    console.error(error);
  }
  setTimeout(refresh, REFRESH_MS);
}

refresh();
