// supabase/functions/_shared/memory.ts
// Shared agent memory utilities for cross-channel coherence.

export interface AgentMemory {
  alone_ticks?: number;
  journal?: Array<{ t: string; text: string }>;
  facts?: string[];
}

const MAX_JOURNAL = 20;
const MAX_FACTS = 15;

/** Render journal + facts into a prompt-ready text block. */
export function formatMemoryForPrompt(memory: AgentMemory | null): string {
  if (!memory) return "";

  const parts: string[] = [];

  if (memory.facts && memory.facts.length > 0) {
    parts.push(
      "Things you know (your memories — reference these naturally, don't repeat them robotically):\n" +
        memory.facts.map((f) => `- ${f}`).join("\n")
    );
  }

  if (memory.journal && memory.journal.length > 0) {
    const recent = memory.journal.slice(-10);
    parts.push(
      "Recent moments from your day:\n" +
        recent.map((j) => `- ${j.text}`).join("\n")
    );
  }

  return parts.length > 0 ? parts.join("\n\n") + "\n" : "";
}

/** Append a journal entry with ISO timestamp. Caps at MAX_JOURNAL (drops oldest). */
export function appendJournal(
  memory: AgentMemory | null,
  entry: string
): AgentMemory {
  const m = memory ? { ...memory } : {};
  const journal = [...(m.journal ?? []), { t: new Date().toISOString(), text: entry }];
  if (journal.length > MAX_JOURNAL) {
    journal.splice(0, journal.length - MAX_JOURNAL);
  }
  return { ...m, journal };
}

/** Add a fact. Caps at MAX_FACTS (drops oldest). Skips near-duplicates. */
export function addFact(
  memory: AgentMemory | null,
  fact: string
): AgentMemory {
  const m = memory ? { ...memory } : {};
  const facts = [...(m.facts ?? [])];

  // Skip if a very similar fact already exists
  const lower = fact.toLowerCase();
  const isDuplicate = facts.some(
    (f) => f.toLowerCase() === lower || lower.includes(f.toLowerCase()) || f.toLowerCase().includes(lower)
  );
  if (isDuplicate) {
    // Replace the older similar fact with the newer one
    const idx = facts.findIndex(
      (f) => f.toLowerCase() === lower || lower.includes(f.toLowerCase()) || f.toLowerCase().includes(lower)
    );
    if (idx !== -1) facts[idx] = fact;
    return { ...m, facts };
  }

  facts.push(fact);
  if (facts.length > MAX_FACTS) {
    facts.splice(0, facts.length - MAX_FACTS);
  }
  return { ...m, facts };
}
