import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const bundle = await fs.readFile(new URL('../plugin/content/scripts/aidea.js', import.meta.url), 'utf8');
const start = bundle.indexOf('  var aideaCitationNavigation =');
const end = bundle.indexOf('  var init_citations =', start);
const calls = [];
const sentence = 'The final dataset included 3,369,219 cells from four brains.';
const chars = [...sentence].map((c, index) => ({c, rect: [index, 0, index + 1, 10]}));
const item = {id: 307, isAttachment: () => true};
const view = {initializedPromise: Promise.resolve(), _pdfPages: {10: {chars}},
  _ensureBasicPageData: async () => {}, navigate: async location => calls.push(['highlight', location])};
const reader = {_initPromise: Promise.resolve(), _internalReader: {_primaryView: view}};
const revision = version => `item:307|version:${version}|mtime:1794570502171|type:application/pdf`;
let current = revision(2100);
let fingerprint = 'original-hash';
const runtime = vm.createContext({
  Zotero: {Items: {get: () => item, getByLibraryAndKeyAsync: async () => item},
    Reader: {open: async (...args) => { calls.push(['open', ...args]); return reader; }}},
  getDocumentAdapter: () => ({getSourceRevision: async () => current,
    navigate: async (_, locator) => calls.push(['page', locator])}),
  documentFingerprint: async () => fingerprint,
  aideaUnwrapPdfObject: value => value?.wrappedJSObject || value,
  ztoolkit: {log() {}},
});
vm.runInContext(bundle.slice(start, end), runtime);
const ref = {id:'ec5fbc539', itemId:307, itemKey:'ABCD1234', libraryId:1, kind:'pdf', title:'Paper',
  sourceRevision:revision(2039), text:sentence, locator:{kind:'pdf-page',pageIndex:10}};

// Reproduce the user's unchanged mtime and changed server-sync version counter.
assert(runtime.aideaCitationRevisionMatches(revision(2054), revision(2100)));
assert(runtime.aideaCitationRevisionMatches(revision(2034), revision(2100)));
assert((await runtime.navigateCitation(ref, '3,369,219 cells')).includes('临时高亮'));
assert(calls.some(([kind, location]) => kind === 'page' && location.pageIndex === 10));
assert(calls.some(([kind]) => kind === 'highlight'));
assert.equal((await runtime.evidenceForExport([ref]))[0].locator.pageIndex, 10);
assert((await runtime.exportCitationMarkdown('[[cite:ec5fbc539]]', [ref])).includes('page=11'));

// Metadata tolerance must not weaken file-content or source-identity checks.
for (const invalid of [
  revision(2100).replace('1794570502171','1794570502172'),
  revision(2100).replace('item:307','item:308'),
  revision(2100).replace('application/pdf','application/epub+zip'),
  revision(2100).replace('1794570502171','unknown'), undefined, 'malformed-revision',
]) {
  current = invalid;
  calls.length = 0;
  assert(!runtime.aideaCitationRevisionMatches(ref.sourceRevision, current));
  await assert.rejects(runtime.navigateCitation(ref), /版本不同/);
  assert(!calls.some(([kind]) => kind === 'highlight'));
  assert(!calls.some(([kind, location]) => kind === 'page' && location));
  assert.equal((await runtime.evidenceForExport([ref]))[0].locator, undefined);
}
current = revision(2100);
fingerprint = 'different-hash';
calls.length = 0;
await assert.rejects(runtime.navigateCitation({...ref,documentHash:'original-hash'}), /版本不同/);
assert(!calls.some(([kind]) => kind === 'highlight'));
assert.equal((await runtime.evidenceForExport([{...ref,documentHash:'original-hash'}]))[0].locator, undefined);
fingerprint = 'original-hash';
assert((await runtime.navigateCitation({...ref,documentHash:'original-hash'}, '3,369,219')).includes('临时高亮'));
console.log('Passed actual legacy-revision regression, navigation/highlight/export after metadata sync, and rejection of changed mtime, item, MIME, missing revision and changed PDF hash.');
