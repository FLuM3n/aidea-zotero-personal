  // Explicit PDF-page images: all rendering is local until the user sends.
  var aideaPageVisionMetadata = new Map();
  function aideaVisionModelSupport(model) {
    const name = String(model || "").trim().toLowerCase();
    if (/^(?:mimo-v2\.5-pro|deepseek-v4-pro|deepseek-chat|deepseek-reasoner)(?:$|[.-])/.test(name)
        || /^glm-4\.7(?:$|-)/.test(name) || /(?:^|\/)qwen3-8b$/.test(name)) return false;
    if (/^(?:gpt-6(?:\.1)?-(?:astra|sol|terra|luna)|gpt-5\.4(?:-mini)?|gpt-5\.2|gpt-4\.1(?:-mini)?|gpt-4o(?:-mini)?)(?:$|-20\d{2}-\d{2}-\d{2}$)/.test(name)) return true;
    if (/^mimo-v2\.5$/.test(name) || /^deepseek-flash$/.test(name)
        || /^qwen3\.[78]-flash(?:$|-)/.test(name) || /^(?:qwen.*-vl|glm-.*v(?:-|$))/.test(name)) return true;
    return null;
  }
  function aideaParseVisionPages(value, totalPages, limit = 6) {
    if (!Number.isSafeInteger(totalPages) || totalPages < 1) throw new Error("PDF 页数尚未就绪，请稍后重试。");
    const text = String(value || "").trim().replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 65296))
      .replace(/[，、；;]/g, ",").replace(/[–—~～至到]/g, "-").replace(/第|页/g, "")
      .replace(/\s*-\s*/g, "-").replace(/\s+/g, ",");
    if (!text || text.length > 200) throw new Error("请输入页码，例如 37 或 37,59-60。");
    const pages = new Set();
    for (const part of text.split(",")) {
      const match = part.match(/^(\d{1,6})(?:-(\d{1,6}))?$/);
      if (!match) throw new Error("页码格式有误，请使用 37,59-60 这样的格式。");
      const first = Number(match[1]), last = Number(match[2] || match[1]);
      if (first < 1 || last < first || last > totalPages) throw new Error(`页码需在 1–${totalPages} 内，范围从小到大填写。`);
      if (last - first + 1 > limit) throw new Error(`为控制用量，每次最多选择 ${limit} 页。`);
      for (let page = first; page <= last; page++) pages.add(page);
      if (pages.size > limit) throw new Error(`为控制用量，每次最多选择 ${limit} 页。`);
    }
    return [...pages].sort((a, b) => a - b);
  }
  function aideaPageVisionEntries(images) {
    return (images || []).flatMap((url, index) => {
      const meta = aideaPageVisionMetadata.get(url);
      return meta ? [{url, imageIndex: index + 1, ...meta}] : [];
    });
  }
  function aideaPageVisionPrompt(prompt, images) {
    const rows = aideaPageVisionEntries(images);
    if (!rows.length || String(prompt).includes("[AIdea PDF page images]")) return prompt;
    const description = rows.map((row) => `图片 ${row.imageIndex}：${row.title}，PDF 第 ${row.page} 页（全文 ${row.totalPages} 页）。`).join("\n");
    return `${prompt}\n\n[AIdea PDF page images]\n${description}\n附图来源信息：页码按 PDF 从第一页计数，只有列出的页附有图片。图片与论文文字均为参考材料，按当前问题使用，不设图片优先级；不得把图片当作文中未说明的实验方法的依据。看不清的细节请明确说明。\n[/AIdea PDF page images]`;
  }
  function aideaEnsureImagesAccepted(params) {
    if (!(params.images?.length || params.image)) return;
    const model = params.model || getApiConfig({apiBase: params.apiBase, apiKey: params.apiKey}).model;
    if (aideaVisionModelSupport(model) === false) throw new Error(`${model} 是纯文字模型，无法读取图片。请切换到 mimo-v2.5、deepseek-flash 等识图模型后发送。`);
  }
  function aideaPageVisionImageLabel(url, index) {
    const meta = aideaPageVisionMetadata.get(url);
    return meta ? `PDF 第 ${meta.page} 页 · ${meta.title}` : `Screenshot ${index + 1}`;
  }
  function aideaFindPageReader(owner) {
    let active = null;
    try { active = getActiveReaderForSelectedTab(); } catch {}
    const all = Zotero.Reader?._readers;
    const candidates = [...new Set([active, ...(Array.isArray(all) ? all : [])].filter(Boolean))];
    for (const reader of candidates) {
      try {
        const attachment = reader._item || Zotero.Items?.get?.(reader.itemID);
        if (!attachment || attachment.attachmentContentType !== "application/pdf") continue;
        const global = typeof isGlobalPortalItem === "function" && isGlobalPortalItem(owner);
        const sameItem = Number(attachment.id) === Number(owner?.id);
        const sameParent = Number(attachment.parentID) > 0 && (Number(attachment.parentID) === Number(owner?.id) || Number(attachment.parentID) === Number(owner?.parentID));
        if (global ? reader === active : sameItem || sameParent) return {reader, attachment};
      } catch {}
    }
    throw new Error("未找到这篇文献的 PDF 阅读器，请先打开左侧 PDF。");
  }
  function aideaUnwrapPdfObject(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return value;
    // Only used for the trusted, built-in PDF reader objects. Awaiting a
    // reader-realm Promise can restore Xrays on its resolved PDFPageProxy.
    try { value = globalThis.Components?.utils?.waiveXrays?.(value) || value; } catch {}
    try { value = value.wrappedJSObject || value; } catch {}
    return value;
  }
  async function aideaGetRenderablePage(document, number) {
    const pdf = aideaUnwrapPdfObject(document.pdf);
    const page = aideaUnwrapPdfObject(await pdf.getPage(number));
    if (typeof page?.getViewport === "function" && typeof page?.render === "function") return page;
    // The visible PDF.js page view may already hold a usable page proxy.
    const viewer = aideaUnwrapPdfObject(document.app?.pdfViewer);
    let view;
    try { view = aideaUnwrapPdfObject(viewer?.getPageView?.(number - 1) || viewer?._pages?.[number - 1]); } catch {}
    const visiblePage = aideaUnwrapPdfObject(view?.pdfPage);
    if (typeof visiblePage?.getViewport === "function" && typeof visiblePage?.render === "function") return visiblePage;
    throw new Error(`无法读取第 ${number} 页的图片接口，请确认已更新插件并重启 Zotero。`);
  }
  function aideaPdfRealmOptions(win, values) {
    // PDF.js runs inside the reader iframe. Allocate its options there so
    // Gecko does not deny access to a privileged plugin's plain JS object.
    let options;
    try { options = typeof win.Object === "function" ? new win.Object() : {}; }
    catch { options = {}; }
    for (const [key, value] of Object.entries(values)) options[key] = value;
    return options;
  }
  function aideaVisionWait(promise, win, milliseconds = 12000) {
    if (!promise) return Promise.resolve();
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = win.setTimeout(() => reject(new Error("PDF 阅读器仍在加载，请稍后重试。")), milliseconds);
    })]).finally(() => win.clearTimeout(timer));
  }
  async function aideaGetPageDocument(owner, panelWindow) {
    const {reader, attachment} = aideaFindPageReader(owner);
    await aideaVisionWait(reader._initPromise, panelWindow);
    const inspect = () => {
      const queue = [];
      const visited = new Set();
      const push = (window, depth = 0) => { if (window && !visited.has(window)) queue.push({window, depth}); };
      const inner = reader._internalReader || reader;
      for (const view of [inner._primaryView, reader._primaryView, inner._lastView, reader._lastView]) {
        try { push(view?._iframeWindow); } catch {}
      }
      try { push(reader._iframeWindow); } catch {}
      for (let index = 0; index < queue.length && index < 30; index++) {
        const {window: raw, depth} = queue[index];
        if (visited.has(raw)) continue;
        visited.add(raw);
        let win = raw;
        try { win = raw.wrappedJSObject || raw; } catch {}
        try {
          const app = win.PDFViewerApplication || raw.PDFViewerApplication;
          const pdf = aideaUnwrapPdfObject(app?.pdfDocument);
          if (pdf?.getPage && Number.isSafeInteger(pdf.numPages) && pdf.numPages > 0) {
            const rawPage = Number(app.pdfViewer?.currentPageNumber || app.page || 1);
            return {pdf, app, win, attachment, title: String(attachment.getField?.("title") || "当前 PDF").slice(0, 180), currentPage: Number.isSafeInteger(rawPage) ? rawPage : 1};
          }
        } catch {}
        if (depth < 3) {
          try { for (let i = 0; i < win.frames.length; i++) push(win.frames[i], depth + 1); } catch {}
          try { for (const frame of win.document.querySelectorAll("iframe")) push(frame.contentWindow, depth + 1); } catch {}
        }
      }
      return null;
    };
    // A ready primary/embedded view can be used immediately even if another
    // reader view has an unresolved initialization promise.
    for (let attempt = 0; attempt < 21; attempt++) {
      const found = inspect();
      if (found) return found;
      if (attempt < 20) await new Promise((resolve) => panelWindow.setTimeout(resolve, 100));
    }
    throw new Error("当前 PDF 页面尚未就绪，未加入图片；请稍后再扫描。");
  }
  async function aideaRenderVisionPages(document, pages, quality, signal, progress) {
    const result = [];
    const longEdge = quality === "clear" ? 2000 : 1200;
    for (const [index, number] of pages.entries()) {
      if (signal?.aborted) throw Object.assign(new Error("已取消选页识图。"), {name: "AbortError"});
      progress?.(index + 1, pages.length);
      const page = await aideaGetRenderablePage(document, number);
      if (signal?.aborted) throw Object.assign(new Error("已取消选页识图。"), {name: "AbortError"});
      const rotation = ((page.rotate || 0) + (document.app?.pdfViewer?.pagesRotation || 0)) % 360;
      const original = aideaUnwrapPdfObject(page.getViewport(aideaPdfRealmOptions(document.win, {scale: 1, rotation})));
      if (!(original.width > 0 && original.height > 0)) throw new Error(`第 ${number} 页尺寸无效。`);
      const viewport = aideaUnwrapPdfObject(page.getViewport(aideaPdfRealmOptions(document.win, {scale: (longEdge - 30) / Math.max(original.width, original.height), rotation})));
      const canvas = document.win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height) + 30;
      let task;
      const abort = () => task?.cancel?.();
      try {
        const context = canvas.getContext("2d", {alpha: false});
        if (!context) throw new Error("无法创建页面图片。");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (signal?.aborted) throw Object.assign(new Error("已取消选页识图。"), {name: "AbortError"});
        task = aideaUnwrapPdfObject(page.render(aideaPdfRealmOptions(document.win, {canvasContext: context, canvas, viewport, background: "rgb(255,255,255)"})));
        signal?.addEventListener("abort", abort, {once: true});
        const completion = aideaUnwrapPdfObject(task?.promise);
        if (typeof completion?.then !== "function") throw new Error("页面渲染未能启动，图片尚未加入。");
        await completion;
        if (signal?.aborted) throw Object.assign(new Error("已取消选页识图。"), {name: "AbortError"});
        context.fillStyle = "#ffffff";
        context.fillRect(0, canvas.height - 30, canvas.width, 30);
        context.fillStyle = "#333333";
        context.font = "18px sans-serif";
        context.fillText(`PDF page ${number} / ${document.pdf.numPages}`, 10, canvas.height - 9);
        const url = canvas.toDataURL("image/jpeg", quality === "clear" ? 0.9 : 0.8);
        if (!url.startsWith("data:image/jpeg;base64,") || url.length > 8 * 1024 * 1024) throw new Error(`第 ${number} 页图片过大，请改用省量模式。`);
        result.push({url, page: number, totalPages: document.pdf.numPages, title: document.title, attachmentId: document.attachment.id, quality});
      } finally {
        signal?.removeEventListener("abort", abort);
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return result;
  }
  var aideaImageMonitorCss = "\n#llm-scan-current-page { appearance: none; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 28px; width: 28px; height: 28px; min-width: 28px; min-height: 28px; padding: 0; border: 0; background: transparent; color: var(--fill-primary, #555); cursor: pointer; }\n#llm-scan-current-page::before, #llm-scan-current-page::after { display: none !important; content: none !important; width: 0 !important; height: 0 !important; background: none !important; mask-image: none !important; }\n#llm-scan-current-page svg { display: block; flex: 0 0 20px; width: 20px; height: 20px; pointer-events: none; }\n#llm-scan-current-page[aria-pressed=\"true\"] { color: var(--color-accent, #287d59); }\n#llm-scan-current-page[aria-busy=\"true\"] { opacity: .55; cursor: progress; }\n.llm-paper-context-chip.llm-paper-with-image-monitor { width: 100% !important; max-width: 100% !important; min-width: 0; flex: 1 1 100%; }\n.llm-paper-with-image-monitor > .llm-paper-context-chip-header { display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; min-width: 0; width: 100% !important; box-sizing: border-box; }\n.llm-paper-with-image-monitor .llm-paper-context-chip-label { flex: 1 1 0; min-width: 0; max-width: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }\n.llm-paper-with-image-monitor .llm-paper-context-clear { flex: 0 0 auto; }\n#llm-image-monitor { appearance: none; display: inline-block; flex: 0 0 auto; max-width: none; min-width: 0; min-height: 0; height: auto; max-height: none; width: auto; margin: 0 0 0 auto; padding: 1px 0 1px 6px; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--fill-secondary, #666); font: inherit; font-size: 11px; line-height: 1.5; white-space: nowrap; overflow: visible; text-overflow: clip; cursor: pointer; }\n#llm-image-monitor[data-phase=\"ready\"] { color: var(--color-accent, #287d59); font-weight: 600; }\n#llm-image-monitor[data-phase=\"scanning\"] { color: #986400; }\n#llm-image-monitor[data-phase=\"error\"] { color: #b83232; flex: 0 1 65%; max-width: 65%; white-space: normal; overflow-wrap: anywhere; text-align: left; }\n.llm-image-monitor-fallback { display: flex; justify-content: flex-end; width: 100%; min-width: 0; }\n.llm-image-monitor-fallback #llm-image-monitor { max-width: 100%; }\n.llm-image-monitor-fallback[hidden] { display: none !important; }\n.llm-quick-vision-host .llm-image-preview { display: none !important; }\n";
  function aideaPlaceImageMonitor(body) {
    const monitor = body.__aideaImageMonitor;
    if (!monitor) return;
    const header = body.querySelector(".llm-base-pdf-chip .llm-paper-context-chip-header")
      || body.querySelector(".llm-paper-context-current .llm-paper-context-chip-header")
      || body.querySelector("#llm-paper-context-list .llm-paper-context-chip-header");
    if (header) {
      header.parentElement.classList.add("llm-paper-with-image-monitor");
      if (monitor.state.parentElement !== header) header.appendChild(monitor.state);
      monitor.fallback.hidden = true;
    } else {
      monitor.fallback.hidden = false;
      if (monitor.state.parentElement !== monitor.fallback) monitor.fallback.appendChild(monitor.state);
    }
  }
  function aideaRefreshPageVision(body, images, model) {
    const monitor = body.__aideaImageMonitor;
    if (!monitor) return;
    aideaPlaceImageMonitor(body);
    const rows = aideaPageVisionEntries(images);
    const pages = rows.map((entry) => entry.page);
    let text, title, phase;
    if (monitor.busy) {
      phase = "scanning";
      text = `图片监测：正在扫描${monitor.page ? `第${monitor.page}页` : ""}…`;
      title = "正在本机生成当前页图片；点击此处可取消。";
    } else if (monitor.error) {
      phase = "error";
      text = `图片监测：扫描失败（${monitor.error}）`;
      title = monitor.error + (pages.length ? ` 仍保留第${pages.join("、")}页图片。` : " 当前没有新图片加入。") + "点击扫描图标重试。";
    } else if (images?.length) {
      phase = "ready";
      text = pages.length ? `图片监测：第${pages.join("、")}页已加入 ✓` : "图片监测：图片已加入 ✓";
      title = (pages.length ? `已加入 PDF 第${pages.join("、")}页的真实图片。` : "已加入图片。") + "点击此处移除；点击发送后提交给模型。";
    } else {
      phase = "empty";
      text = "图片监测：未监测图片";
      title = "当前未附图片。点击扫把旁的扫描图标，加入左侧 PDF 当前页。";
    }
    monitor.state.textContent = text;
    monitor.state.title = title;
    monitor.state.dataset.phase = phase;
    monitor.state.setAttribute("aria-label", text);
    monitor.scan.setAttribute("aria-pressed", images?.length ? "true" : "false");
    monitor.scan.title = monitor.busy ? "正在扫描当前页…" : "扫描左侧当前 PDF 页并加入提问";
    const preview = body.querySelector("#llm-image-preview");
    if (preview) preview.style.display = "none";
  }
  function aideaMountPageVision(body, inputBox, deps) {
    const clear = body.querySelector("#llm-clear");
    if (!clear?.parentElement || !inputBox?.parentElement || body.__aideaImageMonitor) return;
    const doc = body.ownerDocument;
    const win = doc.defaultView;
    // Keep these controls styled even when Zotero reuses an older linked CSS
    // resource after a hot plugin update.
    let style = doc.getElementById("aidea-current-page-monitor-style");
    if (!style) {
      style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
      style.id = "aidea-current-page-monitor-style";
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = aideaImageMonitorCss;
    const scan = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
    scan.id = "llm-scan-current-page";
    scan.className = "llm-btn-icon llm-scan-current-page llm-discussion-only";
    scan.type = "button";
    scan.setAttribute("aria-label", "扫描当前页并加入图片");
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M7 8h10M7 12h10M7 16h7");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    scan.appendChild(svg);
    clear.parentElement.insertBefore(scan, clear.nextSibling);
    const state = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
    state.id = "llm-image-monitor";
    state.type = "button";
    state.setAttribute("aria-live", "polite");
    const fallback = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    fallback.className = "llm-image-monitor-fallback";
    const contexts = body.querySelector("#llm-context-previews");
    if (contexts) contexts.appendChild(fallback);
    else inputBox.parentElement.insertBefore(fallback, inputBox);
    const monitor = body.__aideaImageMonitor = {state, fallback, scan, busy: false, error: "", page: null};
    body.classList.add("llm-quick-vision-host");
    const Observer = win.MutationObserver;
    if (Observer && contexts) {
      const observer = new Observer(() => aideaPlaceImageMonitor(body));
      observer.observe(contexts, {childList: true, subtree: true});
      monitor.observer = observer;
    }
    let controller = null;
    clear.addEventListener("click", () => {monitor.error = ""; controller?.abort();}, {capture: true});
    state.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      if (controller) {controller.abort(); return;}
      const owner = deps.getItem();
      if (!owner) return;
      monitor.error = "";
      for (const url of deps.getImages(owner.id)) aideaPageVisionMetadata.delete(url);
      deps.setImages(owner.id, []);
      deps.refresh();
      aideaRefreshPageVision(body, [], deps.getModel());
    });
    scan.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      if (controller) return;
      const owner = deps.getItem();
      if (!owner) return;
      const reportError = (message) => {
        monitor.error = message;
        aideaRefreshPageVision(body, deps.getImages(owner.id), deps.getModel());
        deps.setMessage?.(message, "error");
      };
      if (deps.isGenerating()) {reportError("请等待当前回答完成后再扫描"); return;}
      if (aideaVisionModelSupport(deps.getModel()) === false) {reportError("当前模型不支持图片，请切换识图模型"); return;}
      const conversation = deps.getConversationKey?.();
      let activeController;
      try {
        const Ctor = getAbortController(body);
        controller = activeController = new Ctor();
        monitor.busy = true; monitor.error = ""; monitor.page = null;
        scan.disabled = true; scan.setAttribute("aria-busy", "true");
        deps.setRendering(true);
        aideaRefreshPageVision(body, deps.getImages(owner.id), deps.getModel());
        const document = await aideaGetPageDocument(owner, win);
        const page = Math.max(1, Math.min(document.pdf.numPages, document.currentPage));
        monitor.page = page;
        aideaRefreshPageVision(body, deps.getImages(owner.id), deps.getModel());
        const rendered = await aideaRenderVisionPages(document, [page], "clear", activeController.signal);
        if (activeController.signal.aborted || deps.getItem()?.id !== owner.id || deps.getConversationKey?.() !== conversation || !scan.isConnected) throw new Error("文献或对话已切换，未加入图片");
        for (const url of deps.getImages(owner.id)) aideaPageVisionMetadata.delete(url);
        for (const entry of rendered) {
          const {url, ...metadata} = entry;
          aideaPageVisionMetadata.set(url, metadata);
        }
        deps.setImages(owner.id, rendered.map((entry) => entry.url));
        deps.refresh();
        if (!deps.getImages(owner.id).includes(rendered[0].url)) throw new Error("页面已生成但未加入输入框，请重试");
        deps.setMessage?.(`第${page}页图片已加入，点击发送即可`, "ready");
      } catch (error) {
        if (activeController?.signal.aborted) {
          monitor.error = "";
          deps.setMessage?.("已取消扫描", "ready");
        } else reportError(String(error.message || error));
      } finally {
        controller = null; monitor.busy = false;
        scan.disabled = false; scan.removeAttribute("aria-busy");
        deps.setRendering(false);
        aideaRefreshPageVision(body, deps.getImages(deps.getItem()?.id), deps.getModel());
      }
    });
    aideaRefreshPageVision(body, deps.getImages(deps.getItem()?.id), deps.getModel());
  }
