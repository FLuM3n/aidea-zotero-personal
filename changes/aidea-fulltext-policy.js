  function aideaFullTextCost(context, title) {
    if (!context?.chunks?.length) return 0;
    // Includes escaped reference text, citation markers and a safety allowance.
    return context.chunks.reduce((sum, text) => sum + evidenceTokens(text) + 48,
      evidenceTokens(`Title: ${title}\nExtraction: ${context.completeness || "unavailable"}; supplied: full\n\n`) + 512);
  }
  function aideaFullTextBudgetError(required, available) {
    return new Error(`全文文字约需 ${Math.ceil(required).toLocaleString()} token，本轮材料容量约为 ${Math.max(0, Math.floor(available)).toLocaleString()} token。请在模型高级设置中核对上下文上限，或减少同时引用的文献、附件；本轮未发送，不会自动改成摘录。`);
  }
  async function aideaRequiredDocumentBudget(targets) {
    const budgets = [];
    for (const target of targets) {
      const document = resolveReaderDocument(target.item);
      if (document?.kind !== "pdf") { budgets.push(256); continue; }
      const context = await ensureDocumentContext(document);
      if (!context?.chunks?.length) throw new Error("这篇 PDF 尚未提取到文字，无法提供全文。请确认文件可读取；扫描版 PDF 需先进行文字识别。本轮未发送。");
      const title = context.title || String(document.item.getField("title") || "Document");
      budgets.push(aideaFullTextCost(context, title) + 8);
    }
    return budgets;
  }
