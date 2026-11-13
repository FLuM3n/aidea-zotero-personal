import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const bundle = await fs.readFile(new URL('../plugin/content/scripts/aidea.js', import.meta.url), 'utf8');
function section(start, end) {
  const from = bundle.indexOf(start);
  const to = bundle.indexOf(end, from + start.length);
  assert(from >= 0 && to > from);
  return bundle.slice(from, to);
}

const item = { id: 1 };
const pdf = { item, kind: 'pdf' };
const requests = [];
const stages = [];
const deltas = [];
const state = {};
let document = pdf;
let documentReads = 0;
let epubContext = 'Nearby EPUB sentence';
let response = '译文';
const runtime = vm.createContext({
  SELECTED_TEXT_CHAR_LIMIT: 12000,
  COLD_START_CACHE_TEXT_LIMIT: 8000,
  SELECTION_TRANSLATION_SYSTEM_PROMPT: 'Translate only the selection.',
  getSelectionTranslatePrefs: () => ({ enabled: true, sourceLang: 'auto', targetLang: 'zh-CN' }),
  getSelectionTranslateLanguageLabel: value => value,
  resolveSelectionTranslateModel: () => ({ model: 'test-model', apiBase: 'oauth://openai-codex', providerId: 'openai-codex' }),
  resolveReaderDocument: () => document,
  getDocumentAdapter: kind => ({
    contextPolicy: { eagerWarmup: kind === 'pdf' },
    selectionContextPolicy: { strategy: kind === 'pdf' ? 'cold-start-cache' : 'retrieval', maxChunks: 3, maxLength: 2000 },
  }),
  ensureDocumentContext: async () => { documentReads++; return { chunks: ['Hidden full paper text'] }; },
  buildReaderDocumentContext: async () => epubContext,
  callLLM: async () => { assert.fail('Unexpected extra model call'); },
  callLLMStream: async (params, onDelta) => { requests.push(params); onDelta(response); return response; },
  getWindowMap: () => new Map([[item.id, state]]),
  activePaperConversationByItem: new Map([[item.id, 1]]),
  initChatStore() {}, buildUI() {}, ensureConversationLoaded() {}, renderShortcuts() {}, setupHandlers() {}, refreshChat() {},
  ztoolkit: { log: (...args) => assert.fail(args.join(' ')) },
});
vm.runInContext(section('  function normalizeSelectedTextForTranslation(', '  var DEFAULT_SOURCE_LANG,'), runtime);
vm.runInContext(section('  async function bootstrapSharedReaderPanel(', '  function invalidateSharedReaderPanelForItem('), runtime);
await runtime.bootstrapSharedReaderPanel({}, {}, item);
assert.equal(state.hasBootstrapped, true);
assert.equal(documentReads, 1, 'Local document preparation for chat may still occur');
assert.equal(requests.length, 0, 'Opening a PDF must not trigger translation');

const selected = 'The ratio α/β increased.';
const callbacks = { onStage: stage => stages.push(stage), onDelta: delta => deltas.push(delta) };
const result = await runtime.translateSelectedTextForReader({ item, selectedText: selected, callbacks });
assert.equal(result.translation, response);
assert.equal(result.provider, 'openai-codex');
assert.deepEqual(stages, ['translate']);
assert.deepEqual(deltas, [response]);
assert.equal(documentReads, 1, 'PDF selection must not load document context');
assert.equal(requests.length, 1);
assert(requests[0].prompt.includes(`<selected-text>\n${selected}\n</selected-text>`));
assert(!requests[0].prompt.includes('Hidden full paper text'));
assert(!requests[0].prompt.includes('cold-start'));
await assert.rejects(runtime.translateSelectedTextForReader({ item, selectedText: ' ' }), /No selected text/);
assert.equal(requests.length, 1);
response = ' ';
await assert.rejects(runtime.translateSelectedTextForReader({ item, selectedText: selected }), /Selection translation returned empty content/);
assert.equal(requests.length, 2, 'An empty translation should not trigger a cache retry');

response = '译文';
document = { item, kind: 'epub' };
await runtime.translateSelectedTextForReader({ item, selectedText: selected });
assert(requests.at(-1).prompt.includes(epubContext));
epubContext = '';
await runtime.translateSelectedTextForReader({ item, selectedText: selected });
assert(!requests.at(-1).prompt.includes('<retrieved-document-context>'));
assert.equal(requests.length, 4);
console.log('Passed: PDF open, PDF selection, empty output, streaming, and EPUB retrieval/fallback.');
