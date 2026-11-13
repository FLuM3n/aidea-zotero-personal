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
const runtime = vm.createContext({
  URL,
  getModelContextWindowOverride: () => undefined,
  getDiscoveredModelContextWindow: () => undefined,
  formatDocumentContext: text => `Document Context (reference data):\n${text}`,
  stringifyContent: text => text,
});
vm.runInContext(section('  function aideaProviderPresets(', '  function aideaKnownContextWindow('), runtime);
vm.runInContext(section('  function getModelContextWindow(', '  function getModelContextWindowOverride('), runtime);
vm.runInContext(section('  function buildMessages(', '  function getFetch2('), runtime);
const preset = runtime.aideaProviderPresets().find(row => row.label === 'Gemini 网页版（本地）');
assert(preset);
assert.equal(preset.apiBase, 'http://127.0.0.1:8100/v1/');
assert.equal(preset.model, 'gemini-3.8-flash');
assert(preset.placeholder.includes('留空'));
assert.equal(runtime.getModelContextWindow(preset.apiBase, preset.model), 131072);
assert.equal(runtime.getModelContextWindow('https://generativelanguage.googleapis.com/v1beta/openai', preset.model), 1048576);
runtime.getModelContextWindowOverride = () => 65536;
assert.equal(runtime.getModelContextWindow(preset.apiBase, preset.model), 65536);
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDa0AAAAASUVORK5CYII=';
const document = 'Introduction: first page.\nMethods: sample preparation.\nResults: final page.';
const messages = runtime.buildMessages({
  context: document,
  history: [{ role: 'user', content: 'Previous question' }, { role: 'assistant', content: 'Previous answer' }],
  prompt: '请结合正文解释当前页图片。',
  images: [image],
}, 'Research reading assistant');
assert(messages.some(message => typeof message.content === 'string' && message.content.includes(document)));
assert.equal(messages.at(-1).content.filter(part => part.type === 'image_url').length, 1);
const payload = { model: preset.model, messages, stream: true };
console.log('Passed provider preset, local context budget, manual override, full text and image request structure.');
