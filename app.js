const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lc = (s) => String(s ?? '').toLowerCase();
// case- and accent-insensitive form used by search-as-you-type
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const num = (n) => n.toLocaleString('en-GB');
const AGE_ORDER = ['U', 'PG', '12A', '12', '15', '18', 'R18'];
const NR = 'Unrated';
const POSTER = (id, size = 's592') => `https://images.justwatch.com/poster/${id}/${size}/title.webp`;
const langNames = new Intl.DisplayNames('en', { type: 'language' });
const langName = (c) => { try { return langNames.of(c) ?? c; } catch { return c; } };
const TODAY = new Date().toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
const RECENT_FROM = monthsAgo(12); // "recent" = released in the last 12 months
const isRecent = (r) => r.releaseDate >= RECENT_FROM && r.releaseDate <= TODAY;
const WR_M = 1500, WR_C = 6.2; // Bayesian weighting so a 9.8 from 12 votes doesn't top a list
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

$('#summary').textContent = 'Loading…';

// Over http(s) read the JSON lists. Opened straight from disk (file://) browsers block fetch(),
// so fall back to data/*.js files made by `npm run offline`.
const loadScript = (name) => new Promise((resolve, reject) => {
  const el = document.createElement('script');
  el.src = `data/${name}.js`;
  el.onload = () => resolve(window.__lakestreamData?.[name]);
  el.onerror = () => reject(new Error(`Could not load data/${name}.js`));
  document.head.append(el);
});
const load = async (name) => {
  try {
    const r = await fetch(`data/${name}.json`);
    if (!r.ok) throw new Error(name);
    return await r.json();
  } catch {
    return loadScript(name);
  }
};

(async () => {
try {
const [meta, films, series] = await Promise.all([load('meta'), load('films'), load('series')]);
const platforms = Object.fromEntries(meta.platforms.map((p) => [p.id, p]));
const data = [...films, ...series];
const byId = new Map(data.map((r) => [r.id, r]));

for (const r of data) {
  r.ageLabel = r.age || NR;
  r.languages ??= [];
  r.countries ??= [];
  // anime = animation made in Japan, or anything on Crunchyroll's animation-tagged library
  r._anime = r.genres.includes('Animation') && (r.countries.includes('JP') || r.offers.some((o) => o.platform === 'crunchyroll'));
  r._wr = r.rating == null ? null : (r.votes / (r.votes + WR_M)) * r.rating + (WR_M / (r.votes + WR_M)) * WR_C;
  r._ts = Date.parse(r.releaseDate) || 0;
  r._n = { title: norm(r.title), people: norm(`${r.cast.join(' | ')} | ${r.directors.join(' | ')}`) };
  for (const o of r.offers) { o._a = o.audio ? o.audio.split(' ') : []; o._s = o.subs ? o.subs.split(' ') : []; }
  r._aud = [...new Set(r.offers.flatMap((o) => o._a))];
  r._sub = [...new Set(r.offers.flatMap((o) => o._s))];
  r._t = {
    title: lc(r.title), genres: lc(r.genres.join(' | ')), directors: lc(r.directors.join(' | ')),
    cast: lc(r.cast.join(' | ')), studios: lc(r.studios.join(' | ')), awards: lc(r.awards),
    overview: lc(r.overview), age: lc(r.ageLabel), language: lc(r.languages.join(' | ')),
    audio: lc(r._aud.map(langName).join(' | ')), subs: lc(r._sub.map(langName).join(' | ')),
  };
  r._t.people = `${r._t.cast} | ${r._t.directors}`;
  r._t.all = [r._t.title, r._t.cast, r._t.directors, r._t.studios, r._t.genres, r._t.overview].join(' | ');
}

// name -> number of titles, for the actor/director pickers
const peopleIndex = (field) => {
  const m = new Map();
  for (const r of data) for (const n of r[field]) m.set(n, (m.get(n) ?? 0) + 1);
  return [...m].map(([n, c]) => ({ n, c, l: lc(n) })).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n));
};
const people = { actors: peopleIndex('cast'), directors: peopleIndex('directors') };

// ---------- columns ----------
const fmtRuntime = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : '');
const COLS = [
  { key: 'title', label: 'Title', text: 'title', sort: (r) => r._t.title },
  { key: 'platforms', label: 'Platform', sort: (r) => r.offers[0]?.platform },
  { key: 'genres', label: 'Genres', text: 'genres', sort: (r) => lc(r.genres[0]) },
  { key: 'overview', label: 'Description', text: 'overview', sort: (r) => r._t.overview || null },
  { key: 'language', label: 'Language', text: 'language', sort: (r) => lc(r.languages[0]) || null },
  { key: 'audio', label: 'Audio', text: 'audio', sort: (r) => lc(langName(r._aud[0] ?? '')) || null },
  { key: 'subs', label: 'Subtitles', text: 'subs', sort: (r) => lc(langName(r._sub[0] ?? '')) || null },
  { key: 'type', label: 'Type', sort: (r) => r.type },
  { key: 'release', label: 'Released', sort: (r) => r.releaseDate || null },
  { key: 'runtime', label: 'Runtime', sort: (r) => r.runtime },
  { key: 'rating', label: 'IMDb', sort: (r) => r.rating },
  { key: 'age', label: 'Age', text: 'age', sort: (r) => { const i = AGE_ORDER.indexOf(r.age); return r.age ? (i < 0 ? 99 : i) : null; } },
  { key: 'seasons', label: 'Seasons', sort: (r) => r.seasons },
  { key: 'episodes', label: 'Episodes', sort: (r) => r.episodes },
  { key: 'directors', label: 'Director', text: 'directors', sort: (r) => lc(r.directors[0]) || null },
  { key: 'cast', label: 'Cast', text: 'cast', sort: (r) => lc(r.cast[0]) || null },
  { key: 'studios', label: 'Studio', text: 'studios', sort: (r) => lc(r.studios[0]) || null },
  { key: 'awards', label: 'Awards', text: 'awards', sort: (r) => r.awardCount || null },
];

// ---------- state ----------
const fresh = () => ({
  type: 'all', access: 'any', text: {}, num: {}, hasAwards: false, recent: false, anime: false,
  sets: { platforms: new Set(), genres: new Set(), ages: new Set(), actors: new Set(), directors: new Set(), langs: new Set(), audio: new Set(), subs: new Set() },
  sort: { key: 'title', dir: 1 }, page: 0, pageSize: 100,
});
const cloneState = (s) => ({
  ...s, text: { ...s.text }, num: { ...s.num }, sort: { ...s.sort },
  sets: Object.fromEntries(Object.entries(s.sets).map(([k, v]) => [k, new Set(v)])),
});
let state = fresh();
let hidden = new Set();
let expand = true;
try {
  hidden = new Set(JSON.parse(localStorage.getItem('lakestream.hidden') ?? '[]'));
  expand = localStorage.getItem('lakestream.expand') !== '0';
} catch { /* storage unavailable */ }

// ---------- filtering ----------
function matches(r) {
  const s = state;
  if (s.type !== 'all' && r.type !== s.type) return false;
  const offers = s.sets.platforms.size ? r.offers.filter((o) => s.sets.platforms.has(o.platform)) : r.offers;
  if (!offers.length) return false;
  if (s.access === 'adfree' && !offers.some((o) => o.adFree)) return false;
  if (s.access === 'ads' && !offers.some((o) => o.withAds)) return false;
  if (s.access === 'adsonly' && offers.some((o) => o.adFree)) return false;
  if (s.access === 'noads' && offers.some((o) => o.withAds)) return false;
  if (s.sets.langs.size && !r.languages.some((l) => s.sets.langs.has(l))) return false;
  if (s.sets.audio.size && !offers.some((o) => o._a.some((c) => s.sets.audio.has(c)))) return false;
  if (s.sets.subs.size && !offers.some((o) => o._s.some((c) => s.sets.subs.has(c)))) return false;
  for (const g of s.sets.genres) if (!r.genres.includes(g)) return false;
  for (const a of s.sets.actors) if (!r.cast.includes(a)) return false;
  for (const d of s.sets.directors) if (!r.directors.includes(d)) return false;
  if (s.sets.ages.size && !s.sets.ages.has(r.ageLabel)) return false;
  if (s.hasAwards && !r.awards) return false;
  if (s.recent && !isRecent(r)) return false;
  if (s.anime && !r._anime) return false;
  const n = s.num;
  if (n.yearMin != null && !(r.year >= n.yearMin)) return false;
  if (n.yearMax != null && !(r.year <= n.yearMax)) return false;
  if (n.ratingMin != null && !(r.rating >= n.ratingMin)) return false;
  if (n.ratingMax != null && !(r.rating <= n.ratingMax)) return false;
  if (n.runtimeMin != null && !(r.runtime >= n.runtimeMin)) return false;
  if (n.runtimeMax != null && !(r.runtime <= n.runtimeMax)) return false;
  if (n.seasonsMin != null && !(r.seasons >= n.seasonsMin)) return false;
  if (n.episodesMin != null && !(r.episodes >= n.episodesMin)) return false;
  if (n.episodesMax != null && !(r.episodes <= n.episodesMax)) return false;
  if (n.seasonsMax != null && !(r.seasons <= n.seasonsMax)) return false;
  if (n.awardsMin != null && !(r.awardCount >= n.awardsMin)) return false;
  for (const [k, v] of Object.entries(s.text)) {
    if (!v) continue;
    const hay = r._t[k];
    for (const term of v.split(/\s+/)) if (!hay.includes(term)) return false;
  }
  return true;
}

function sortRows(rows) {
  const col = COLS.find((c) => c.key === state.sort.key);
  const dir = state.sort.dir;
  const keyed = rows.map((r) => [col.sort(r), r]);
  keyed.sort((a, b) => {
    const x = a[0], y = b[0];
    const nx = x == null || x === '', ny = y == null || y === '';
    if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1; // empties always last
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  return keyed.map((k) => k[1]);
}

// ---------- table ----------
const dash = '<span class="muted" title="Not listed">—</span>';
const langCell = (codes) => {
  if (!codes.length) return `<td>${dash}</td>`;
  const names = codes.map(langName);
  const short = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
  return `<td title="${esc(names.join(', '))}">${esc(short)}</td>`;
};
const cell = {
  title: (r) => `<td class="title">${esc(r.title)}</td>`,
  platforms: (r) => `<td>${r.offers.map((o) => {
    const p = platforms[o.platform];
    const note = o.adFree ? '' : ' <small>ads only</small>';
    return `<span class="badge" style="background:${esc(p.color)}">${esc(p.name)}${note}</span>`;
  }).join('')}</td>`,
  genres: (r) => `<td class="clamp"><div title="${esc(r.genres.join(', '))}">${esc(r.genres.join(', '))}</div></td>`,
  overview: (r) => `<td class="clamp desc"><div>${esc(r.overview)}</div></td>`,
  language: (r) => `<td>${r.languages.length ? esc(r.languages.join(', ')) : dash}</td>`,
  audio: (r) => langCell(r._aud),
  subs: (r) => langCell(r._sub),
  type: (r) => `<td class="nowrap">${r.type === 'film' ? 'Film' : 'Series'}</td>`,
  release: (r) => `<td class="nowrap">${r.releaseDate ? dateFmt.format(new Date(r.releaseDate + 'T00:00:00Z')) : ''}</td>`,
  runtime: (r) => `<td class="num">${fmtRuntime(r.runtime)}</td>`,
  rating: (r) => `<td class="num" title="${num(r.votes)} votes">${r.rating ?? ''}</td>`,
  age: (r) => `<td>${r.age ? `<span class="age">${esc(r.age)}</span>` : ''}</td>`,
  seasons: (r) => `<td class="num">${r.seasons ?? ''}</td>`,
  episodes: (r) => `<td class="num">${r.episodes ?? ''}</td>`,
  directors: (r) => `<td class="clamp"><div title="${esc(r.directors.join(', '))}">${esc(r.directors.join(', '))}</div></td>`,
  cast: (r) => `<td class="clamp"><div title="${esc(r.cast.join(', '))}">${esc(r.cast.join(', '))}</div></td>`,
  studios: (r) => `<td class="clamp"><div title="${esc(r.studios.join(', '))}">${esc(r.studios.join(', '))}</div></td>`,
  awards: (r) => `<td class="clamp"><div title="${esc(r.awards)}">${esc(r.awards)}</div></td>`,
};

const visibleCols = () => COLS.filter((c) => !hidden.has(c.key));

function buildHead() {
  const cols = visibleCols();
  $('#tbl thead').innerHTML =
    `<tr>${cols.map((c) => `<th data-sort="${c.key}" aria-sort="none">${c.label}</th>`).join('')}</tr>` +
    `<tr>${cols.map((c) => `<th>${c.text ? `<input type="search" data-text="${c.text}" aria-label="Filter ${c.label}">` : ''}</th>`).join('')}</tr>`;
  for (const el of $$('thead [data-text]')) el.value = state.text[el.dataset.text] ?? '';
  updateSortIndicators();
}

function updateSortIndicators() {
  for (const th of $$('th[data-sort]')) {
    th.setAttribute('aria-sort', th.dataset.sort === state.sort.key ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  }
}

function renderTable(filtered) {
  const rows = sortRows(filtered);
  const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
  const cols = visibleCols();
  $('#tbl').classList.toggle('collapsed', !expand);
  $('#tbl tbody').innerHTML = slice.length
    ? slice.map((r) => `<tr data-id="${esc(r.id)}">${cols.map((c) => cell[c.key](r)).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${cols.length}">No titles match these filters.</td></tr>`;
  $('#pageinfo').textContent = `Page ${state.page + 1} of ${pages}`;
  $('#prev').disabled = state.page === 0;
  $('#next').disabled = state.page >= pages - 1;
  $('.tablewrap').scrollTop = 0;
}

// ---------- sidebar ----------
function countBy(fn) {
  const m = new Map();
  for (const r of data) for (const k of fn(r)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
function checkboxes(target, set, entries, labelFn = (k) => k, counts = true) {
  $(target).innerHTML = entries.map(([k, n]) =>
    `<label><input type="checkbox" data-set="${set}" value="${esc(k)}">${esc(labelFn(k))}${counts ? `<span class="n">${num(n)}</span>` : ''}</label>`).join('');
}
checkboxes('#f-platforms', 'platforms', meta.platforms.map((p) => [p.id, data.filter((r) => r.offers.some((o) => o.platform === p.id)).length]), (id) => platforms[id].name);
const genreCounts = countBy((r) => r.genres);
checkboxes('#f-genres', 'genres', [...genreCounts].sort((a, b) => a[0].localeCompare(b[0])));
checkboxes('#f-ages', 'ages', [...countBy((r) => [r.ageLabel])].sort((a, b) => {
  const ia = AGE_ORDER.indexOf(a[0]), ib = AGE_ORDER.indexOf(b[0]);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
}), (k) => k, false);

const origCounts = [...countBy((r) => r.languages)].sort((a, b) => b[1] - a[1]);
checkboxes('#f-langs', 'langs', origCounts);
checkboxes('#f-audio', 'audio', [...countBy((r) => r._aud)].sort((a, b) => b[1] - a[1]), langName);
checkboxes('#f-subs', 'subs', [...countBy((r) => r._sub)].sort((a, b) => b[1] - a[1]), langName);

const pickerQuery = { actors: '', directors: '' };
function renderPicker(kind) {
  const q = pickerQuery[kind];
  const sel = state.sets[kind];
  $(`#chips-${kind}`).innerHTML = [...sel].map((n) =>
    `<button type="button" class="chip" data-pick="${kind}" data-v="${esc(n)}" title="Remove">${esc(n)} ✕</button>`).join('');
  const out = [];
  for (const p of people[kind]) {
    if (sel.has(p.n) || (q && !p.l.includes(q))) continue;
    out.push(p);
    if (out.length >= 30) break;
  }
  $(`#list-${kind}`).innerHTML = out.map((p) =>
    `<button type="button" class="pick" data-pick="${kind}" data-v="${esc(p.n)}">${esc(p.n)}<span class="n">${num(p.c)}</span></button>`).join('')
    || '<span class="hint">No matches</span>';
}

// push the whole state back into the controls (after reset / drill-down / back)
function syncUI() {
  for (const el of $$('[data-text]')) el.value = state.text[el.dataset.text] ?? '';
  for (const el of $$('[data-num]')) el.value = state.num[el.dataset.num] ?? '';
  for (const el of $$('input[type=checkbox][data-set]')) el.checked = state.sets[el.dataset.set].has(el.value);
  $(`input[name=type][value=${state.type}]`).checked = true;
  $(`input[name=access][value=${state.access}]`).checked = true;
  $('#hasAwards').checked = state.hasAwards;
  $('#recentOnly').checked = state.recent;
  $('#animeOnly').checked = state.anime;
  $('#pagesize').value = String(state.pageSize);
  renderPicker('actors');
  renderPicker('directors');
  updateSortIndicators();
}

function buildColMenu() {
  $('#colmenu').innerHTML = COLS.map((c) =>
    `<label><input type="checkbox" data-col="${c.key}" ${hidden.has(c.key) ? '' : 'checked'}> ${c.label}</label>`).join('');
}

// ---------- flyout ----------
function openFlyout(r) {
  const row = (label, value) => (value ? `<dt>${label}</dt><dd>${esc(value)}</dd>` : '');
  const size = r.type === 'series'
    ? [r.seasons && `${r.seasons} season${r.seasons > 1 ? 's' : ''}`, r.episodes && `${r.episodes} episodes`].filter(Boolean).join(' · ')
    : '';
  $('#flyout').innerHTML = `
    <div class="fly-bar"><button type="button" class="close" id="fly-close" aria-label="Close details">✕</button></div>
    <div class="poster${r.poster ? '' : ' none'}">${r.poster ? `<img alt="Poster for ${esc(r.title)}" referrerpolicy="no-referrer" src="${POSTER(r.poster)}">` : ''}</div>
    <div class="fbody">
      <h2>${esc(r.title)}</h2>
      <p class="meta">${[r.year, r.type === 'film' ? 'Film' : 'Series', r.runtime ? fmtRuntime(r.runtime) + (r.type === 'series' ? ' / episode' : '') : ''].filter(Boolean).map(esc).join(' · ')}
        ${r.age ? `<span class="age">${esc(r.age)}</span>` : ''}
        ${r.rating ? `<span class="star" title="${num(r.votes)} IMDb votes">★ ${r.rating}</span>` : ''}</p>
      <p class="tags">${r.genres.map((g) => `<span class="tag">${esc(g)}</span>`).join('')}</p>
      <p class="plot">${esc(r.overview) || '<span class="muted">No description.</span>'}</p>
      <h3>Watch on</h3>
      <div class="watch">${r.offers.map((o) => {
        const p = platforms[o.platform];
        const href = o.url || p.searchUrl.replace('{q}', encodeURIComponent(r.title));
        const tier = o.adFree ? (o.withAds ? 'with or without ads' : 'no ads') : 'with ads only';
        return `<a class="btn" style="background:${esc(p.color)}" href="${esc(href)}" target="_blank" rel="noopener">▶ Open in ${esc(p.name)}<small>${tier}</small></a>`;
      }).join('')}</div>
      <h3>Languages</h3>
      <div class="langs">${r.offers.map((o) => {
        const p = platforms[o.platform];
        const line = (label, codes) => `<div><span>${label}</span>${codes.length ? esc(codes.map(langName).join(', ')) : '<em>not listed</em>'}</div>`;
        return `<div class="lp"><b style="color:${esc(p.color)}">${esc(p.name)}</b>${line('Audio', o._a)}${line('Subtitles', o._s)}</div>`;
      }).join('')}</div>
      <dl>
        ${row('Released', r.releaseDate ? dateFmt.format(new Date(r.releaseDate + 'T00:00:00Z')) : '')}
        ${row('Size', size)}
        ${row(r.directors.length > 1 ? 'Directors' : 'Director', r.directors.join(', '))}
        ${row('Cast', r.cast.join(', '))}
        ${row('Original language', r.languages.join(', '))}
        ${row('Studio', r.studios.join(', '))}
        ${row('Awards', r.awards)}
      </dl>
      ${r.imdbId ? `<p><a href="https://www.imdb.com/title/${esc(r.imdbId)}/" target="_blank" rel="noopener">View on IMDb ↗</a></p>` : ''}
    </div>
    <div class="fly-foot"><button type="button" class="primary" data-close-fly>Close</button></div>`;
  const img = $('#flyout img');
  if (img) {
    img.addEventListener('load', () => img.classList.add('in'));
    img.addEventListener('error', () => img.parentElement.classList.add('none'));
  }
  $('#flyout').classList.add('open');
  document.body.classList.add('fly-open');
  $('#flyout').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  $('#flyout').scrollTop = 0;
  $('#fly-close').focus();
}
function closeFlyout() {
  $('#flyout').classList.remove('open');
  document.body.classList.remove('fly-open');
  $('#flyout').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
}

// ---------- statistics ----------
const PALETTE = ['#5aa9ff', '#f2a65a', '#7bd88f', '#e86f9a', '#b48cff', '#4fd1c5', '#f6d365', '#ff8a7a', '#8fb3ff', '#c3e88d'];
const OTHER_COLOR = '#5b6677';
const RUNTIMES = [
  { l: '<30', min: 0, max: 29 }, { l: '30–59', min: 30, max: 59 }, { l: '60–89', min: 60, max: 89 },
  { l: '90–119', min: 90, max: 119 }, { l: '120–149', min: 120, max: 149 }, { l: '150–179', min: 150, max: 179 },
  { l: '180+', min: 180, max: null },
];
let minVotes = 1000;
const EPISODES = [
  { l: '1–12', min: 1, max: 12 }, { l: '13–26', min: 13, max: 26 }, { l: '27–52', min: 27, max: 52 },
  { l: '53–100', min: 53, max: 100 }, { l: '101–250', min: 101, max: 250 }, { l: '250+', min: 251, max: null },
];

const attrs = (i) => (i.a ? `data-a="${i.a}" data-v="${esc(i.v)}"${i.w != null ? ` data-w="${esc(i.w)}"` : ''}` : '');
const pct = (n, t) => (t ? `${((n / t) * 100).toFixed(1)}%` : '–');

function donut(items, { size = 140, legend = true } = {}) {
  const total = items.reduce((n, i) => n + i.value, 0);
  let cum = 0;
  const segs = items.map((i) => {
    const p = total ? (i.value / total) * 100 : 0;
    const s = `<circle class="seg${i.a ? ' act' : ''}" cx="21" cy="21" r="15.915" fill="none" stroke="${i.color}" stroke-width="6" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${25 - cum}" ${attrs(i)}><title>${esc(i.label)}: ${num(i.value)} (${pct(i.value, total)})</title></circle>`;
    cum += p;
    return s;
  }).join('');
  const svg = `<svg class="donut" style="width:${size}px;height:${size}px" viewBox="0 0 42 42" role="img"><circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--line)" stroke-width="6"/>${segs}<text x="21" y="22.6" text-anchor="middle" class="dtotal">${num(total)}</text></svg>`;
  const leg = legend
    ? `<ul class="legend">${items.map((i) => `<li class="${i.a ? 'act' : ''}" ${attrs(i)}><i style="background:${i.color}"></i><span class="lbl">${esc(i.label)}</span><span class="val">${num(i.value)} <small>${pct(i.value, total)}</small></span></li>`).join('')}</ul>`
    : '';
  return `<div class="donutwrap">${svg}${leg}</div>`;
}

function columns(items, { height = 190 } = {}) {
  const max = Math.max(1, ...items.map((i) => i.parts.reduce((n, p) => n + p.v, 0)));
  return `<div class="cols" style="height:${height}px">${items.map((i) => {
    const t = i.parts.reduce((n, p) => n + p.v, 0);
    return `<div class="col ${i.a && t ? 'act' : ''}" ${t ? attrs(i) : ''} title="${esc(i.tip)}"><div class="area"><div class="stack" style="height:${(t / max) * 100}%">${i.parts.filter((p) => p.v).map((p) => `<span style="flex:${p.v};background:${p.c}"></span>`).join('')}</div></div><em>${i.tick ? esc(i.label) : ''}</em></div>`;
  }).join('')}</div>`;
}

function barlist(items, { max } = {}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return '<p class="muted">Nothing to show.</p>';
  return `<ul class="bars">${items.map((i) => `<li class="${i.a ? 'act' : ''}" ${attrs(i)}><span class="lbl" title="${esc(i.label)}">${esc(i.label)}</span><span class="track"><span class="fill" style="width:${(i.value / top) * 100}%;background:${i.color ?? 'var(--accent)'}"></span></span><span class="val">${i.text ?? num(i.value)}</span></li>`).join('')}</ul>`;
}

function ranked(list, sub) {
  if (!list.length) return '<p class="muted">Nothing to show.</p>';
  return `<ol class="ranked">${list.map((r) => `<li data-open="${esc(r.id)}"><span class="ttl">${esc(r.title)}${r.year ? ` <small>(${r.year})</small>` : ''}</span><span class="dots">${r.offers.map((o) => `<i style="background:${esc(platforms[o.platform].color)}" title="${esc(platforms[o.platform].name)}"></i>`).join('')}</span><span class="sub">${sub(r)}</span></li>`).join('')}</ol>`;
}

const card = (title, body, cls = '', note = '') => `<section class="card ${cls}"><h3>${title}${note ? ` <small>${note}</small>` : ''}</h3>${body}</section>`;

// top N categories by count, the remainder folded into a grey "Other" slice
function topItems(map, n, mk) {
  const sorted = [...map].sort((a, b) => b[1] - a[1]);
  const items = sorted.slice(0, n).map(([k, v], idx) => ({ label: k, value: v, color: PALETTE[idx % PALETTE.length], ...mk(k) }));
  const rest = sorted.slice(n).reduce((s, [, v]) => s + v, 0);
  if (rest) items.push({ label: 'Other', value: rest, color: OTHER_COLOR });
  return items;
}
const tally = (rows, keys) => {
  const m = new Map();
  for (const r of rows) for (const k of keys(r)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

function renderStats(rows) {
  const root = $('#statsbody');
  if (!rows.length) { root.innerHTML = '<p class="empty">No titles match these filters.</p>'; return; }
  const selP = state.sets.platforms;
  const plats = meta.platforms.filter((p) => !selP.size || selP.has(p.id));
  const platsOf = (r) => r.offers.filter((o) => plats.some((p) => p.id === o.platform)).map((o) => o.platform);

  const filmsN = rows.filter((r) => r.type === 'film').length;
  const rated = rows.filter((r) => r.rating != null);
  const avg = (a, f) => (a.length ? a.reduce((n, r) => n + f(r), 0) / a.length : 0);
  const runtimes = rows.filter((r) => r.runtime);
  let mins = 0;
  for (const r of rows) if (r.runtime) mins += r.type === 'film' ? r.runtime : r.runtime * (r.episodes ?? 1);
  const adTier = rows.filter((r) => r.offers.some((o) => o.withAds)).length;
  const stat = (label, value, sub = '') => `<div class="stat"><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const stats = `<div class="stats">
    ${stat('Titles', num(rows.length))}
    ${stat('Films', num(filmsN), pct(filmsN, rows.length))}
    ${stat('Series', num(rows.length - filmsN), pct(rows.length - filmsN, rows.length))}
    ${stat('Average IMDb', rated.length ? avg(rated, (r) => r.rating).toFixed(2) : '–', `${num(rated.length)} rated`)}
    ${stat('Average runtime', runtimes.length ? fmtRuntime(Math.round(avg(runtimes, (r) => r.runtime))) : '–')}
    ${stat('Total viewing time', `${num(Math.round(mins / 60 / 24))} days`, 'every film and episode')}
    ${stat('With awards', num(rows.filter((r) => r.awards).length))}
    ${stat('With an ad tier', num(adTier), pct(adTier, rows.length))}
  </div>`;

  // platforms
  const platCounts = new Map(plats.map((p) => [p.id, 0]));
  for (const r of rows) for (const id of platsOf(r)) platCounts.set(id, platCounts.get(id) + 1);
  const platItems = [...platCounts].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ label: platforms[id].name, value: v, color: platforms[id].color, a: 'platform', v: id }));

  const typeItems = [
    { label: 'Films', value: filmsN, color: PALETTE[0], a: 'type', v: 'film' },
    { label: 'Series', value: rows.length - filmsN, color: PALETTE[1], a: 'type', v: 'series' },
  ];
  const adItems = [
    { label: 'Ad tier available', value: adTier, color: PALETTE[3], a: 'access', v: 'ads' },
    { label: 'No ad tier', value: rows.length - adTier, color: PALETTE[2], a: 'access', v: 'noads' },
  ];
  const ageMap = tally(rows, (r) => [r.ageLabel]);
  const ageItems = topItems(ageMap, 8, (k) => ({ a: 'age', v: k }));
  const genreMap = tally(rows, (r) => r.genres);
  const genreItems = topItems(genreMap, 9, (k) => ({ a: 'genre', v: k }));

  // genre mix per platform (same genre colours as the main donut)
  const topGenres = genreItems.filter((g) => g.label !== 'Other');
  const genreColor = new Map(topGenres.map((g) => [g.label, g.color]));
  const mix = plats.map((p) => {
    const sub = rows.filter((r) => r.offers.some((o) => o.platform === p.id));
    const m = tally(sub, (r) => r.genres);
    const items = topGenres.map((g) => ({ label: g.label, value: m.get(g.label) ?? 0, color: g.color, a: 'platgenre', v: p.id, w: g.label })).filter((i) => i.value);
    const other = [...m].filter(([k]) => !genreColor.has(k)).reduce((n, [, v]) => n + v, 0);
    if (other) items.push({ label: 'Other', value: other, color: OTHER_COLOR });
    return `<div class="mini"><h4 style="color:${esc(p.color)}">${esc(p.name)}</h4>${donut(items, { size: 150, legend: false })}<small>${num(sub.length)} titles</small></div>`;
  }).join('');
  const genreKey = `<p class="key">${topGenres.map((g) => `<span><i style="background:${g.color}"></i>${esc(g.label)}</span>`).join('')}</p>`;

  // titles by release year, stacked film/series
  const years = new Map();
  const pre = [0, 0];
  for (const r of rows) {
    if (!r.year) continue;
    if (r.year < 1950) { pre[r.type === 'film' ? 0 : 1]++; continue; }
    const y = years.get(r.year) ?? years.set(r.year, [0, 0]).get(r.year);
    y[r.type === 'film' ? 0 : 1]++;
  }
  const narrow = matchMedia('(max-width: 480px)').matches; // fewer axis labels so they don't spill out of the card
  const yMin = 1950, yMax = Math.max(yMin, ...years.keys());
  const yearItems = [{ label: '<1950', parts: [{ v: pre[0], c: PALETTE[0] }, { v: pre[1], c: PALETTE[1] }], a: 'year', v: 'pre', tick: true, tip: `Before 1950: ${num(pre[0])} films, ${num(pre[1])} series` }];
  for (let y = yMin; y <= yMax; y++) {
    const [f, s] = years.get(y) ?? [0, 0];
    yearItems.push({ label: String(y), parts: [{ v: f, c: PALETTE[0] }, { v: s, c: PALETTE[1] }], a: 'year', v: y, tick: y % (narrow ? 10 : 5) === 0 && y > 1950, tip: `${y}: ${num(f)} films, ${num(s)} series` });
  }
  const yearKey = `<p class="key"><span><i style="background:${PALETTE[0]}"></i>Films</span><span><i style="background:${PALETTE[1]}"></i>Series</span></p>`;

  // IMDb and runtime distributions
  const ratingItems = [];
  for (let b = 1; b <= 9; b++) {
    const n = rated.filter((r) => Math.max(1, Math.min(9, Math.floor(r.rating))) === b).length;
    ratingItems.push({ label: String(b), parts: [{ v: n, c: PALETTE[4] }], a: 'rating', v: b, tick: true, tip: `${b}${b === 9 ? '+' : `–${b}.9`}: ${num(n)} titles` });
  }
  const runtimeItems = RUNTIMES.map((b, idx) => {
    const n = runtimes.filter((r) => r.runtime >= b.min && (b.max == null || r.runtime <= b.max)).length;
    return { label: b.l, parts: [{ v: n, c: PALETTE[5] }], a: 'runtime', v: idx, tick: true, tip: `${b.l} min: ${num(n)} titles` };
  });

  // average rating per platform
  const avgItems = plats.map((p) => {
    const sub = rated.filter((r) => r.offers.some((o) => o.platform === p.id));
    const mean = sub.length ? avg(sub, (r) => r.rating) : 0;
    return { label: p.name, value: mean, text: sub.length ? mean.toFixed(2) : '–', color: p.color, a: 'platform', v: p.id };
  }).sort((a, b) => b.value - a.value);

  // leaderboards
  const votesOk = rated.filter((r) => r.votes >= minVotes).sort((a, b) => b.rating - a.rating || b.votes - a.votes);
  const top = votesOk.slice(0, 15);
  const worst = votesOk.slice(-15).reverse();
  const starSub = (r) => `★ ${r.rating} <small>${num(r.votes)} votes</small>`;
  const longest = rows.filter((r) => r.type === 'series' && r.episodes).sort((a, b) => b.episodes - a.episodes).slice(0, 10);
  const decorated = rows.filter((r) => r.awardCount).sort((a, b) => b.awardCount - a.awardCount).slice(0, 10);

  const topBars = (map, kind, label, n = 12) => barlist([...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ label: label(k), value: v, a: kind, v: k })));
  const withAudio = rows.filter((r) => r._aud.length).length;
  const withSubs = rows.filter((r) => r._sub.length).length;
  const knownLang = tally(rows, (r) => r.languages.slice(0, 1));
  const langItems = topItems(knownLang, 8, (k) => ({ a: 'lang', v: k }));
  const unknownLang = rows.filter((r) => !r.languages.length).length;
  if (unknownLang) langItems.push({ label: 'Unknown', value: unknownLang, color: '#3b4452' });
  const nameBars = (field, kind, n = 12) => barlist([...tally(rows, (r) => r[field])].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ label: k, value: v, a: kind, v: k })));
  const votesSel = `<select id="minVotes" aria-label="Minimum votes">${[100, 1000, 10000, 50000].map((v) => `<option value="${v}"${v === minVotes ? ' selected' : ''}>≥ ${num(v)} votes</option>`).join('')}</select>`;

  let animeTiles = '', animeCards = '', scopeNote = '';
  if (state.anime) {
    const withEps = rows.filter((r) => r.type === 'series' && r.episodes > 0);
    const dub = rows.filter((r) => r._aud.includes('en')).length;
    const subOnly = rows.filter((r) => r._aud.length && !r._aud.includes('en')).length;
    const noAudio = rows.length - dub - subOnly;
    animeTiles = stat('Avg episodes per series', withEps.length ? Math.round(avg(withEps, (r) => r.episodes)) : '–', `${num(withEps.length)} series`)
      + stat('English dub', num(dub), `${pct(dub, rows.length)} of titles`);
    const dubItems = [
      { label: 'English dub available', value: dub, color: PALETTE[2], a: 'audio', v: 'en' },
      { label: 'Other audio only (subtitled)', value: subOnly, color: PALETTE[1] },
      { label: 'Audio not listed', value: noAudio, color: '#3b4452' },
    ].filter((i) => i.value);
    const epItems = EPISODES.map((b, idx) => {
      const n = withEps.filter((r) => r.episodes >= b.min && (b.max == null || r.episodes <= b.max)).length;
      return { label: b.l, parts: [{ v: n, c: PALETTE[3] }], a: 'eps', v: idx, tick: true, tip: `${b.l} episodes: ${num(n)} series` };
    });
    animeCards = `${card('English dub availability', donut(dubItems), '', 'where the service lists audio')}
    ${card('Episodes per series', columns(epItems, { height: 150 }))}`;
    scopeNote = '<p class="scopenote">Showing anime only. Untick “Anime only” in the filters to see everything.</p>';
  } else if (state.type !== 'all') {
    scopeNote = `<p class="scopenote">Showing ${state.type === 'film' ? 'films' : 'series'} only. Set Type back to All in the filters to see everything.</p>`;
  }

  root.innerHTML = `${stats.slice(0, stats.lastIndexOf('</div>'))}${animeTiles}</div>${scopeNote}<div class="grid">${animeCards}
    ${card('Platforms', donut(platItems), '', 'titles on each service')}
    ${card('Films vs series', donut(typeItems))}
    ${card('Ad tiers', donut(adItems), '', 'Netflix Standard with Ads')}
    ${card('Age ratings', donut(ageItems))}
    ${card('Genres', donut(genreItems), 'span2')}
    ${card('Original language', donut(langItems), '', 'from Wikidata, where known')}
    ${card('Genre mix by platform', `<div class="minis">${mix}</div>${genreKey}`, 'span2')}
    ${card('Titles by release year', columns(yearItems) + yearKey, 'span2')}
    ${card('IMDb rating distribution', columns(ratingItems, { height: 150 }))}
    ${card('Runtime distribution', columns(runtimeItems, { height: 150 }), '', 'per episode for series')}
    ${card('Average IMDb by platform', barlist(avgItems, { max: 10 }))}
    ${card('Top rated', ranked(top, starSub), '', votesSel)}
    ${card('Worst rated', ranked(worst, starSub), '', 'same vote threshold')}
    ${card('Audio languages', topBars(tally(rows, (r) => r._aud), 'audio', langName), '', `${num(withAudio)} of ${num(rows.length)} titles list audio`)}
    ${card('Subtitle languages', topBars(tally(rows, (r) => r._sub), 'subs', langName), '', `${num(withSubs)} of ${num(rows.length)} list subtitles`)}
    ${card('Most seen actors', nameBars('cast', 'actor'))}
    ${card('Most prolific directors', nameBars('directors', 'director'))}
    ${card('Top studios', nameBars('studios', 'studio'))}
    ${card('Longest series', ranked(longest, (r) => `${num(r.episodes)} eps <small>${r.seasons ?? '?'} seasons</small>`))}
    ${card('Most decorated', ranked(decorated, (r) => `${num(r.awardCount)} awards`))}
  </div>`;
}

// clicking a statistic jumps to the table with that selection added on top of the current filters
function act(a, v, w) {
  const m = {
    platform: [`Platform: ${platforms[v]?.name}`, (s) => { s.sets.platforms = new Set([v]); }],
    type: [`Type: ${v === 'film' ? 'Films' : 'Series'}`, (s) => { s.type = v; }],
    genre: [`Genre: ${v}`, (s) => { s.sets.genres.add(v); }],
    age: [`Age rating: ${v}`, (s) => { s.sets.ages = new Set([v]); }],
    access: [{ ads: 'Ad tier available', noads: 'No ad tier (ad-free only)' }[v], (s) => { s.access = v; }],
    year: [v === 'pre' ? 'Released before 1950' : `Released in ${v}`, (s) => { s.num.yearMin = v === 'pre' ? null : Number(v); s.num.yearMax = v === 'pre' ? 1949 : Number(v); }],
    rating: [`IMDb ${v}${v === '9' ? '+' : `–${v}.9`}`, (s) => { s.num.ratingMin = v === '1' ? 0 : Number(v); s.num.ratingMax = v === '9' ? 10 : Number(v) + 0.9; }],
    eps: [`Episodes ${EPISODES[v]?.l}`, (s) => { s.type = 'series'; s.num.episodesMin = EPISODES[v].min; s.num.episodesMax = EPISODES[v].max; }],
    runtime: [`Runtime ${RUNTIMES[v]?.l} min`, (s) => { s.num.runtimeMin = RUNTIMES[v].min; s.num.runtimeMax = RUNTIMES[v].max; }],
    lang: [`Original language: ${v}`, (s) => { s.sets.langs = new Set([v]); }],
    audio: [`Audio: ${langName(v)}`, (s) => { s.sets.audio = new Set([v]); }],
    subs: [`Subtitles: ${langName(v)}`, (s) => { s.sets.subs = new Set([v]); }],
    actor: [`Actor: ${v}`, (s) => { s.sets.actors.add(v); }],
    director: [`Director: ${v}`, (s) => { s.sets.directors.add(v); }],
    studio: [`Studio: ${v}`, (s) => { s.text.studios = lc(v); }],
    platgenre: [`${platforms[v]?.name} · ${w}`, (s) => { s.sets.platforms = new Set([v]); s.sets.genres.add(w); }],
  }[a];
  if (m) drillTo(m[0], m[1]);
}

// ---------- boards: the Home and Anime landing pages share one engine ----------
const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const released = (r) => !!r.releaseDate && r.releaseDate <= TODAY;
const hasRating = (r) => r._wr != null;
const star = (r) => (r.rating != null ? `★ ${r.rating}` : '');
const fmtRate = (r) => ({ main: r.rating != null ? `★ ${r.rating}` : '–', sub: `${compact.format(r.votes)} votes` });
const fmtVotes = (r) => ({ main: `${compact.format(r.votes)} votes`, sub: star(r) });
const fmtDate = (r) => ({ main: dateFmt.format(new Date(r.releaseDate + 'T00:00:00Z')), sub: star(r) });
const fmtAward = (r) => ({ main: `${r.awardCount} award${r.awardCount > 1 ? 's' : ''}`, sub: star(r) });
const fmtEps = (r) => ({ main: `${num(r.episodes)} episodes`, sub: star(r) });
const byRating = (s) => { s.sort = { key: 'rating', dir: -1 }; };
const byRelease = (s) => { s.sort = { key: 'release', dir: -1 }; };

const ALL_PLATS = meta.platforms.map((p) => p.id);
const isAll = (set) => set.size === ALL_PLATS.length;
// multi-select: from "everything" the first click shows just that platform, further clicks add or remove
// platforms, and deselecting the last one falls back to everything
const pickPlat = (cur, id) => {
  if (isAll(cur)) return new Set([id]);
  const next = new Set(cur);
  next.has(id) ? next.delete(id) : next.add(id);
  return next.size ? next : new Set(ALL_PLATS);
};
// "Prime Video" shortens to "Prime" on narrow screens so all five platform chips fit on one row
const SHORT_NAMES = { prime: 'Prime' };
const platChips = (attr, extra, plats) => meta.platforms.map((p) => {
  const label = SHORT_NAMES[p.id] ? `<span class="pn">${esc(p.name)}</span><span class="ps">${esc(SHORT_NAMES[p.id])}</span>` : esc(p.name);
  return `<button type="button" class="pchip" style="--c:${esc(p.color)}" aria-pressed="${plats.has(p.id)}" ${attr}="${esc(p.id)}" ${extra}>${label}</button>`;
}).join('');
const typeSeg = (attr, extra, cur) => `<span class="seg2" role="group" aria-label="Films or series">${[['film', 'Films'], ['series', 'Series']].map(([v, l]) =>
  `<button type="button" aria-pressed="${cur === 'all' || cur === v}" ${attr}="${v}" ${extra}>${l}</button>`).join('')}</span>`;
const rangeSeg = (attr, extra, cur) => `<span class="seg2" role="group" aria-label="Time period">${[['recent', 'Last year'], ['all', 'All time']].map(([v, l]) =>
  `<button type="button" aria-pressed="${cur === v}" ${attr}="${v}" ${extra}>${l}</button>`).join('')}</span>`;
const sizeOf = (r) => (r.type === 'series'
  ? [r.seasons && `${r.seasons} season${r.seasons > 1 ? 's' : ''}`, r.episodes && `${num(r.episodes)} episode${r.episodes > 1 ? 's' : ''}`].filter(Boolean).join(', ')
  : '');
const kindOf = (r) => [r.year, r.type === 'film' ? 'Film' : 'Series', sizeOf(r)].filter(Boolean).join(' · ');

const makeAdder = (lists) => (group, id, title, sub, pred, score, fmt, tbl = byRating) => {
  const l = { group, id, title, sub, pred, score, fmt, tbl };
  lists.push(l);
  return l;
};
// the five lists every board starts with
function addFeatured(add) {
  add('featured', 'popular', 'Most popular', 'By IMDb votes, all platforms', (r) => r.votes > 0, (r) => r.votes, fmtVotes);
  add('featured', 'popnew', 'Popular new releases', 'Released in the last two years', (r) => released(r) && r.releaseDate >= monthsAgo(24) && r.votes > 0, (r) => r.votes, fmtVotes,
    (s) => { s.num.yearMin = new Date().getFullYear() - 2; byRelease(s); });
  add('featured', 'newest', 'Latest arrivals', 'Newest releases first', released, (r) => r._ts, fmtDate, byRelease);
  add('featured', 'toprated', 'Top rated', 'Best IMDb score, weighted by votes', hasRating, (r) => r._wr, fmtRate);
  add('featured', 'awards', 'Award winners', 'Most awards won', (r) => r.awardCount > 0, (r) => r.awardCount * 100 + (r.rating || 0), fmtAward,
    (s) => { s.num.awardsMin = 1; s.sort = { key: 'awards', dir: -1 }; });
}
const decadeLists = (add, defs) => {
  for (const [label, min, max] of defs) {
    const l = add('decades', `dec-${min}`, `The ${label}`, 'Best rated of the era', (r) => r.year >= min && r.year <= max && hasRating(r), (r) => r._wr, fmtRate,
      (s) => { s.num.yearMin = min || null; s.num.yearMax = max; byRating(s); });
    if (max < Number(RECENT_FROM.slice(0, 4))) l.range = 'all'; // an old decade can't have recent titles
  }
};

// ----- Home lists -----
const HOME_GROUPS = [
  { id: 'featured', title: 'Featured', cap: 'Ranked across everything you can watch', color: PALETTE[0] },
  { id: 'spotlight', title: 'Spotlight', cap: 'Handpicked angles on the catalogue', color: PALETTE[1] },
  { id: 'genres', title: 'By genre', cap: 'The best of each genre, weighted by IMDb votes', color: PALETTE[2] },
  { id: 'decades', title: 'By decade', cap: 'From the latest hits back to the classics', color: PALETTE[4] },
  { id: 'languages', title: 'World cinema & TV', cap: 'Best of each original language beyond English', color: PALETTE[3] },
];
const HOME_LISTS = [];
const addHome = makeAdder(HOME_LISTS);
addFeatured(addHome);
addHome('spotlight', 'quick', 'Quick watches', 'Films under 95 minutes', (r) => r.type === 'film' && r.runtime && r.runtime <= 95 && hasRating(r), (r) => r._wr, fmtRate,
  (s) => { s.type = 'film'; s.num.runtimeMax = 95; byRating(s); }).type = 'film'; // inherently one kind: no toggle
addHome('spotlight', 'binge', 'Binge-worthy series', 'Three or more seasons', (r) => r.type === 'series' && r.seasons >= 3 && hasRating(r), (r) => r._wr, fmtRate,
  (s) => { s.type = 'series'; s.num.seasonsMin = 3; byRating(s); }).type = 'series';
addHome('spotlight', 'family', 'Family night', 'Rated U or PG', (r) => (r.age === 'U' || r.age === 'PG') && hasRating(r), (r) => r._wr, fmtRate,
  (s) => { s.sets.ages = new Set(['U', 'PG']); byRating(s); });
addHome('spotlight', 'gems', 'Hidden gems', 'Rated 7.5+ with under 10k votes', (r) => r.rating >= 7.5 && r.votes >= 300 && r.votes < 10000, (r) => r.rating * 1000 + Math.min(r.votes, 999), fmtRate,
  (s) => { s.num.ratingMin = 7.5; byRating(s); });
addHome('spotlight', 'classics', 'Classics', 'Released before 1980', (r) => r.year < 1980 && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.num.yearMax = 1979; byRating(s); }).range = 'all'; // nothing recent is a classic
for (const [g, n] of [...genreCounts].sort((a, b) => b[1] - a[1])) {
  if (n < 40) continue;
  addHome('genres', `genre-${g}`, g, `${num(n)} titles`, (r) => r.genres.includes(g) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.sets.genres.add(g); byRating(s); });
}
decadeLists(addHome, [['2020s', 2020, 2029], ['2010s', 2010, 2019], ['2000s', 2000, 2009], ['1990s', 1990, 1999], ['1980s', 1980, 1989], ['1970s & earlier', 0, 1979]]);
for (const [l, n] of origCounts.filter(([l]) => l !== 'English').slice(0, 8)) {
  addHome('languages', `lang-${l}`, l, `${num(n)} titles`, (r) => r.languages.includes(l) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.sets.langs = new Set([l]); byRating(s); });
}

// ----- Anime lists: animation made in Japan, or anything on Crunchyroll, across every platform -----
const animeRows = data.filter((r) => r._anime);
const ANIME_GROUPS = [
  { id: 'featured', title: 'Featured', cap: 'Ranked across all the anime you can watch', color: PALETTE[0] },
  { id: 'spotlight', title: 'Spotlight', cap: 'Dubs, long-runners, short series and hidden gems', color: PALETTE[1] },
  { id: 'genres', title: 'By genre', cap: 'The best of each genre, weighted by IMDb votes', color: PALETTE[2] },
  { id: 'decades', title: 'By era', cap: 'From modern hits back to the classics', color: PALETTE[4] },
  { id: 'studios', title: 'By studio', cap: 'Where the studio is known', color: PALETTE[3] },
];
const ANIME_LISTS = [];
const addAnime = makeAdder(ANIME_LISTS);
addFeatured(addAnime);
addAnime('spotlight', 'dub', 'English dubbed', 'English audio available', (r) => r._aud.includes('en') && hasRating(r), (r) => r._wr, fmtRate,
  (s) => { s.sets.audio = new Set(['en']); byRating(s); });
addAnime('spotlight', 'movies', 'Anime films', 'Feature-length anime', (r) => r.type === 'film' && hasRating(r), (r) => r._wr, fmtRate,
  (s) => { s.type = 'film'; byRating(s); }).type = 'film';
addAnime('spotlight', 'long', 'Long-runners', 'Series with 100+ episodes', (r) => r.type === 'series' && r.episodes >= 100, (r) => r.episodes, fmtEps,
  (s) => { s.type = 'series'; s.num.episodesMin = 100; s.sort = { key: 'episodes', dir: -1 }; }).type = 'series';
addAnime('spotlight', 'short', 'Short & sweet', 'Series of 13 episodes or fewer', (r) => r.type === 'series' && r.episodes > 0 && r.episodes <= 13 && hasRating(r), (r) => r._wr, fmtEps,
  (s) => { s.type = 'series'; s.num.episodesMax = 13; byRating(s); }).type = 'series';
addAnime('spotlight', 'gems', 'Hidden gems', 'Rated 7.5+ with under 10k votes', (r) => r.rating >= 7.5 && r.votes >= 300 && r.votes < 10000, (r) => r.rating * 1000 + Math.min(r.votes, 999), fmtRate,
  (s) => { s.num.ratingMin = 7.5; byRating(s); });
const animeGenres = new Map();
for (const r of animeRows) for (const g of r.genres) if (g !== 'Animation') animeGenres.set(g, (animeGenres.get(g) ?? 0) + 1);
for (const [g, n] of [...animeGenres].sort((a, b) => b[1] - a[1])) {
  if (n < 25) continue;
  addAnime('genres', `genre-${g}`, g, `${num(n)} titles`, (r) => r.genres.includes(g) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.sets.genres.add(g); byRating(s); });
}
decadeLists(addAnime, [['2020s', 2020, 2029], ['2010s', 2010, 2019], ['2000s', 2000, 2009], ['1990s & earlier', 0, 1999]]);
const animeStudios = new Map();
for (const r of animeRows) for (const st of r.studios) animeStudios.set(st, (animeStudios.get(st) ?? 0) + 1);
for (const [st, n] of [...animeStudios].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 6).slice(0, 12)) {
  addAnime('studios', `studio-${st}`, st, `${num(n)} titles`, (r) => r.studios.includes(st) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.text.studios = lc(st); byRating(s); });
}

// ----- Film and Series lists -----
const topCounts = (rows, field, min, n) => {
  const m = new Map();
  for (const r of rows) for (const k of r[field]) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1]).slice(0, n);
};
const kindGroups = (noun, world) => [
  { id: 'featured', title: 'Featured', cap: `Ranked across all the ${noun} you can watch`, color: PALETTE[0] },
  { id: 'spotlight', title: 'Spotlight', cap: 'Handpicked angles', color: PALETTE[1] },
  { id: 'genres', title: 'By genre', cap: 'The best of each genre, weighted by IMDb votes', color: PALETTE[2] },
  { id: 'decades', title: 'By decade', cap: 'From the latest hits back to the classics', color: PALETTE[4] },
  { id: 'languages', title: world, cap: 'Best of each original language beyond English', color: PALETTE[3] },
  { id: 'people', title: 'By director', cap: 'The most-watched directors', color: PALETTE[5] },
  { id: 'studios', title: 'By studio', cap: 'Where the studio is known', color: PALETTE[6] },
];
const DECADES = [['2020s', 2020, 2029], ['2010s', 2010, 2019], ['2000s', 2000, 2009], ['1990s', 1990, 1999], ['1980s', 1980, 1989], ['1970s & earlier', 0, 1979]];
// the lists every film / series board shares: genre, decade, language, studio
function addBrowseLists(add, rows, { people } = {}) {
  for (const [g, n] of topCounts(rows, 'genres', 40, 40)) {
    add('genres', `genre-${g}`, g, `${num(n)} titles`, (r) => r.genres.includes(g) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.sets.genres.add(g); byRating(s); });
  }
  decadeLists(add, DECADES);
  for (const [l, n] of topCounts(rows, 'languages', 1, 40).filter(([l]) => l !== 'English').slice(0, 8)) {
    add('languages', `lang-${l}`, l, `${num(n)} titles`, (r) => r.languages.includes(l) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.sets.langs = new Set([l]); byRating(s); });
  }
  if (people) {
    for (const [d, n] of topCounts(rows, 'directors', 8, 12)) {
      add('people', `dir-${d}`, d, `${num(n)} titles`, (r) => r.directors.includes(d) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.sets.directors.add(d); byRating(s); });
    }
  }
  for (const [st, n] of topCounts(rows, 'studios', 10, 12)) {
    add('studios', `studio-${st}`, st, `${num(n)} titles`, (r) => r.studios.includes(st) && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.text.studios = lc(st); byRating(s); });
  }
}
const addFamily = (add) => add('spotlight', 'family', 'Family night', 'Rated U or PG', (r) => (r.age === 'U' || r.age === 'PG') && hasRating(r), (r) => r._wr, fmtRate,
  (s) => { s.sets.ages = new Set(['U', 'PG']); byRating(s); });
const addGems = (add) => add('spotlight', 'gems', 'Hidden gems', 'Rated 7.5+ with under 10k votes', (r) => r.rating >= 7.5 && r.votes >= 300 && r.votes < 10000, (r) => r.rating * 1000 + Math.min(r.votes, 999), fmtRate,
  (s) => { s.num.ratingMin = 7.5; byRating(s); });
const addClassics = (add) => add('spotlight', 'classics', 'Classics', 'Released before 1980', (r) => r.year < 1980 && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.num.yearMax = 1979; byRating(s); }).range = 'all'; // nothing recent is a classic

const filmRows = data.filter((r) => r.type === 'film');
const FILM_GROUPS = kindGroups('films', 'World cinema');
const FILM_LISTS = [];
const addFilm = makeAdder(FILM_LISTS);
addFeatured(addFilm);
addFilm('spotlight', 'quick', 'Quick watches', 'Films under 95 minutes', (r) => r.runtime && r.runtime <= 95 && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.num.runtimeMax = 95; byRating(s); });
addFilm('spotlight', 'epic', 'Epics', 'Films of 150 minutes or more', (r) => r.runtime >= 150 && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.num.runtimeMin = 150; byRating(s); });
addFamily(addFilm); addGems(addFilm); addClassics(addFilm);
addBrowseLists(addFilm, filmRows, { people: true });

const seriesRows = data.filter((r) => r.type === 'series');
const SERIES_GROUPS = kindGroups('series', 'World TV').filter((g) => g.id !== 'people');
const SERIES_LISTS = [];
const addSeries = makeAdder(SERIES_LISTS);
addFeatured(addSeries);
addSeries('spotlight', 'binge', 'Binge-worthy', 'Three or more seasons', (r) => r.seasons >= 3 && hasRating(r), (r) => r._wr, fmtRate, (s) => { s.num.seasonsMin = 3; byRating(s); });
addSeries('spotlight', 'limited', 'Limited series', 'One season of 10 episodes or fewer', (r) => r.seasons === 1 && r.episodes > 0 && r.episodes <= 10 && hasRating(r), (r) => r._wr, fmtEps,
  (s) => { s.num.seasonsMax = 1; s.num.episodesMax = 10; byRating(s); });
addSeries('spotlight', 'long', 'Long-runners', 'Series with 100+ episodes', (r) => r.episodes >= 100, (r) => r.episodes, fmtEps,
  (s) => { s.num.episodesMin = 100; s.sort = { key: 'episodes', dir: -1 }; });
addFamily(addSeries); addGems(addSeries); addClassics(addSeries);
addBrowseLists(addSeries, seriesRows);

const PAGE = 20, MAX_PAGES = 3; // each list shows 20 at first and can grow to 60 in two steps
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// one engine drives every landing page: lists, the universal platform / film-series / period controls,
// pagination, expand all and the table drill-down
function createBoard(cfg) {
  const { lists, groups } = cfg;
  const pool = data.filter(cfg.subset);
  const defaults = cfg.defaults ?? new Set(ALL_PLATS); // the platforms selected on arrival and after deselecting them all
  const plat = new Set(defaults);
  let gType = cfg.fixedType ?? 'all';
  let gRange = 'all'; // 'all' time or 'recent' (last 12 months)
  const pages = new Map(); // list id -> how many pages of 20 are showing
  const root = () => $(cfg.root);
  const find = (id) => lists.find((l) => l.id === id);
  const typeFor = (l) => l.type ?? gType;
  const rangeFor = (l) => l.range ?? gRange;
  const el = (sel) => $(sel, root());
  const bodyOf = (id) => el(`details[data-list-id="${CSS.escape(id)}"] .lbody`);
  // multi-select: from the default selection the first click shows just that platform, further clicks add or
  // remove platforms, and deselecting the last one falls back to the default
  const pick = (id) => {
    if (sameSet(plat, defaults)) return new Set([id]);
    const next = new Set(plat);
    next.has(id) ? next.delete(id) : next.add(id);
    return next.size ? next : new Set(defaults);
  };

  function topOf(list, limit = PAGE * MAX_PAGES) {
    const type = typeFor(list), range = rangeFor(list);
    const hits = [];
    for (const r of pool) {
      if ((type === 'all' || r.type === type) && (range !== 'recent' || isRecent(r)) && r.offers.some((o) => plat.has(o.platform)) && list.pred(r)) hits.push(r);
    }
    const scored = hits.map((r) => [list.score(r), r]).sort((a, b) => b[0] - a[0] || b[1].votes - a[1].votes);
    return { rows: scored.slice(0, limit).map((x) => x[1]), total: hits.length };
  }

  function listRows(list, rows) {
    return `<ol class="hrows">${rows.map((r, i) => {
      const m = list.fmt(r);
      return `<li class="hrow" data-open="${esc(r.id)}"><span class="rk">${i + 1}</span>
        <span class="th">${r.poster ? `<img loading="lazy" decoding="async" alt="" referrerpolicy="no-referrer" src="${POSTER(r.poster, 's166')}">` : ''}</span>
        <span class="hmain"><b>${esc(r.title)}</b><small>${esc(kindOf(r))}</small>${r.genres.length ? `<small class="g">${esc(r.genres.slice(0, 3).join(', '))}</small>` : ''}
          <span class="pls">${r.offers.map((o) => `<i class="badge sm" style="background:${esc(platforms[o.platform].color)}">${esc(platforms[o.platform].name)}</i>`).join('')}</span></span>
        <span class="hmet"><b>${esc(m.main)}</b><small>${esc(m.sub)}</small></span></li>`;
    }).join('')}</ol>`;
  }

  function renderListBody(id) {
    const list = find(id);
    const body = bodyOf(id);
    if (!list || !body) return;
    const { rows, total } = topOf(list);
    const page = pages.get(id) ?? 1;
    const shown = Math.min(rows.length, page * PAGE);
    const range = rangeFor(list);
    const notes = [range === 'recent' ? 'from the last year' : '', list.range === 'all' && gRange === 'recent' ? 'always all time' : ''].filter(Boolean).join(', ');
    body.innerHTML = `${shown ? listRows(list, rows.slice(0, shown)) : `<p class="muted pad">${range === 'recent' ? 'Nothing released in the last year matches these filters.' : 'Nothing matches these filters.'}</p>`}
      <div class="lfoot"><span class="muted">${shown ? `Showing 1–${shown}` : 'Showing 0'} of ${num(total)}${notes ? ` · ${notes}` : ''}</span>
        <span class="lbtns">${shown < rows.length ? `<button type="button" data-more="${esc(id)}">Show next ${Math.min(PAGE, rows.length - shown)}</button>` : ''}${page > 1 ? `<button type="button" data-less="${esc(id)}">Back to top ${PAGE}</button>` : ''}<button type="button" class="link" data-table="${esc(id)}">See all in table →</button></span></div>`;
    body.dataset.ready = '1';
  }

  function renderRail() {
    const rows = topOf(find('popnew'), 80).rows.filter((r) => r.poster).slice(0, 16);
    el('.rail').innerHTML = rows.map((r) =>
      `<button type="button" class="pc" data-open="${esc(r.id)}"><img loading="lazy" decoding="async" alt="Poster for ${esc(r.title)}" referrerpolicy="no-referrer" src="${POSTER(r.poster, 's276')}"><b>${esc(r.title)}</b><small>${[r.year, r.type === 'series' && r.seasons ? `${r.seasons} season${r.seasons > 1 ? 's' : ''}` : '', star(r)].filter(Boolean).join(' · ')}</small></button>`).join('')
      || '<p class="muted pad">Nothing matches these filters.</p>';
  }

  // re-render everything that follows the universal platform / film-or-series / period controls
  function sync() { // pagination is kept across filter changes: a list stays at the page level you chose
    el('.gplat').innerHTML = platChips('data-gp', '', plat);
    if (el('.gtype')) el('.gtype').innerHTML = typeSeg('data-gt', '', gType);
    el('.grange').innerHTML = rangeSeg('data-gr', '', gRange);
    renderRail();
    for (const d of $$('details.hl[open]', root())) renderListBody(d.dataset.listId);
  }

  function build() {
    const counts = meta.platforms.map((p) => [p, pool.filter((r) => r.offers.some((o) => o.platform === p.id)).length]);
    const gs = groups.filter((g) => lists.some((l) => l.group === g.id));
    root().innerHTML = `${cfg.hero(pool, counts)}
      <div class="jump" role="navigation" aria-label="Sections">
        <button type="button" data-jump="${cfg.p}h-rail">Trending</button>${gs.map((g) => `<button type="button" data-jump="${cfg.p}h-${g.id}">${esc(g.title)}</button>`).join('')}
      </div>
      <div class="hwrap">
        <section class="hgroup" id="${cfg.p}h-rail"><div class="ghead"><h3>Trending now</h3><p>Popular new releases</p></div><div class="rail"></div></section>
        ${gs.map((g) => `<section class="hgroup" id="${cfg.p}h-${g.id}" style="--g:${g.color}"><div class="ghead"><h3>${esc(g.title)}</h3><p>${esc(g.cap)}</p></div>
          <div class="lists">${lists.filter((l) => l.group === g.id).map((l) => `<details class="hl" id="hl-${cfg.p}${esc(l.id)}" data-list-id="${esc(l.id)}"><summary><span class="ht"><b>${esc(l.title)}</b><small>${esc(l.sub)}</small></span><span class="chev" aria-hidden="true"></span></summary><div class="lbody"></div></details>`).join('')}</div></section>`).join('')}
      </div>
      <div class="hbar">
        <div class="hctl">
          <div class="ptoggles hplat" role="group" aria-label="Platform for all lists"><span class="muted">Platform</span><span class="gplat ptoggles"></span></div>
          ${cfg.fixedType ? '' : '<div class="ptoggles hshow" role="group" aria-label="Films or series for all lists"><span class="muted">Show</span><span class="gtype"></span></div>'}
          <div class="ptoggles hper" role="group" aria-label="Time period for all lists"><span class="muted">Period</span><span class="grange"></span></div>
          <div class="expcol"><button type="button" data-expand="open">Expand all</button><button type="button" data-expand="close">Collapse all</button></div>
        </div>
      </div>`;
    sync();
  }

  // the table gets the same platform / type / period choices the lists were showing
  function drillFor(extra) {
    return (s) => {
      cfg.base?.(s);
      if (!isAll(plat)) s.sets.platforms = new Set(plat);
      extra?.(s);
    };
  }
  function platformLabel() {
    return sameSet(plat, defaults) ? '' : meta.platforms.filter((p) => plat.has(p.id)).map((p) => p.name).join(', ');
  }
  function openListInTable(id) {
    const list = find(id);
    const type = typeFor(list);
    const range = rangeFor(list);
    const label = [cfg.name ? `${cfg.name}: ${list.title}` : list.title, platformLabel(), !cfg.fixedType && type !== 'all' && (type === 'film' ? 'Films' : 'Series'), range === 'recent' && 'Last year'].filter(Boolean).join(' · ');
    drillTo(label, drillFor((s) => {
      list.tbl(s);
      if (type !== 'all') s.type = type;
      if (range === 'recent') s.recent = true;
    }), { clean: true });
  }
  // hero buttons: browse this section as a table, or see its statistics
  function openCta(kind) {
    drillTo(cfg.name ?? 'Everything', drillFor((s) => { if (kind === 'table') byRating(s); }), { clean: true, to: kind === 'stats' ? '#stats' : '#table' });
  }

  const view = $(cfg.view);
  view.addEventListener('click', (e) => {
    const t = e.target;
    const open = t.closest('[data-open]');
    if (open) return openFlyout(byId.get(open.dataset.open));
    const gp = t.closest('[data-gp]');
    if (gp) { const next = pick(gp.dataset.gp); plat.clear(); next.forEach((p) => plat.add(p)); return sync(); }
    const gt = t.closest('[data-gt]');
    if (gt) { gType = gType === gt.dataset.gt ? 'all' : gt.dataset.gt; return sync(); }
    const gr = t.closest('[data-gr]');
    if (gr) { gRange = gRange === gr.dataset.gr && gr.dataset.gr === 'recent' ? 'all' : gr.dataset.gr; return sync(); } // the active "Last year" goes back to all time
    const more = t.closest('[data-more]');
    if (more) { const id = more.dataset.more; pages.set(id, Math.min(MAX_PAGES, (pages.get(id) ?? 1) + 1)); return renderListBody(id); }
    const less = t.closest('[data-less]');
    if (less) { const id = less.dataset.less; pages.delete(id); renderListBody(id); return less.closest('details')?.scrollIntoView({ block: 'nearest' }); }
    const tb = t.closest('[data-table]');
    if (tb) return openListInTable(tb.dataset.table);
    const cta = t.closest('[data-cta]');
    if (cta) return openCta(cta.dataset.cta);
    const jump = t.closest('[data-jump]');
    if (jump) { suspendDuringJump(); return document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const ex = t.closest('[data-expand]');
    if (ex) {
      const open = ex.dataset.expand === 'open';
      $$('details.hl', root()).forEach((d) => { if (open) d.dataset.bulk = '1'; else delete d.dataset.bulk; d.open = open; });
    }
  });
  // lists render their rows the first time they are opened
  view.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details.hl')) return;
    if (!d.open) delete d.dataset.bulk;
    else if (!d.querySelector('.lbody[data-ready]')) renderListBody(d.dataset.listId);
  }, true);

  // A list you opened yourself keeps its header locked under the section chips while you read it (CSS), and
  // collapses once it has scrolled off screen so the page stays short. Lists opened with "Expand all" stay open.
  // The page height shrinks when a list above the viewport collapses, so scroll back by the same amount.
  let suspended = false, ticking = false, jumpTimer;
  const stickTop = () => parseFloat(getComputedStyle(view).getPropertyValue('--stick')) || 0;
  function sweep() {
    const vr = view.getBoundingClientRect();
    const top = vr.top + stickTop();
    const was = view.scrollTop; // read before collapsing: a shorter page makes the browser clamp scrollTop
    let removed = 0;
    for (const d of $$('details.hl[open]', root())) {
      if (d.dataset.bulk) continue;
      const r = d.getBoundingClientRect();
      if (r.bottom < top) { const before = d.offsetHeight; d.open = false; removed += before - d.offsetHeight; }
      else if (r.top > vr.bottom) d.open = false; // scrolled up past it: collapse, nothing visible moves
    }
    if (removed) view.scrollTo({ top: Math.max(0, was - removed), behavior: 'instant' });
  }
  view.addEventListener('scroll', () => {
    if (suspended || ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; sweep(); });
  }, { passive: true });
  // jumping to a section by its chip scrolls past many lists: wait until the scroll settles before tidying
  function suspendDuringJump() {
    suspended = true;
    clearTimeout(jumpTimer);
    const done = () => { if (!suspended) return; suspended = false; clearTimeout(jumpTimer); sweep(); };
    view.addEventListener('scrollend', done, { once: true });
    jumpTimer = setTimeout(done, 1800);
  }
  view.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);
  return { build };
}

const platformPills = (counts) => `<ul class="pills">${counts.filter(([, n]) => n).map(([p, n]) => `<li><i style="background:${esc(p.color)}"></i>${esc(p.name)} <b>${num(n)}</b></li>`).join('')}</ul>`;
const platformNames = () => meta.platforms.map((p) => p.name);
const joinNames = (a) => `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
const boldNames = () => joinNames(platformNames().map((n) => `<b>${esc(n)}</b>`));
// Crunchyroll is anime, so the film and series pages leave it out until you add it, keeping their lists mostly non-anime
const NON_ANIME_PLATFORMS = new Set(ALL_PLATS.filter((id) => id !== 'crunchyroll'));

// the film and series pages start with Crunchyroll off, so describe (and count) what is actually showing
const nonAnimeIntro = (pool, noun) => `<b>${num(pool.filter((r) => r.offers.some((o) => NON_ANIME_PLATFORMS.has(o.platform))).length)}</b> ${noun} across ${joinNames(meta.platforms.filter((p) => NON_ANIME_PLATFORMS.has(p.id)).map((p) => `<b>${esc(p.name)}</b>`))}. Crunchyroll is switched off here to keep the lists mostly non-anime; add it with the platform pills below.`;

function sectionHero({ eyebrow, title, intro, name, extraClass = '', counts }) {
  return `
    <div class="hero ${extraClass}">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h2>${esc(title)}</h2>
      <p>${intro}</p>
      <div class="cta"><button type="button" class="cta-a" data-cta="table">Browse the ${esc(name)} table</button><button type="button" class="cta-a" data-cta="stats">${esc(name[0].toUpperCase() + name.slice(1))} statistics</button></div>
      ${platformPills(counts)}
    </div>`;
}

const homeBoard = createBoard({
  root: '#homebody', view: '#view-home', p: '', lists: HOME_LISTS, groups: HOME_GROUPS, subset: () => true,
  hero: (pool, counts) => `
    <div class="hero">
      <span class="eyebrow">The Watcher</span>
      <h2>What to watch in the UK</h2>
      <p>Every film and series included with ${boldNames()}. Ranked, filterable and ready to dive into.</p>
      <form id="homesearch" role="search"><div class="sbox"><input type="search" id="homeq" autocomplete="off" placeholder="Search titles, actors, directors…" aria-label="Search titles" aria-controls="suggest"><ul id="suggest" role="listbox" hidden></ul></div><button type="submit" class="primary">Search</button></form>
      <div class="sections" role="navigation" aria-label="Sections">
        <a class="sec films" href="#films"><b>Films</b><span>${num(filmRows.length)}</span></a>
        <a class="sec series" href="#series"><b>Series</b><span>${num(seriesRows.length)}</span></a>
        <a class="sec anime" href="#anime"><b>Anime</b><span>${num(animeRows.length)}</span></a>
      </div>
      <div class="cta"><a class="cta-a" href="#table">Browse the table</a><a class="cta-a" href="#stats">Explore statistics</a></div>
      ${platformPills(counts)}
    </div>`,
});

const filmsBoard = createBoard({
  root: '#filmsbody', view: '#view-films', p: 'fl-', name: 'Films', lists: FILM_LISTS, groups: FILM_GROUPS, subset: (r) => r.type === 'film',
  fixedType: 'film', defaults: NON_ANIME_PLATFORMS, base: (s) => { s.type = 'film'; },
  hero: (pool, counts) => sectionHero({ eyebrow: 'Films', title: 'Films in the UK', name: 'films', counts,
    intro: nonAnimeIntro(pool, 'films') }),
});

const seriesBoard = createBoard({
  root: '#seriesbody', view: '#view-series', p: 'se-', name: 'Series', lists: SERIES_LISTS, groups: SERIES_GROUPS, subset: (r) => r.type === 'series',
  fixedType: 'series', defaults: NON_ANIME_PLATFORMS, base: (s) => { s.type = 'series'; },
  hero: (pool, counts) => sectionHero({ eyebrow: 'Series', title: 'Series in the UK', name: 'series', counts,
    intro: nonAnimeIntro(pool, 'series') }),
});

const animeBoard = createBoard({
  root: '#animebody', view: '#view-anime', p: 'an-', name: 'Anime', lists: ANIME_LISTS, groups: ANIME_GROUPS, subset: (r) => r._anime,
  base: (s) => { s.anime = true; },
  hero: (pool, counts) => {
    const dubs = pool.filter((r) => r._aud.includes('en')).length;
    return sectionHero({ eyebrow: 'Anime', title: 'Anime in the UK', name: 'anime', extraClass: 'anime', counts,
      intro: `<b>${num(pool.length)}</b> anime titles across ${boldNames()}: Crunchyroll's full library plus the anime on the other services${dubs ? `, with <b>${num(dubs)}</b> available in English dub` : ''}.` });
  },
});

// ---------- search as you type ----------
let sugRows = [];
let sugIdx = -1;
function hideSuggest() { $('#suggest').hidden = true; sugIdx = -1; }
function markSuggest() { $$('#suggest li').forEach((li, i) => li.classList.toggle('active', i === sugIdx)); }
function suggest() {
  const box = $('#suggest');
  const terms = norm($('#homeq').value).split(/\s+/).filter(Boolean);
  if (!terms.length) { sugRows = []; return hideSuggest(); }
  const hits = [];
  for (const r of data) {
    const t = r._n.title;
    const inTitle = terms.every((x) => t.includes(x));
    if (!inTitle && !terms.every((x) => `${t} ${r._n.people}`.includes(x))) continue;
    // word-start matches beat mid-word ones, so "dark kn" ranks The Dark Knight above Darkness
    const score = inTitle ? terms.reduce((n, x) => n + (t.startsWith(x) ? 3 : t.includes(` ${x}`) ? 2 : 1), 0) + (t === terms.join(' ') ? 10 : 0) : 0;
    hits.push([score, r]);
  }
  hits.sort((a, b) => b[0] - a[0] || b[1].votes - a[1].votes);
  sugRows = hits.slice(0, 8).map((h) => h[1]);
  sugIdx = -1;
  if (!sugRows.length) {
    box.innerHTML = '<li class="none">No matches</li>';
  } else {
    box.innerHTML = sugRows.map((r) => {
      const who = [...r.cast, ...r.directors].find((n) => terms.every((x) => norm(n).includes(x)) || norm(n).includes(terms[0]));
      const viaPerson = !terms.every((x) => r._n.title.includes(x)) && who;
      return `<li role="option" data-open="${esc(r.id)}"><span class="th">${r.poster ? `<img alt="" referrerpolicy="no-referrer" src="${POSTER(r.poster, 's166')}">` : ''}</span>
        <span class="sm"><b>${esc(r.title)}</b><small>${esc(kindOf(r))}${viaPerson ? ` · with ${esc(who)}` : ''}</small></span>
        <span class="dots">${r.offers.map((o) => `<i style="background:${esc(platforms[o.platform].color)}" title="${esc(platforms[o.platform].name)}"></i>`).join('')}</span></li>`;
    }).join('') + (hits.length > sugRows.length ? `<li class="all" data-searchall>See all ${num(hits.length)} results in the table →</li>` : '');
  }
  box.hidden = false;
}
function searchTable() {
  const q = $('#homeq').value.trim();
  state = fresh();
  state.text.all = lc(q);
  syncUI();
  hideSuggest();
  location.hash = '#table';
}

// ---------- routing & drill-down ----------
let route = 'home';
const BOARD_ROUTES = ['home', 'films', 'series', 'anime'];
// Each click on the home, anime or statistics pages that lands on another page pushes an entry holding the
// filters as they were; Back (or the browser back button) pops entries until the page matches, so the trail
// table -> anime statistics -> anime page is retraced one step at a time.
const drills = []; // {snapshot, label, from, route}
const topDrill = () => drills.at(-1) ?? null;

function drillTo(label, mutate, { clean = false, to = '#table' } = {}) {
  drills.push({ snapshot: cloneState(state), label, from: route, route: to === '#stats' ? 'stats' : 'table' }); // route = page it lands on
  if (clean) state = fresh();
  mutate(state);
  state.page = 0;
  syncUI();
  location.hash = to;
}
function undoDrill(want) {
  let restored = false;
  while (topDrill() && topDrill().route !== want) { state = drills.pop().snapshot; restored = true; }
  if (restored) syncUI();
}

function activeFilters() {
  const s = state;
  return (s.type !== 'all') + (s.access !== 'any') + (s.hasAwards ? 1 : 0) + (s.recent ? 1 : 0) + (s.anime ? 1 : 0)
    + Object.values(s.sets).reduce((n, v) => n + v.size, 0)
    + Object.values(s.num).filter((v) => v != null).length
    + Object.values(s.text).filter(Boolean).length;
}

function refresh() {
  if (route === 'home') return;
  const rows = data.filter(matches);
  $('#summary').textContent = `${num(rows.length)} of ${num(data.length)} titles`;
  $('#barcount').textContent = `${num(rows.length)} titles`;
  $('#doneCount').textContent = num(rows.length);
  const n = activeFilters();
  $('#fcount').textContent = n;
  $('#fcount').hidden = !n;
  if (route === 'stats') renderStats(rows); else renderTable(rows);
}

function applyRoute() {
  const want = { '#table': 'table', '#stats': 'stats', '#anime': 'anime', '#films': 'films', '#series': 'series' }[location.hash] ?? 'home';
  undoDrill(want);
  route = want;
  document.body.dataset.route = want;
  document.body.classList.toggle('boardpage', BOARD_ROUTES.includes(want)); // landing pages have no filter sidebar
  for (const v of ['home', 'films', 'series', 'anime', 'table', 'stats']) {
    $(`#view-${v}`).hidden = want !== v;
    $(`#tab-${v}`).classList.toggle('on', want === v);
  }
  $('#colwrap').hidden = want !== 'table';
  const d = topDrill();
  $('#backbar').hidden = !(d && want === d.route);
  if (d) {
    $('#backlabel').textContent = d.label;
    $('#back').textContent = `← Back to ${{ home: 'home', films: 'films', series: 'series', anime: 'anime', stats: 'statistics' }[d.from] ?? 'previous page'}`;
  }
  if (BOARD_ROUTES.includes(want)) $(`#view-${want}`).scrollTop = 0;
  $(`#tab-${want}`).scrollIntoView({ inline: 'center', block: 'nearest' }); // keep the current tab visible when the tab row scrolls
  closeFlyout();
  document.body.classList.remove('nav-open');
  refresh();
}

// ---------- events ----------
let timer;
const later = () => { clearTimeout(timer); timer = setTimeout(() => { state.page = 0; refresh(); }, 120); };

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.text) {
    state.text[el.dataset.text] = lc(el.value).trim();
    for (const other of $$(`[data-text="${el.dataset.text}"]`)) if (other !== el) other.value = el.value;
    later();
  } else if (el.dataset.num) {
    state.num[el.dataset.num] = el.value === '' ? null : Number(el.value);
    later();
  } else if (el.id === 'q-actors' || el.id === 'q-directors') {
    const kind = el.id.slice(2);
    pickerQuery[kind] = lc(el.value).trim();
    renderPicker(kind);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.set) {
    const set = state.sets[el.dataset.set];
    el.checked ? set.add(el.value) : set.delete(el.value);
  } else if (el.name === 'type') state.type = el.value;
  else if (el.name === 'access') state.access = el.value;
  else if (el.id === 'hasAwards') state.hasAwards = el.checked;
  else if (el.id === 'recentOnly') state.recent = el.checked;
  else if (el.id === 'animeOnly') state.anime = el.checked;
  else if (el.id === 'pagesize') state.pageSize = Number(el.value);
  else if (el.id === 'expand') {
    expand = el.checked;
    try { localStorage.setItem('lakestream.expand', expand ? '1' : '0'); } catch { /* ignore */ }
  } else if (el.id === 'minVotes') minVotes = Number(el.value);
  else if (el.dataset.col) {
    el.checked ? hidden.delete(el.dataset.col) : hidden.add(el.dataset.col);
    try { localStorage.setItem('lakestream.hidden', JSON.stringify([...hidden])); } catch { /* ignore */ }
    buildHead();
  } else return;
  state.page = 0;
  refresh();
});

document.addEventListener('click', (e) => {
  const t = e.target;
  const pick = t.closest('[data-pick]');
  if (pick) {
    const set = state.sets[pick.dataset.pick];
    const v = pick.dataset.v;
    set.has(v) ? set.delete(v) : set.add(v);
    renderPicker(pick.dataset.pick);
    state.page = 0;
    return refresh();
  }
  if (t.closest('#colwrap')) return;
  $('#colmenu').hidden = true;
  $('#colbtn').setAttribute('aria-expanded', 'false');
});

$('#tbl thead').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;
  const key = th.dataset.sort;
  state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
  updateSortIndicators();
  refresh();
});

$('#tbl tbody').addEventListener('click', (e) => {
  const r = byId.get(e.target.closest('tr')?.dataset.id);
  if (r) openFlyout(r);
});

$('#statsbody').addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) return openFlyout(byId.get(open.dataset.open));
  const a = e.target.closest('[data-a]');
  if (a) act(a.dataset.a, a.dataset.v, a.dataset.w);
});

$('#scrim').onclick = closeFlyout;
$('#flyout').addEventListener('click', (e) => { if (e.target.closest('#fly-close, [data-close-fly]')) closeFlyout(); });
const closeNav = () => document.body.classList.remove('nav-open');
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeFlyout(); closeNav(); } });

// phone layout: filters are a bottom sheet; close it from the ✕, the done button, the backdrop or a swipe down
$('#openfilters').onclick = () => document.body.classList.add('nav-open');
$('#filters-close').onclick = closeNav;
$('#filters-done').onclick = closeNav;
$('#navscrim').onclick = closeNav;
function swipeDown(el, close) {
  let y0 = null;
  el.addEventListener('touchstart', (e) => { y0 = el.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (y0 != null && e.changedTouches[0].clientY - y0 > 90 && matchMedia('(max-width: 800px)').matches) close();
    y0 = null;
  }, { passive: true });
}
swipeDown($('#flyout'), closeFlyout);
swipeDown($('#filters'), closeNav);

$('#prev').onclick = () => { state.page--; refresh(); };
$('#next').onclick = () => { state.page++; refresh(); };
$('#colbtn').onclick = () => {
  const m = $('#colmenu');
  m.hidden = !m.hidden;
  $('#colbtn').setAttribute('aria-expanded', String(!m.hidden));
};
$('#back').onclick = () => (history.length > 1 ? history.back() : (location.hash = `#${topDrill()?.from ?? 'stats'}`));
$('#reset').onclick = () => {
  state = fresh();
  drills.length = 0;
  pickerQuery.actors = pickerQuery.directors = '';
  $('#q-actors').value = $('#q-directors').value = '';
  syncUI();
  $('#backbar').hidden = true;
  refresh();
};
window.addEventListener('hashchange', applyRoute);

const home = $('#view-home');
home.addEventListener('click', (e) => {
  const t = e.target;
  if (!t.closest('.sbox')) hideSuggest();
  if (t.closest('[data-searchall]')) return searchTable();
  if (t.closest('[data-open]')) hideSuggest();
});
home.addEventListener('submit', (e) => { e.preventDefault(); searchTable(); });
home.addEventListener('input', (e) => { if (e.target.id === 'homeq') suggest(); });
home.addEventListener('focusin', (e) => { if (e.target.id === 'homeq' && $('#homeq').value.trim()) suggest(); });
home.addEventListener('keydown', (e) => {
  if (e.target.id !== 'homeq') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!sugRows.length) return;
    e.preventDefault();
    sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + sugRows.length) % sugRows.length;
    markSuggest();
  } else if (e.key === 'Enter' && sugIdx >= 0) {
    e.preventDefault();
    const r = sugRows[sugIdx];
    hideSuggest();
    openFlyout(r);
  } else if (e.key === 'Escape') hideSuggest();
});

// ---------- init ----------
$('#banner').hidden = !meta.sample;
$('#updated').textContent = `Updated ${dateFmt.format(new Date(meta.updated))} · ${meta.region}`;
$('#expand').checked = expand;
buildColMenu();
buildHead();
syncUI();
homeBoard.build();
filmsBoard.build();
seriesBoard.build();
animeBoard.build();
applyRoute();
document.body.classList.remove('loading');
} catch (err) {
  console.error(err);
  $('#summary').textContent = '';
  const b = $('#banner');
  b.textContent = 'Could not load the data files. Run "npm run update" (or "npm run sample"), and if opening index.html directly, also "npm run offline".';
  b.hidden = false;
  document.body.classList.remove('loading');
}
})();
