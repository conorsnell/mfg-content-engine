export interface DraftRecord {
  id: string;
  clientId: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  status: "in-progress" | "complete";
  contentType: string;
  keyword: string;
  articleTitle: string;
  research: string;
  citations: string[];
  brief: string;
  draft: string;
  repurposed: {
    linkedin?: string;
    email?: string;
  };
}

const storageKey = (clientId: string) => `mce_drafts_${clientId}`;

export function getDrafts(clientId: string): DraftRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDraft(draft: DraftRecord): void {
  if (typeof window === "undefined") return;
  const existing = getDrafts(draft.clientId);
  const idx = existing.findIndex((d) => d.id === draft.id);
  const updated: DraftRecord = { ...draft, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    existing[idx] = updated;
  } else {
    existing.unshift(updated);
  }
  try {
    localStorage.setItem(storageKey(draft.clientId), JSON.stringify(existing));
  } catch {
    // localStorage quota exceeded — prune oldest and retry
    existing.splice(10);
    localStorage.setItem(storageKey(draft.clientId), JSON.stringify(existing));
  }
}

export function deleteDraft(clientId: string, draftId: string): void {
  if (typeof window === "undefined") return;
  const filtered = getDrafts(clientId).filter((d) => d.id !== draftId);
  localStorage.setItem(storageKey(clientId), JSON.stringify(filtered));
}

export function createDraftRecord(
  partial: Partial<DraftRecord> & { clientId: string }
): DraftRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "in-progress",
    contentType: "blog",
    keyword: "",
    articleTitle: "",
    research: "",
    citations: [],
    brief: "",
    draft: "",
    repurposed: {},
    ...partial,
  };
}

export function formatDraftDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
