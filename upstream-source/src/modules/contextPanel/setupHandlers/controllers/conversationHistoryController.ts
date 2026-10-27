import { sanitizeText } from "../../textUtils";

export const GLOBAL_HISTORY_UNDO_WINDOW_MS = 6_000;
export const GLOBAL_HISTORY_TITLE_MAX_LENGTH = 64;
export const HISTORY_ROW_TITLE_MAX_LENGTH = 42;

export type ConversationHistoryEntry = {
  kind: "paper" | "global";
  conversationKey: number;
  title: string;
  timestampText: string;
  deletable: boolean;
  isDraft: boolean;
  isPendingDelete: boolean;
  lastActivityAt: number;
  isPinned: boolean;
  parentItemId?: number;
  paperTitle?: string;
  collectionPath?: string;
};

/**
 * Resolve display information (article title and folder/collection path)
 * for a given Zotero item ID.
 */
export function resolveItemContextInfo(itemId: number): {
  paperTitle: string;
  collectionPath: string;
} {
  try {
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return { paperTitle: "", collectionPath: "" };
    }
    const zoteroGlobal =
      typeof Zotero !== "undefined"
        ? Zotero
        : (globalThis as any)?.Zotero;
    if (!zoteroGlobal?.Items?.get) {
      return { paperTitle: "", collectionPath: "" };
    }
    const item = zoteroGlobal.Items.get(itemId);
    if (!item) {
      return { paperTitle: "", collectionPath: "" };
    }

    let regularItem = item;
    if (typeof item.isRegularItem === "function" && !item.isRegularItem()) {
      if (item.parentItemID && zoteroGlobal.Items.get) {
        regularItem = zoteroGlobal.Items.get(item.parentItemID) || item;
      }
    }

    let paperTitle = "";
    if (typeof regularItem.getField === "function") {
      paperTitle = String(regularItem.getField("title") || "").trim();
    }
    if (!paperTitle && typeof regularItem.getDisplayTitle === "function") {
      paperTitle = String(regularItem.getDisplayTitle() || "").trim();
    }

    let collectionPath = "";
    if (
      typeof regularItem.getCollections === "function" &&
      zoteroGlobal.Collections?.get
    ) {
      const colIds = regularItem.getCollections();
      if (Array.isArray(colIds) && colIds.length > 0) {
        const paths: string[] = [];
        for (const colId of colIds) {
          const names: string[] = [];
          let current = zoteroGlobal.Collections.get(colId);
          while (current) {
            if (current.name) names.unshift(String(current.name).trim());
            if (current.parentID) {
              current = zoteroGlobal.Collections.get(current.parentID);
            } else {
              break;
            }
          }
          if (names.length > 0) {
            paths.push(names.join(" / "));
          }
        }
        collectionPath = paths.join(", ");
      }
    }

    return { paperTitle, collectionPath };
  } catch (_err) {
    return { paperTitle: "", collectionPath: "" };
  }
}

export type HistorySwitchTarget =
  | { kind: "paper"; conversationKey: number }
  | { kind: "global"; conversationKey: number }
  | null;

export type PendingHistoryDeletion = {
  conversationKey: number;
  libraryID: number;
  kind: "paper" | "global";
  title: string;
  wasActive: boolean;
  fallbackTarget: HistorySwitchTarget;
  expiresAt: number;
  timeoutId: number | null;
};

export function formatGlobalHistoryTimestamp(timestamp: number): string {
  try {
    const parsed = Number(timestamp);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return new Intl.DateTimeFormat(undefined, {
      year: "2-digit",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(parsed));
  } catch (_err) {
    return "";
  }
}

export function normalizeConversationTitleSeed(
  raw: unknown,
  maxLength = GLOBAL_HISTORY_TITLE_MAX_LENGTH,
): string {
  const normalized = sanitizeText(String(raw || ""))
    // eslint-disable-next-line no-control-regex -- strips unsafe history characters
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (!Number.isFinite(maxLength) || maxLength <= 3) {
    return normalized;
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

export function normalizeHistoryTitle(raw: unknown): string {
  return normalizeConversationTitleSeed(raw, GLOBAL_HISTORY_TITLE_MAX_LENGTH);
}

export function formatHistoryRowDisplayTitle(
  title: string,
  fallback = "Untitled chat",
): string {
  return (
    normalizeConversationTitleSeed(title, HISTORY_ROW_TITLE_MAX_LENGTH) ||
    fallback
  );
}
