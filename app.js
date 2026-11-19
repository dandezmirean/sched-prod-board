import { fetchIncidents, ack } from './api.js';
import { formatLocalTime } from './time.js';

const REFRESH_MS = 2000;

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAck = panel.querySelector('[data-testid="panel-ack"]');
const panelAcked = panel.querySelector('.acked');
const viewerLocale = navigator.language;
const incidents = new Map();
const acked = new Set();
empty.remove();

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

function localTime(incident) {
  const time = document.createElement('time');
  time.dateTime = incident.openedAt;
  time.textContent = formatLocalTime(incident.openedAt, viewerLocale);
  return time;
}

function incidentRow(incident) {
  const row = document.createElement('li');
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;
  row.className = `row ${incident.severity}`;
  row.tabIndex = 0;
  row.append(
    span('id', incident.id),
    span('sev', incident.severity),
    span('what', `${incident.service} · ${incident.region} · ${incident.summary}`),
    localTime(incident),
    span('state', ''),
  );
  return row;
}

// Only new incidents are added, on top. Rows already on screen stay in the DOM.
function render(page) {
  const fresh = page.incidents.filter((incident) => !incidents.has(incident.id));
  for (const incident of fresh) incidents.set(incident.id, incident);
  list.prepend(...fresh.map(incidentRow));
  loader.remove();
  if (incidents.size === 0) list.before(empty);
  else empty.remove();
}

function rowOf(id) {
  return list.querySelector(`[data-testid="incident-row"][data-id="${CSS.escape(id)}"]`);
}

function showPanel(id) {
  const incident = incidents.get(id);
  list.querySelector('.selected')?.classList.remove('selected');
  rowOf(id).classList.add('selected');
  panel.dataset.id = id;
  panel.querySelector('.panel-id').textContent = incident.id;
  panel.querySelector('.panel-sev').textContent = incident.severity;
  panel.querySelector('.panel-what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  panel.querySelector('.panel-time').replaceChildren(localTime(incident));
  panelAck.hidden = acked.has(id);
  panelAck.disabled = false;
  panelAck.textContent = `Ack ${incident.id}`;
  panelAcked.hidden = !acked.has(id);
  panel.hidden = false;
}

function pickRow(event) {
  const row = event.target.closest('[data-testid="incident-row"]');
  if (row) showPanel(row.dataset.id);
}

list.addEventListener('click', pickRow);
list.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    pickRow(event);
  }
});

panelAck.addEventListener('click', async () => {
  const id = panel.dataset.id;
  panelAck.disabled = true;
  try {
    await ack(id);
    acked.add(id);
    rowOf(id).querySelector('.state').replaceWith(ackedMark());
    if (panel.dataset.id === id) showPanel(id);
  } catch (error) {
    panelAck.disabled = false;
    panelAck.textContent = `Retry ack ${id}`;
    console.error(error);
  }
});

async function refresh() {
  try {
    render(await fetchIncidents());
  } catch (error) {
    // The next refresh retries; the board keeps the last list it showed.
    console.error(error);
  }
  setTimeout(refresh, REFRESH_MS);
}

refresh();
