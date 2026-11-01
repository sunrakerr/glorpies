import { LOOKS, STATES, SHAPES } from 'glorpies';
import { DEFAULTS, INTEGRATIONS, VERSION } from './shared.js';
import './style.css';

document.getElementById('app').innerHTML = `
  <header><div><p class="eyebrow">installed from npm · v${VERSION}</p><h1>glorpies <span>integration lab</span></h1></div><a href="https://glorpies.sunrakerr.dev/docs">Docs ↗</a></header>
  <main><aside><form id="controls">
    <h2>One specimen. Every integration.</h2><p class="muted">Change a prop and compare the results. Each card runs in its own page, using the published package.</p>
    <label>Name <input name="name" value="sunrakerrisfriednoodlz"></label>
    <label class="check"><input name="numeric" type="checkbox"> Treat the name as a numeric seed</label>
    <div class="pair"><label>Look <select name="look">${['auto', ...LOOKS.map(l=>l.id)].map(id=>`<option ${id===DEFAULTS.look?'selected':''}>${id}</option>`).join('')}</select></label><label>State <select name="state">${STATES.map(s=>`<option>${s}</option>`).join('')}</select></label></div>
    <div class="pair"><label>Size <input name="size" value="144"></label><label>Shape <select name="shape">${SHAPES.map(s=>`<option ${s==='circle'?'selected':''}>${s}</option>`).join('')}</select></label></div>
    <label>Background <select name="backdrop"><option value="paper">The face’s own paper</option><option value="none">Transparent</option><option value="colour">Custom colour</option></select></label>
    <label>Colour <input name="colour" value="#ffe9a8"></label>
    <label>Accessible label <input name="label" value="Integration specimen"></label>
    <div class="pair"><label>Priority <input name="priority" type="number" value="2"></label><label>Class <input name="className" value=""></label></div>
    <label class="check"><input name="alive" type="checkbox"> Alive</label><label class="check"><input name="pokeable" type="checkbox" checked> React to taps</label>
    <label>Photo fallback <select name="photo"><option value="">No photo</option><option value="/photo.png">Working photo</option><option value="/photo-delay.png">Slow photo</option><option value="/photo-missing.png">Missing photo</option></select></label>
    <label>Image format <select name="format"><option>png</option><option>webp</option><option>jpeg</option><option>svg</option><option>gif</option></select></label>
    <button type="reset">Reset specimen</button>
    <p class="muted small">Still APIs and server images don’t use component animation props. The Svelte action and mount() use a canvas sized by this app.</p>
  </form><section id="report"><h2>Latest automated run</h2><p class="muted">Run <code>npm test</code> in this folder to populate the report.</p></section></aside>
  <section class="comparisons"><div class="section-head"><h2>Live comparison</h2><span id="ready">starting…</span></div><div class="grid">${INTEGRATIONS.map(([id,label])=>`<article data-integration="${id}"><div class="card-head"><h3>${label}</h3><span class="status">loading</span></div><iframe title="${label} integration" src="/case.html?integration=${id}" loading="lazy"></iframe></article>`).join('')}</div><section class="code"><h2>Current props</h2><pre id="props"></pre></section></section></main>`;

const form = document.getElementById('controls');
function read() {
  const f = form.elements;
  return { ...DEFAULTS, name: f.numeric.checked ? Number(f.name.value) : f.name.value,
    look: f.look.value, state: f.state.value, size: /^\d+(\.\d+)?$/.test(f.size.value) ? Number(f.size.value) : f.size.value,
    shape: f.shape.value, background: f.backdrop.value === 'none' ? false : f.backdrop.value === 'colour' ? f.colour.value : true,
    label: f.label.value, alive: f.alive.checked, pokeable: f.pokeable.checked, priority: Number(f.priority.value),
    className: f.className.value, photo: f.photo.value, format: f.format.value };
}
function update() {
  const props = read(); document.getElementById('props').textContent = JSON.stringify(props, null, 2);
  for (const frame of document.querySelectorAll('iframe')) frame.contentWindow.postMessage({ type: 'glorpies:props', props }, location.origin);
}
form.addEventListener('input', update);
form.addEventListener('reset', () => setTimeout(update));
const ready = new Set();
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const {type,integration,error} = event.data || {};
  const card = document.querySelector(`[data-integration="${integration}"]`);
  if (!card) return;
  if (type === 'glorpies:ready') { ready.add(integration); card.querySelector('.status').textContent = 'ready'; event.source.postMessage({ type: 'glorpies:props', props: read() }, location.origin); }
  if (type === 'glorpies:error') { card.querySelector('.status').textContent = 'error'; card.querySelector('.status').title = error; card.dataset.error = 'true'; }
  document.getElementById('ready').textContent = `${ready.size} / ${INTEGRATIONS.length} loaded`;
});
fetch('/api/report').then(r=>r.json()).then(report=>{
  if (!report.results?.length) return;
  const passed = report.results.filter(r=>r.status==='pass').length;
  document.getElementById('report').innerHTML = `<h2>Latest automated run</h2><p><strong>${passed}</strong> / ${report.results.length} checks passed</p><p class="muted small"></p>`;
  document.querySelector('#report .small').textContent = `${report.version} · ${report.platform} · ${report.finishedAt}`;
}).catch(()=>{});
update();
