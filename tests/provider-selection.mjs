import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const path = process.argv[2] || new URL('../plugin/content/scripts/aidea.js', import.meta.url);
const bundle = await fs.readFile(path, 'utf8');
function section(start, end) {
  const from = bundle.indexOf(start);
  const to = bundle.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, start);
  return bundle.slice(from, to);
}
const local = 'Gemini 网页版（本地）';
const google = 'Google Gemini';
function scenario(existing = true) {
  const state = { handler: null, saved: null, notified: 0, renders: 0 };
  const runtime = vm.createContext({
    cache2: {
      [google]: [{ id: 'gemini-4-hydrogen', apiBase: 'https://example.invalid/v1', apiKey: 'test-official-key' }],
      ...(existing ? { [local]: [{ id: 'gemini-flash-lite', apiBase: 'http://127.0.0.1:8100/v1' }] } : {}),
    },
    selectionCache: { [google]: ['gemini-4-hydrogen'], ...(existing ? { [local]: ['gemini-flash-lite'] } : {}) },
    lastFetchedModels: [
      { id: 'gemini-4-hydrogen', label: 'Hydrogen', checked: true },
      { id: 'gemini-flash-lite', label: 'Flash Lite', checked: true },
      { id: 'gemini-pro', label: 'Pro', checked: false },
    ],
    fetchedModelsLabelInput: { value: local },
    customApiBaseInput: { value: 'http://127.0.0.1:8100/v1/' },
    customApiKeyInput: { value: '' },
    saveModelsBtn: {
      addEventListener: (name, callback) => { assert.equal(name, 'click'); state.handler = callback; },
      textContent: '保存', className: '', classList: { add() {}, remove() {} },
    },
    saveProviderApiKey() {}, saveModelCache() {},
    saveModelSelectionState: cache => { state.saved = JSON.parse(JSON.stringify(cache)); },
    syncSidebarModelPrefsFromSelection() {},
    notifyDiscussionModelStateChanged: () => { state.notified++; },
    renderModels: () => { state.renders++; },
    setTimeout() {}, L: { saved: '已保存' },
    OAUTH_PROVIDER_LABELS: {},
    getApiProfiles: () => ({ primary: { model: '', apiBase: '', apiKey: '' } }),
    getPrimaryConnectionMode: () => 'custom',
    isOAuthProviderId: () => false,
  });
  vm.runInContext(section('  function hasOwn(', '  var init_oauthModelSelection'), runtime);
  vm.runInContext(section('  function parseOAuthModelCache(', '  function pickBestDefaultModel('), runtime);
  vm.runInContext(section('  function resolveModelConfigFromChoice(', '  function resolveSelectionTranslateModel('), runtime);
  vm.runInContext(section('    const persistSelectionState = () => {', '    const setProviderSelection = '), runtime);
  runtime.getStringPref = name => name === 'oauthModelListCache'
    ? JSON.stringify(runtime.cache2) : name === 'oauthModelSelectionCache' ? JSON.stringify(state.saved || runtime.selectionCache) : '';
  vm.runInContext(section('    saveModelsBtn.addEventListener("click", () => {', '    const customModeStatus = '), runtime);
  return { runtime, state, save: () => state.handler() };
}

const previous = scenario();
// Reproduce the stale selection: model exists, but is missing from menu.
previous.runtime.cache2[local].push({ id: 'gemini-4-hydrogen', apiBase: 'http://127.0.0.1:8100/v1' });
assert.equal(previous.runtime.getModelChoices().choices.filter(row => row.provider === local && row.model === 'gemini-4-hydrogen').length, 0);
previous.save();
assert.deepEqual(previous.state.saved[local], ['gemini-4-hydrogen', 'gemini-flash-lite']);
assert.deepEqual(previous.state.saved[google], ['gemini-4-hydrogen']);
const choices = previous.runtime.getModelChoices().choices;
const hydrogen = choices.filter(row => row.model === 'gemini-4-hydrogen');
assert.equal(hydrogen.length, 2, 'Same model name survives in both providers');
const localChoice = hydrogen.find(row => row.providerId === local);
const officialChoice = hydrogen.find(row => row.providerId === google);
const localRoute = previous.runtime.resolveModelConfigFromChoice(localChoice, {});
const officialRoute = previous.runtime.resolveModelConfigFromChoice(officialChoice, {});
assert.equal(localRoute.apiBase, 'http://127.0.0.1:8100/v1');
assert.equal(localRoute.apiKey, '');
assert.equal(officialRoute.apiBase, 'https://example.invalid/v1');
assert.equal(officialRoute.apiKey, 'test-official-key');
assert.equal(choices.filter(row => row.providerId === local).length, 2);
assert(!choices.some(row => row.model === 'gemini-pro'));
assert.equal(previous.state.notified, 1);
assert.equal(previous.state.renders, 1);

// Repeated save honors removals and keeps other providers untouched.
previous.runtime.lastFetchedModels[0].checked = false;
previous.save();
assert.deepEqual(previous.state.saved[local], ['gemini-flash-lite']);
assert.deepEqual(previous.state.saved[google], ['gemini-4-hydrogen']);
assert.equal(previous.runtime.getModelChoices().choices.filter(row => row.model === 'gemini-4-hydrogen').length, 1);

// A first save also honors explicitly checked models instead of auto-picking defaults.
const first = scenario(false);
first.save();
assert.deepEqual(first.state.saved[local], ['gemini-4-hydrogen', 'gemini-flash-lite']);
first.runtime.lastFetchedModels.forEach(row => { row.checked = false; });
first.save();
assert(!first.runtime.getModelChoices().choices.some(row => row.providerId === local));
assert.deepEqual(first.state.saved[google], ['gemini-4-hydrogen']);
console.log('Passed stale-selection regression, same-name providers, independent endpoint/key routing, explicit checkbox saves/removals, first save, empty selection, and sidebar refresh.');
