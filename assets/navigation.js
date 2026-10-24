const views = [...document.querySelectorAll('[data-view]')];
const dialog = document.getElementById('site-menu');
const toggle = document.getElementById('menu-toggle');
const chrome = document.getElementById('route-chrome');
const labels = {
  home: 'Overview', national: 'National', states: 'States & territories',
  analysis: 'Analysis', latest: '2026 results', sources: 'Sources & definitions'
};
const sections = {
  explore: ['Election explorer', '#explore'], compare: ['Compare elections', '#compare'],
  data: ['All results', '#data'], states: ['State profiles', '#states'],
  'state-profile': ['State profiles', '#states'], 'state-title': ['State profiles', '#states'],
  'state-comparisons': ['Compare all areas', '#state-comparisons'],
  'state-methodology': ['Comparison rules', '#state-methodology'],
  analysis: ['The national story', '#analysis'], latest: ['2026 results', '#latest'],
  'assembly-results': ['Assembly elections', '#assembly-results'],
  'by-election-results': ['By-election', '#by-election-results'],
  methodology: ['Definitions', '#methodology'], sources: ['Source records', '#sources']
};
let currentView = 'home';

function closeMenu() {
  resetMenuState();
  if (dialog.open) dialog.close();
}

function resetMenuState() {
  toggle.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('menu-open');
}

function openMenu() {
  dialog.showModal();
  toggle.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('menu-open');
}

function sectionFor(target, view) {
  if (sections[target.id]) return sections[target.id];
  if (target.closest('#sources')) return sections.sources;
  if (target.closest('#state-profile')) return sections['state-profile'];
  const first = { national: 'explore', states: 'states', analysis: 'analysis', latest: 'latest', sources: 'methodology' };
  return sections[first[view]];
}

function renderRoute(moveFocus = false) {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)) || 'top'; }
  catch { id = 'top'; }
  let target = document.getElementById(id);
  if (id === 'main') target = views.find(view => view.dataset.view === currentView)?.querySelector('section');
  if (!target || !target.closest('[data-view]')) target = document.getElementById('top');
  const selected = target.closest('[data-view]');
  currentView = selected.dataset.view;
  for (const view of views) view.hidden = view !== selected;
  document.body.dataset.currentView = currentView;
  document.title = `${currentView === 'home' ? 'Congress' : labels[currentView]} | An Electoral Story`;

  document.querySelectorAll('[data-view-link]').forEach(link => {
    if (link.dataset.viewLink === currentView) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-section-nav]').forEach(nav => nav.hidden = nav.dataset.sectionNav !== currentView);
  chrome.hidden = currentView === 'home';
  const crumbs = document.getElementById('breadcrumbs');
  crumbs.replaceChildren();
  const home = document.createElement('a');
  home.href = '#top';
  home.textContent = 'Overview';
  crumbs.append(home);
  if (currentView !== 'home') {
    const separator = document.createElement('span');
    separator.textContent = '/';
    separator.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = labels[currentView];
    label.setAttribute('aria-current', 'page');
    crumbs.append(separator, label);
  }
  const section = sectionFor(target, currentView);
  document.querySelectorAll('.section-navigation a').forEach(link => {
    if (section && link.getAttribute('href') === section[1]) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  const sectionNav = document.querySelector('.section-navigation');
  const activeLink = sectionNav.querySelector('[data-section-nav]:not([hidden]) a[aria-current]');
  if (activeLink) {
    const linkBox = activeLink.getBoundingClientRect();
    const navBox = sectionNav.getBoundingClientRect();
    if (linkBox.left < navBox.left) sectionNav.scrollLeft -= navBox.left - linkBox.left;
    else if (linkBox.right > navBox.right) sectionNav.scrollLeft += linkBox.right - navBox.right;
  }
  document.getElementById('navigation-status').textContent = `${labels[currentView]}${section ? `: ${section[0]}` : ''}`;

  if (moveFocus || location.hash) {
    let heading = target.matches('h1,h2,h3,h4') ? target : target.querySelector('h1,h2,h3,h4');
    if (!heading || !heading.getClientRects().length) heading = selected.querySelector('h1,h2');
    if (heading) {
      heading.tabIndex = -1;
      if (moveFocus) heading.focus({ preventScroll: true });
    }
    const destination = target.getClientRects().length ? target : heading;
    destination?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

toggle.hidden = false;
toggle.addEventListener('click', openMenu);
document.getElementById('menu-close').addEventListener('click', closeMenu);
dialog.addEventListener('close', resetMenuState);
dialog.addEventListener('cancel', resetMenuState);
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeMenu();
});
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (dialog.contains(link)) closeMenu();
  if (link.hash === location.hash || (!location.hash && link.hash === '#top')) {
    event.preventDefault();
    renderRoute(true);
  }
});
window.addEventListener('hashchange', () => renderRoute(true));
window.matchMedia('(min-width: 961px)').addEventListener('change', event => {
  if (event.matches) closeMenu();
});
document.querySelector('.bottom-navigation').hidden = false;
document.documentElement.classList.add('navigation-ready');
renderRoute();
