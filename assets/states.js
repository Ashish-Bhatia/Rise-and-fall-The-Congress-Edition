const $ = id => document.getElementById(id);
const percentage = value => value === null ? 'Not contested' : `${value.toFixed(2)}%`;
const signed = (n, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
const number = n => n.toLocaleString('en-IN');
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export function aggregateUnits(records) {
  const result = {};
  for (const key of ['totalSeats', 'seatsWon', 'seatsContested', 'congressVotes', 'validVotes']) {
    result[key] = records.reduce((sum, row) => sum + row[key], 0);
  }
  result.validVoteShare = result.congressVotes / result.validVotes * 100;
  result.strikeRate = result.seatsContested ? result.seatsWon / result.seatsContested * 100 : null;
  return result;
}

export function validateStates(input) {
  if (input?.schemaVersion !== 1 || input.partyCode !== 'INC' ||
      !Array.isArray(input.records) || input.records.length !== 72 ||
      !Array.isArray(input.comparisons) || input.comparisons.length !== 35) {
    throw new Error('Unexpected state dataset.');
  }
  const keys = new Set();
  for (const row of input.records) {
    const key = `${row.year}:${row.unit}`;
    if (![2019, 2024].includes(row.year) || !row.unit || keys.has(key)) throw new Error('Duplicate or invalid unit.');
    keys.add(key);
    for (const field of ['totalSeats', 'seatsWon', 'seatsContested', 'congressVotes', 'validVotes']) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0) throw new Error('Invalid state count.');
    }
    if (!row.totalSeats || !row.validVotes || row.congressVotes > row.validVotes ||
        row.seatsWon > row.seatsContested || row.seatsContested > row.totalSeats ||
        (row.seatsContested === 0 && row.congressVotes !== 0)) throw new Error('Inconsistent state count.');
    const calculated = aggregateUnits([row]);
    if (!Number.isFinite(row.validVoteShare) || Math.abs(calculated.validVoteShare - row.validVoteShare) > 0.000001 ||
        (calculated.strikeRate === null ? row.strikeRate !== null : !Number.isFinite(row.strikeRate) || Math.abs(calculated.strikeRate - row.strikeRate) > 0.000001)) {
      throw new Error('Inconsistent state percentage.');
    }
    if (!Array.isArray(row.sources) || row.sources.length !== 2) throw new Error('Missing state sources.');
    for (const id of row.sources) {
      const source = input.sources?.[id];
      if (!source?.title || new URL(source.url).protocol !== 'https:' || new URL(source.copyUrl).protocol !== 'https:') throw new Error('Invalid state source.');
    }
  }
  for (const [year, seatsWon, seatsContested, congressVotes, validVotes] of [[2019, 52, 421, 119495214, 607650051], [2024, 99, 328, 136758952, 638990692]]) {
    const rows = input.records.filter(r => r.year === year);
    const total = aggregateUnits(rows);
    if (rows.length !== 36 || total.totalSeats !== 543 || total.seatsWon !== seatsWon ||
        total.seatsContested !== seatsContested || total.congressVotes !== congressVotes || total.validVotes !== validVotes) throw new Error('State totals do not reconcile.');
    const members = input.comparisons.flatMap(c => c.units?.[year] || []);
    if (members.length !== 36 || new Set(members).size !== 36 || members.some(name => !keys.has(`${year}:${name}`))) throw new Error('Overlapping or missing comparison units.');
  }
  const ids = new Set();
  for (const area of input.comparisons) {
    if (!area.name || !/^[a-z0-9-]+$/.test(area.id) || ids.has(area.id) ||
        !['state', 'union-territory', 'combined-area'].includes(area.kind) || typeof area.note !== 'string') throw new Error('Invalid comparison area.');
    ids.add(area.id);
  }
  return input;
}

export function buildComparisons(input) {
  return input.comparisons.map(area => {
    const years = {};
    for (const year of [2019, 2024]) {
      const records = area.units[year].map(name => input.records.find(row => row.year === year && row.unit === name));
      years[year] = { ...aggregateUnits(records), records };
    }
    return { ...area, years, seatChange: years[2024].seatsWon - years[2019].seatsWon,
      voteChange: years[2024].validVoteShare - years[2019].validVoteShare };
  });
}

let areas = [];
let selectedArea = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('area') || 'maharashtra' : 'maharashtra';
let selectedMeasure = 'seatsWon';
const measures = {
  seatsWon: { label: 'Seats won', value: row => row.seatsWon, format: n => String(n), max: row => row.totalSeats },
  seatsContested: { label: 'Seats contested', value: row => row.seatsContested, format: n => String(n), max: row => row.totalSeats },
  validVoteShare: { label: 'Valid vote share', value: row => row.validVoteShare, format: percentage, max: () => 100 },
  strikeRate: { label: 'Strike rate', value: row => row.strikeRate, format: percentage, max: () => 100 }
};

function renderArea(announce = true) {
  const area = areas.find(row => row.id === selectedArea);
  const from = area.years[2019];
  const to = area.years[2024];
  if (announce) {
    const url = new URL(location.href);
    url.searchParams.set('area', area.id);
    history.replaceState(null, '', url);
  }
  $('state-select').value = area.id;
  $('state-title').textContent = area.name;
  $('state-category').textContent = area.kind === 'state' ? 'STATE TOTAL' : area.kind === 'combined-area' ? 'EXPLICITLY COMBINED AREA' : 'UNION TERRITORY';
  $('state-seat-change').textContent = `${signed(area.seatChange)} seats`;
  $('state-profile-note').textContent = area.note || 'Congress’s own general-election result. Alliance partners and later membership changes are excluded.';
  const cards = [
    ['Seats won', 'seatsWon', n => String(n), `${signed(area.seatChange)} seats`],
    ['Seats contested', 'seatsContested', n => String(n), `${signed(to.seatsContested - from.seatsContested)} contests`],
    ['Valid vote share', 'validVoteShare', percentage, `${signed(area.voteChange, 2)} pp`],
    ['Strike rate', 'strikeRate', percentage, from.strikeRate === null || to.strikeRate === null ? 'Change unavailable: no contest in one year' : `${signed(to.strikeRate - from.strikeRate, 2)} pp`]
  ];
  $('state-stat-cards').replaceChildren(...cards.map(([label, key, format, change]) => {
    const card = node('div', 'state-stat-card');
    card.append(node('h4', '', label));
    for (const year of [2019, 2024]) {
      const line = node('p', 'state-stat-line');
      line.append(node('span', '', String(year)), node('strong', '', format(area.years[year][key])));
      card.append(line);
    }
    card.append(node('small', '', change));
    return card;
  }));
  const measure = measures[selectedMeasure];
  $('state-measure-title').textContent = measure.label;
  $('state-chart-scale').textContent = `Scale: 0–${measure.max(to)}${['strikeRate', 'validVoteShare'].includes(selectedMeasure) ? '%' : ' constituencies'}`;
  for (const year of [2019, 2024]) {
    const value = measure.value(area.years[year]);
    $(`state-bar-${year}`).style.width = `${value === null ? 0 : value / measure.max(area.years[year]) * 100}%`;
    $(`state-bar-value-${year}`).textContent = measure.format(value);
  }
  $('state-chart').setAttribute('aria-label', `${area.name}, ${measure.label}: 2019 ${measure.format(measure.value(from))}; 2024 ${measure.format(measure.value(to))}.`);
  document.querySelectorAll('[data-state-measure]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stateMeasure === selectedMeasure)));
  const rawRows = [];
  for (const year of [2019, 2024]) {
    for (const row of area.years[year].records) {
      const tr = node('tr');
      const name = node('th', '', `${year} · ${row.unit}`);
      name.scope = 'row';
      tr.append(name, node('td', 'numeric', `${row.seatsWon} / ${row.totalSeats}`),
        node('td', 'numeric', String(row.seatsContested)), node('td', 'numeric', number(row.congressVotes)),
        node('td', 'numeric', number(row.validVotes)), node('td', 'numeric', percentage(row.validVoteShare)));
      rawRows.push(tr);
    }
  }
  $('state-raw-body').replaceChildren(...rawRows);
  if (announce) $('state-profile-status').textContent = `${area.name}. Congress seats: ${from.seatsWon} in 2019, ${to.seatsWon} in 2024. Contests: ${from.seatsContested} to ${to.seatsContested}. Valid vote share: ${percentage(from.validVoteShare)} to ${percentage(to.validVoteShare)}.`;
}

function pairCell(area, key, format) {
  const cell = node('td', 'numeric');
  const line = node('span', 'state-table-pair');
  line.append(node('span', '', format(area.years[2019][key])), node('span', 'pair-arrow', '→'), node('strong', '', format(area.years[2024][key])));
  cell.append(line);
  return cell;
}

function openArea(area) {
  selectedArea = area.id;
  renderArea();
  if (location.hash !== '#state-profile') location.hash = 'state-profile';
  $('state-title').focus({ preventScroll: true });
  $('state-profile').scrollIntoView({ behavior: 'auto', block: 'start' });
}

function areaCard(area) {
  const card = node('details', 'area-card');
  const summary = node('summary');
  const title = node('span');
  title.append(node('span', '', area.name), node('small', '', `${area.years[2019].seatsWon} → ${area.years[2024].seatsWon} seats (${signed(area.seatChange)})`));
  summary.append(title);
  const list = node('dl');
  for (const [label, key, format] of [['Seats won', 'seatsWon', String], ['Contested', 'seatsContested', String], ['Valid vote share', 'validVoteShare', percentage], ['Strike rate', 'strikeRate', percentage]]) {
    const item = node('div');
    item.append(node('dt', '', label), node('dd', '', `${format(area.years[2019][key])} → ${format(area.years[2024][key])}`));
    list.append(item);
  }
  const button = node('button', '', 'Open full area profile ↗');
  button.type = 'button';
  button.setAttribute('aria-label', `View ${area.name} comparison`);
  button.addEventListener('click', () => openArea(area));
  card.append(summary, list);
  if (area.kind === 'combined-area') card.append(node('p', 'area-card-note', 'Combined geography. The profile shows the original areas and totals.'));
  card.append(button);
  return card;
}

function renderStateTable() {
  const query = $('state-search').value.trim().toLocaleLowerCase('en');
  const kind = $('state-kind').value;
  const sort = $('state-sort').value;
  const rows = areas.filter(area => (!query || `${area.name} ${Object.values(area.units).flat().join(' ')}`.toLocaleLowerCase('en').includes(query)) &&
    (kind === 'all' || (kind === 'states' ? area.kind === 'state' : area.kind !== 'state')));
  const alphabetical = (a, b) => a.name.localeCompare(b.name, 'en');
  rows.sort((a, b) => sort === 'name' ? alphabetical(a, b) : sort === 'votes' ? b.voteChange - a.voteChange || alphabetical(a, b) :
    sort === 'wins' ? b.years[2024].seatsWon - a.years[2024].seatsWon || alphabetical(a, b) : b.seatChange - a.seatChange || alphabetical(a, b));
  const fragment = document.createDocumentFragment();
  for (const area of rows) {
    const tr = node('tr');
    const th = node('th');
    th.scope = 'row';
    const button = node('button', 'state-row-button', area.name);
    button.type = 'button';
    button.setAttribute('aria-label', `View ${area.name} comparison`);
    button.addEventListener('click', () => openArea(area));
    th.append(button);
    if (area.units[2019].length > 1 || area.units[2024].length > 1) th.append(node('small', '', 'Combined geography, see profile'));
    const change = node('td', `numeric state-delta ${area.seatChange < 0 ? 'negative' : area.seatChange > 0 ? 'positive' : ''}`, signed(area.seatChange));
    const voteChange = node('td', 'numeric', `${signed(area.voteChange, 2)} pp`);
    const sourceCell = node('td');
    for (const year of [2019, 2024]) {
      const link = node('a', '', String(year));
      link.href = `#source-state-${year}`;
      link.setAttribute('aria-label', `${year} ECI sources for ${area.name}`);
      sourceCell.append(link, document.createTextNode(' '));
    }
    tr.append(th, pairCell(area, 'seatsWon', n => String(n)), change, pairCell(area, 'seatsContested', n => String(n)),
      pairCell(area, 'validVoteShare', percentage), voteChange, pairCell(area, 'strikeRate', percentage), sourceCell);
    fragment.append(tr);
  }
  if (!rows.length) {
    const tr = node('tr');
    const td = node('td', '', 'No area matches your search. Clear the search or choose another area type.');
    td.colSpan = 8;
    tr.append(td);
    fragment.append(tr);
  }
  $('state-results-body').replaceChildren(fragment);
  $('state-cards').replaceChildren(...rows.map(areaCard));
  if (!rows.length) $('state-cards').append(node('p', 'load-status', 'No area matches your search. Clear the search or choose another area type.'));
  $('state-table-count').textContent = `${rows.length} of 35 comparable areas`;
}

async function initStates() {
  try {
    const response = await fetch(new URL('../data/states-2019-2024.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('State data unavailable.');
    areas = buildComparisons(validateStates(await response.json()));
    if (!areas.some(area => area.id === selectedArea)) selectedArea = 'maharashtra';
    for (const area of areas) {
      const option = node('option', '', area.name);
      option.value = area.id;
      $('state-select').append(option);
    }
    $('state-select').addEventListener('change', event => {
      selectedArea = event.target.value;
      renderArea();
    });
    for (const button of document.querySelectorAll('[data-state-measure]')) {
      button.addEventListener('click', () => {
        selectedMeasure = button.dataset.stateMeasure;
        renderArea(false);
        $('state-profile-status').textContent = $('state-chart').getAttribute('aria-label');
      });
    }
    $('state-search').addEventListener('input', renderStateTable);
    for (const id of ['state-kind', 'state-sort']) $(id).addEventListener('change', renderStateTable);
    $('state-clear').addEventListener('click', () => {
      $('state-search').value = '';
      $('state-kind').value = 'all';
      $('state-sort').value = 'gain';
      renderStateTable();
      $('state-search').focus();
    });
    renderArea(false);
    renderStateTable();
    for (const id of ['state-profile', 'state-controls', 'state-table-wrap', 'state-cards']) $(id).hidden = false;
    $('state-load-status').hidden = true;
  } catch (error) {
    const status = $('state-load-status');
    status.classList.add('is-error');
    status.replaceChildren(document.createTextNode('The state explorer did not load. '));
    const download = node('a', '', 'Download the state comparison CSV');
    download.href = 'data/state-comparisons.csv';
    download.download = '';
    status.append(download, document.createTextNode(', or reload to try again.'));
    console.error('State comparison could not load:', error);
  }
}

if (typeof document !== 'undefined') initStates();
