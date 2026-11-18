import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const bundle = await fs.readFile(process.argv[2] || new URL('../plugin/content/scripts/aidea.js', import.meta.url), 'utf8');
const start = bundle.indexOf('  var aideaCitationNavigation =');
const end = bundle.indexOf('  var init_citations =', start);
const calls = [];
const chars = [...'The final dataset included 3,369,219 cells from four brains.'].map((c, index) => ({c, rect: [index, 0, index + 1, 10]}));
const view = {
  initializedPromise: Promise.resolve(), _pdfPages: {10: {chars}},
  _ensureBasicPageData: async page => calls.push(['load', page]),
  navigate: async location => calls.push(['highlight', location]),
};
const item = {id: 42, isAttachment: () => true};
const reader = {_initPromise: Promise.resolve(), _internalReader: {_primaryView: view}};
let revision = 'current';
const context = vm.createContext({
  Zotero: {Items: {get: () => item}, Reader: {open: async (...args) => {calls.push(['open', ...args]); return reader;}}},
  getDocumentAdapter: () => ({navigate: async (_item, locator) => calls.push(['page', locator]), getSourceRevision: async () => revision}),
  documentFingerprint: async () => 'hash', aideaUnwrapPdfObject: value => value?.wrappedJSObject || value,
  ztoolkit: {log(){}},
});
vm.runInContext(bundle.slice(start, end), context);
const refs = ['ec5fbc539', 'ee39bf366', 'e56d656eb'].map(id => ({id, itemId: 42, title: 'Paper', kind: 'pdf', sourceRevision: 'current', text: 'The final dataset included 3,369,219 cells from four brains.', locator: {kind: 'pdf-page', pageIndex: 10}}));
const grouped = '总体规模 [[cite:ec5fbc539, ee39bf366, e56d656eb]]';
assert.equal(context.citedEvidence(grouped, refs).length, 3);
const markdown = context.citationMarkdown(grouped, refs);
for (const ref of refs) assert(markdown.includes(`aidea-cite:${ref.id}`));
assert.equal((markdown.match(/aidea-cite:/g) || []).length, 3);
assert.equal(context.mapCitationText('`[[cite:x, y]]`\n```\n[[cite:x,y]]\n```', () => 'wrong'), '`[[cite:x, y]]`\n```\n[[cite:x,y]]\n```');
assert.equal(context.citedEvidence('[[cite:ec5fbc539，ee39bf366;ec5fbc539]]', refs).length, 2);
assert(context.citationMarkdown('[[cite:missing]]', refs).includes('来源记录不可用'));
const result = await context.navigateCitation(refs[0], '总计 3,369,219 个细胞');
assert(result.includes('临时高亮'));
assert.equal(calls.find(call => call[0] === 'highlight')[1].position.pageIndex, 10);
assert.equal(calls.find(call => call[0] === 'highlight')[1].position.rects.length, 1);
assert(!calls.some(call => call[0] === 'annotation'));
assert(context.citationMarkdown(grouped, refs, true).includes('PDF p. 11'));
calls.length = 0;
revision = 'changed';
await assert.rejects(context.navigateCitation(refs[0], '3,369,219'), /版本不同/);
assert(!calls.some(call => call[0] === 'highlight'));
revision = 'current';
calls.length = 0;
const missingText = {...refs[0], text: 'An unrelated sentence that cannot match this page.'};
assert((await context.navigateCitation(missingText, 'different')).includes('未能精确匹配'));
assert(!calls.some(call => call[0] === 'highlight'));
calls.length = 0;
let releasePage;
const loadPage = view._ensureBasicPageData;
view._ensureBasicPageData = () => new Promise(resolve => { releasePage = resolve; });
const earlier = context.navigateCitation(refs[0], '3,369,219');
while (!releasePage) await new Promise(resolve => setTimeout(resolve, 0));
view._ensureBasicPageData = loadPage;
await context.navigateCitation(refs[1], '3,369,219');
releasePage();
await earlier;
assert.equal(calls.filter(call => call[0] === 'highlight').length, 1, 'Late earlier clicks must not overwrite the most recent highlight');
console.log('Passed grouped citations, code spans, source retention, PDF page/highlight, unavailable references and source-version checks.');
