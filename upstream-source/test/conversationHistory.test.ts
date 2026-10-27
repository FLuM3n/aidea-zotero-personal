import { assert } from "chai";
import { resolveItemContextInfo } from "../src/modules/contextPanel/setupHandlers/controllers/conversationHistoryController";

const originalZotero = (globalThis as Record<string, unknown>).Zotero;

describe("conversationHistoryController", function () {
  afterEach(function () {
    (globalThis as Record<string, unknown>).Zotero = originalZotero;
  });

  describe("resolveItemContextInfo", function () {
    it("returns empty strings when itemId is invalid", function () {
      const res = resolveItemContextInfo(0);
      assert.deepStrictEqual(res, { paperTitle: "", collectionPath: "" });

      const res2 = resolveItemContextInfo(-10);
      assert.deepStrictEqual(res2, { paperTitle: "", collectionPath: "" });
    });

    it("returns empty strings when Zotero is not available or item missing", function () {
      (globalThis as Record<string, unknown>).Zotero = {
        Items: { get: () => null },
      };
      const res = resolveItemContextInfo(123);
      assert.deepStrictEqual(res, { paperTitle: "", collectionPath: "" });
    });

    it("resolves paperTitle and single collection path for regular item", function () {
      const mockCollections: Record<number, { name: string; parentID?: number }> = {
        1: { name: "Computer Science" },
        2: { name: "Machine Learning", parentID: 1 },
      };

      const mockItem = {
        id: 100,
        isRegularItem: () => true,
        getField: (field: string) =>
          field === "title" ? "Attention Is All You Need" : "",
        getCollections: () => [2],
      };

      (globalThis as Record<string, unknown>).Zotero = {
        Items: { get: (id: number) => (id === 100 ? mockItem : null) },
        Collections: {
          get: (id: number) => mockCollections[id] || null,
        },
      };

      const res = resolveItemContextInfo(100);
      assert.strictEqual(res.paperTitle, "Attention Is All You Need");
      assert.strictEqual(res.collectionPath, "Computer Science / Machine Learning");
    });

    it("resolves parent regular item when given an attachment item", function () {
      const mockCollections: Record<number, { name: string; parentID?: number }> = {
        10: { name: "Biomedicine" },
      };

      const mockParent = {
        id: 200,
        isRegularItem: () => true,
        getField: (field: string) =>
          field === "title" ? "CRISPR-Cas9 Gene Editing" : "",
        getCollections: () => [10],
      };

      const mockAttachment = {
        id: 201,
        isRegularItem: () => false,
        parentItemID: 200,
        getField: () => "paper.pdf",
      };

      (globalThis as Record<string, unknown>).Zotero = {
        Items: {
          get: (id: number) => {
            if (id === 201) return mockAttachment;
            if (id === 200) return mockParent;
            return null;
          },
        },
        Collections: {
          get: (id: number) => mockCollections[id] || null,
        },
      };

      const res = resolveItemContextInfo(201);
      assert.strictEqual(res.paperTitle, "CRISPR-Cas9 Gene Editing");
      assert.strictEqual(res.collectionPath, "Biomedicine");
    });
  });
});
