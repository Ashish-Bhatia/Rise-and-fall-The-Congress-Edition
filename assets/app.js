const $ = id => document.getElementById(id);
const metrics = {
  seats: { title: 'Congress seats won', max: 450, ticks: [450, 300, 150, 0], unit: '', value: e => e.seats },
  voteShare: { title: 'Congress share of valid votes', max: 50, ticks: [50, 40, 30, 20, 10, 0], unit: '%', value: e => e.voteShare },
  seatShare: { title: 'Congress share of elected seats', max: 80, ticks: [80, 60, 40, 20, 0], unit: '%', value: e => e.seats / e.totalSeats * 100 }
};
const percent = n => `${n.toFixed(2)}%`;
const signed = (n, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

let data;
let selected = 2024;
let metric = 'seats';
let barButtons = [];

function validate(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.elections) || input.elections.length !== 18) throw new Error('Invalid election dataset.');
  let last = 0;
  input.elections.forEach((e, i) => {
    if (!Number.isInteger(e.year) || e.year <= last || e.ordinal !== i + 1 || !Number.isInteger(e.seats) || !Number.isInteger(e.totalSeats) || e.seats < 0 || e.seats > e.totalSeats || !Number.isFinite(e.voteShare) || e.voteShare < 0 || e.voteShare > 100) throw new Error('Invalid election record.');
    for (const key of ['label', 'party', 'era', 'outcome', 'description', 'note']) if (typeof e[key] !== 'string' || !e[key]) throw new Error('Incomplete election record.');
    const source = input.sources?.[e.source];
    if (!source || !source.title || new URL(source.url).protocol !== 'https:') throw new Error('Invalid election source.');
    last = e.year;
  });
  if (input.elections.at(-1).year !== 2024) throw new Error('Unexpected general-election cutoff.');
  return input;
}

function sourceFor(e) { return data.sources[e.source]; }

function populateSelectors() {
  for (const id of ['election-select', 'compare-from', 'compare-to']) {
    const select = $(id);
    data.elections.forEach(e => {
      const option = make('option', '', e.label);
      option.value = String(e.year);
      select.append(option);
    });
  }
  $('election-select').value = String(selected);
  $('compare-from').value = '2019';
  $('compare-to').value = '2024';
  $('historical-link').href = data.sources.historical.url;
  $('combined-link').href = data.sources.combined.url;
}

function buildBars() {
  const group = $('chart-bars');
  data.elections.forEach((e, index) => {
    const button = make('button', 'bar-button');
    button.type = 'button';
    button.dataset.year = String(e.year);
    const bar = make('span', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.append(make('span', 'bar-value'));
    const label = make('span', 'bar-label', e.label);
    label.setAttribute('aria-hidden', 'true');
    button.append(bar, label);
    button.addEventListener('click', () => selectElection(e.year));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
      if (event.key === 'ArrowRight') next = Math.min(data.elections.length - 1, index + 1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = data.elections.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectElection(data.elections[next].year);
      barButtons[next].focus();
      barButtons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    barButtons.push(button);
    group.append(button);
  });
}

function renderChart() {
  const measure = metrics[metric];
  $('chart-title').textContent = measure.title;
  $('chart-axis').replaceChildren(...measure.ticks.map(tick => {
    const row = make('div', 'axis-row');
    row.append(make('span', '', `${tick}${measure.unit}`));
    return row;
  }));
  data.elections.forEach((e, i) => {
    const value = measure.value(e);
    const formatted = metric === 'seats' ? String(value) : percent(value);
    barButtons[i].style.setProperty('--bar-height', `${value / measure.max * 100}%`);
    barButtons[i].querySelector('.bar-value').textContent = formatted;
    barButtons[i].setAttribute('aria-label', `${e.label}, ${measure.title.toLowerCase()}: ${formatted}. Show election profile.`);
    barButtons[i].setAttribute('aria-pressed', String(e.year === selected));
    barButtons[i].tabIndex = e.year === selected ? 0 : -1;
  });
  document.querySelectorAll('[data-metric]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === metric)));
}

function selectElection(year, announce = true) {
  const index = data.elections.findIndex(e => e.year === year);
  if (index < 0) return;
  const e = data.elections[index];
  selected = year;
  const previous = data.elections[index - 1];
  $('election-select').value = String(year);
  $('election-title').textContent = e.label;
  $('election-outcome').textContent = e.outcome;
  $('election-seats').textContent = String(e.seats);
  $('election-votes').textContent = percent(e.voteShare);
  $('election-share').textContent = percent(metrics.seatShare.value(e));
  $('election-change').textContent = previous ? `${signed(e.seats - previous.seats)} seats vs ${previous.label}` : 'First Lok Sabha general election';
  $('election-description').textContent = e.description;
  $('election-note').textContent = e.note;
  const source = sourceFor(e);
  $('election-source').href = source.url;
  $('election-source').title = source.title;
  barButtons.forEach((button, i) => {
    const active = data.elections[i].year === year;
    button.setAttribute('aria-pressed', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if (announce) $('explorer-status').textContent = `${e.label}: Congress won ${e.seats} seats, with ${percent(e.voteShare)} of valid votes. ${e.outcome}.`;
}

function renderComparison() {
  const from = data.elections.find(e => e.year === Number($('compare-from').value));
  const to = data.elections.find(e => e.year === Number($('compare-to').value));
  $('compare-seats').textContent = signed(to.seats - from.seats);
  $('compare-votes').textContent = `${signed(to.voteShare - from.voteShare, 2)} pp`;
  $('compare-share').textContent = `${signed(metrics.seatShare.value(to) - metrics.seatShare.value(from), 2)} pp`;
  $('compare-seats-detail').textContent = `${from.seats} → ${to.seats} seats`;
  $('compare-votes-detail').textContent = `${percent(from.voteShare)} → ${percent(to.voteShare)}`;
  $('compare-share-detail').textContent = `${percent(metrics.seatShare.value(from))} → ${percent(metrics.seatShare.value(to))}`;
  const cycleNote = [from, to].some(e => e.initialSeats) ? ' Includes a combined cycle with deferred polls; see the counting notes.' : '';
  $('compare-note').textContent = from.year === to.year ? 'The same election is selected on both sides. All differences are zero.' : `${from.label} → ${to.label}. Calculated from ECI’s reported election-cycle figures.${cycleNote}`;
}

function renderTable() {
  const era = $('era-filter').value;
  const sort = $('data-sort').value;
  const rows = data.elections.filter(e => era === 'all' || e.era === era);
  rows.sort((a, b) => sort === 'newest' ? b.year - a.year : sort === 'seats' ? b.seats - a.seats || a.year - b.year : sort === 'voteShare' ? b.voteShare - a.voteShare || a.year - b.year : a.year - b.year);
  const fragment = document.createDocumentFragment();
  rows.forEach(e => {
    const tr = make('tr');
    const year = make('td', '', e.label);
    const party = make('td', '', e.party);
    const seats = make('td', 'numeric', String(e.seats));
    seats.append(make('small', '', `of ${e.totalSeats}`));
    const voteShare = make('td', 'numeric', percent(e.voteShare));
    const seatShare = make('td', 'numeric', percent(metrics.seatShare.value(e)));
    const result = make('td', '', e.outcome);
    const source = make('a', '', 'Source ↗');
    source.href = sourceFor(e).url;
    source.title = sourceFor(e).title;
    const sourceLine = make('div');
    sourceLine.append(source);
    result.append(sourceLine);
    if (e.initialSeats) result.append(make('small', '', e.note));
    tr.append(year, party, seats, voteShare, seatShare, result);
    fragment.append(tr);
  });
  $('results-body').replaceChildren(fragment);
  $('table-count').textContent = `${rows.length} of 18 elections`;
}

async function init() {
  try {
    const response = await fetch(new URL('../data/elections.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Election data is unavailable.');
    data = validate(await response.json());
    populateSelectors();
    buildBars();
    renderChart();
    selectElection(selected, false);
    renderComparison();
    renderTable();
    document.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
      metric = button.dataset.metric;
      renderChart();
      const e = data.elections.find(e => e.year === selected);
      $('explorer-status').textContent = `Chart measure: ${metrics[metric].title}. Selected election: ${e.label}, ${metric === 'seats' ? `${e.seats} seats` : percent(metrics[metric].value(e))}.`;
    }));
    $('election-select').addEventListener('change', event => {
      selectElection(Number(event.target.value));
      barButtons.find(button => Number(button.dataset.year) === selected).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    for (const id of ['compare-from', 'compare-to']) $(id).addEventListener('change', renderComparison);
    for (const id of ['era-filter', 'data-sort']) $(id).addEventListener('change', renderTable);
    for (const id of ['explorer', 'comparison', 'data-controls', 'table-wrap']) $(id).hidden = false;
    $('load-status').hidden = true;
    const scroll = document.querySelector('.chart-scroll');
    scroll.scrollLeft = scroll.scrollWidth;
  } catch (error) {
    const status = $('load-status');
    status.classList.add('is-error');
    status.replaceChildren(document.createTextNode('The interactive data did not load. '));
    const download = make('a', '', 'Download the national record as CSV');
    download.href = 'data/elections.csv';
    download.download = '';
    status.append(download, document.createTextNode(', or reload this page to try again.'));
    console.error('Election explorer could not load:', error);
  }
}

init();
