  var aideaCitationNavigation = 0;
  function aideaCitationRevisionMatches(saved, current) {
    if (typeof saved !== "string" || typeof current !== "string") return false;
    if (saved === current) return true;
    // Legacy revisions included Zotero's server sync counter. That counter can
    // change while the attachment bytes, path identity, and mtime stay intact.
    // Ignore only that counter, never a changed item, mtime, or content type.
    const pattern = /^item:(\d+)\|version:\d+\|mtime:(\d+)\|type:([^|]+)$/;
    const before = pattern.exec(saved);
    const after = pattern.exec(current);
    return Boolean(before && after && before[1] === after[1] && before[2] === after[2] && before[3] === after[3]);
  }
  function aideaNormalizeCitationText(text) {
    return String(text || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }
  function aideaCitationPosition(ref, statement, chars) {
    const terms = [...new Set((String(statement || "").match(/[A-Za-z][A-Za-z0-9_.+-]{2,}|\d[\d,.]*/g) || []).map(aideaNormalizeCitationText).filter(Boolean))];
    const sentences = String(ref.text || "").split(/(?<=[.!?])\s+|\n\s*\n/u).filter(text => text.trim());
    const candidates = sentences.map(text => {
      const normalized = aideaNormalizeCitationText(text);
      const score = terms.reduce((sum, term) => sum + (normalized.includes(term) ? (term.length >= 4 ? 4 : 1) : 0), 0);
      return {text, normalized, score};
    }).sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    if (candidates[0].score < 4 && String(ref.text || "").length > 800) return null;
    const offsets = [];
    let pageText = "";
    for (const [index, char] of chars.entries()) {
      const text = aideaNormalizeCitationText(char.c);
      pageText += text;
      for (let i = 0; i < text.length; i++) offsets.push(index);
    }
    for (const candidate of candidates.slice(0, 3)) {
      if (candidate.score < 4 && String(ref.text || "").length > 800) continue;
      const needle = candidate.normalized;
      if (needle.length < 12) continue;
      const start = pageText.indexOf(needle);
      if (start < 0) continue;
      const matched = chars.slice(offsets[start], offsets[start + needle.length - 1] + 1);
      const rects = [];
      for (const char of matched) {
        if (!Array.isArray(char.rect) || char.rect.length !== 4 || !char.rect.every(Number.isFinite)) continue;
        const last = rects[rects.length - 1];
        if (last && Math.abs(last[1] - char.rect[1]) < 1 && Math.abs(last[3] - char.rect[3]) < 1 && char.rect[0] >= last[0] && char.rect[0] - last[2] < 4) {
          last[2] = Math.max(last[2], char.rect[2]);
        } else rects.push([...char.rect]);
      }
      if (rects.length) return {pageIndex: ref.locator.pageIndex, rects};
    }
    return null;
  }
  async function aideaHighlightCitation(item, ref, statement, navigation) {
    const pageIndex = ref.locator?.pageIndex;
    if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || !ref.text) return false;
    const reader = await Zotero.Reader.open(item.id, {pageIndex});
    if (!reader) return false;
    await reader._initPromise;
    const inner = aideaUnwrapPdfObject(reader._internalReader);
    const view = aideaUnwrapPdfObject(inner?._primaryView);
    await view?.initializedPromise;
    if (typeof view?._ensureBasicPageData !== "function" || typeof view?.navigate !== "function") return false;
    await view._ensureBasicPageData(pageIndex);
    const data = aideaUnwrapPdfObject(view._pdfPages?.[pageIndex]);
    const chars = aideaUnwrapPdfObject(data?.chars);
    if (!chars?.length) return false;
    const position = aideaCitationPosition(ref, statement, Array.from(chars, aideaUnwrapPdfObject));
    if (!position || navigation !== aideaCitationNavigation) return false;
    const location = {position};
    const win = reader._iframeWindow;
    const clone = typeof Components !== "undefined" && Components.utils?.cloneInto
      ? Components.utils.cloneInto(location, win) : location;
    await view.navigate(clone);
    return true;
  }
