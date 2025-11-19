// supabase/functions/tick/index.ts
// Disable TS checking in editors that don't understand Deno.
// This does not affect runtime on Supabase.
// @ts-nocheck

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";

type Agent = {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  room_id: string | null; // uuid
  is_active: boolean | null;
  persona: any | null; // jsonb, e.g. { traits: ["builder","organiser"] }
};

type Room = {
  id: string;
  name: string | null;
  x: number | null;
  y: number | null;
  theme: string | null;
};

type MessageSummary = {
  id: number;
  ts: string;
  from_agent: string;
  room_id: string | null;
  content: string | null;
};

const supabaseUrl =
  Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing PROJECT_URL / SERVICE_ROLE_KEY env vars");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

async function getAgents(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, provider, model, room_id, is_active, persona")
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching agents:", error);
    throw error;
  }

  return (data ?? []) as Agent[];
}

async function getRooms(): Promise<Map<string, Room>> {
  const roomMap = new Map<string, Room>();

  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, x, y, theme");

  if (error) {
    console.error("Error fetching rooms:", error);
    return roomMap;
  }

  for (const row of (data ?? []) as Room[]) {
    roomMap.set(row.id, row);
  }

  return roomMap;
}

/**
 * Fetch recent messages and group them by agent.
 * We fetch e.g. 200 most recent and keep up to `limitPerAgent` per agent.
 */
async function getRecentMessagesByAgent(
  limitPerAgent = 10
): Promise<Map<string, MessageSummary[]>> {
  const historyByAgent = new Map<string, MessageSummary[]>();

  const { data, error } = await supabase
    .from("messages")
    .select("id, ts, from_agent, room_id, content")
    .order("ts", { ascending: false })
    .limit(200); // plenty for 6 agents × 10 each

  if (error) {
    console.error("Error fetching recent messages:", error);
    return historyByAgent;
  }

  const rows = (data ?? []) as MessageSummary[];

  for (const row of rows) {
    const key = row.from_agent;
    if (!key) continue;

    const arr = historyByAgent.get(key) ?? [];
    if (arr.length >= limitPerAgent) continue;

    arr.push(row);
    historyByAgent.set(key, arr);
  }

  return historyByAgent;
}

async function generateMessage(
  agent: Agent,
  history: MessageSummary[],
  room: Room | undefined
): Promise<string | null> {
  const cosyLines = [
    "makes a cup of tea and watches the rain."
  ];

  function randomCosyLine() {
    const line = cosyLines[Math.floor(Math.random() * cosyLines.length)];
    return `${agent.name} ${line}`;
  }

  // Fallback if no OpenAI key set at all
  if (!openai) {
    return randomCosyLine();
  }

  // Build personality snippet from persona.traits
  const traits =
    agent.persona &&
    Array.isArray(agent.persona.traits)
      ? (agent.persona.traits as string[])
      : [];

  const traitsText = traits.length
    ? `Your personality traits include: ${traits.join(", ")}.`
    : "";

  // Room context
  const roomName = room?.name || "your small apartment";
  const roomTheme = room?.theme
    ? `The room theme is "${room.theme}".`
    : "";

  // Recent history summary for this agent
  const recentLines = history
    .map((m) => m.content?.trim())
    .filter((c): c is string => !!c)
    .slice(0, 10);

  const recentHistoryText =
    recentLines.length > 0
      ? recentLines.map((c) => `- ${c}`).join("\n")
      : "(no recent actions recorded yet)";

  const prompt = `
You are a cosy, low-key villager called ${agent.name} in a tiny 2x3 apartment block called Cozy Village.
You belong to provider "${agent.provider}".
You are currently in a room called "${roomName}". ${roomTheme}
${traitsText}

Here are the last few things you have been doing recently (newest first):

${recentHistoryText}

Now decide what to do this tick:

- Most of the time you will choose to describe a tiny new action.
- Occasionally, if it feels right, you can choose to stay quiet and not add a new log entry.

If you choose to stay quiet, reply with exactly the single word:
QUIET

If you choose to describe a new action, reply with ONE new short, present-tense line (max ~80 characters)
describing what you are doing right now in this room.

Keep it gentle, slice-of-life, and grounded.
Avoid repeating the exact same actions or wording as above.
No emojis, no dialogue. Always write in third person perspective.
Reply with either exactly "QUIET" or the one line. Nothing else.
`;

  async function callOnce(): Promise<"QUIET" | string | null> {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You decide whether to stay quiet or describe one tiny action. Reply with either exactly QUIET or a single short line. No extra commentary."
        },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    if (!content) return null;

    if (content.toUpperCase() === "QUIET") {
      return "QUIET";
    }

    return content;
  }

  try {
    const first = await callOnce();

    // If the agent chose QUIET, we represent this as null
    if (first === "QUIET") {
      return null;
    }

    // If we got a normal line back, use it
    if (first) {
      return first;
    }

    // Empty content → cosy fallback
    return randomCosyLine();
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    const message = err?.message ?? err?.toString?.() ?? "unknown error";

    console.error("OpenAI error on first try:", status, message);

    if (status === 429) {
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + jitter)
      );

      try {
        const second = await callOnce();

        if (second === "QUIET") {
          return null;
        }

        if (second) {
          return second;
        }

        console.error("OpenAI 429 retry returned empty content");
      } catch (err2: any) {
        const status2 = err2?.status ?? err2?.response?.status;
        const message2 =
          err2?.message ?? err2?.toString?.() ?? "unknown error";
        console.error(
          "OpenAI error on retry after 429:",
          status2,
          message2
        );
      }
    }

    // Any failure path → cosy fallback
    return randomCosyLine();
  }
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Optional simple auth with a shared secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const header = req.headers.get("x-cron-secret");
      if (header !== cronSecret) {
        return new Response("Unauthorised", { status: 401 });
      }
    }

    const agents = await getAgents();
    const historyByAgent = await getRecentMessagesByAgent(10);
    const roomsMap = await getRooms();

    let inserted = 0;
    let quietCount = 0;

    for (const agent of agents) {
      if (!agent.room_id) continue;

      const history = historyByAgent.get(agent.id) ?? [];
      const room = roomsMap.get(agent.room_id) as Room | undefined;

      const content = await generateMessage(agent, history, room);

      // null means the agent chose to be quiet this tick
      if (content === null) {
        quietCount += 1;
        continue;
      }

      const { error } = await supabase.from("messages").insert({
        from_agent: agent.id,
        room_id: agent.room_id,
        content
        // ts defaults to now()
        // mood_tag left null for now
      });

      if (error) {
        console.error("Error inserting message:", error);
        continue;
      }

      inserted += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, inserted, quiet: quietCount }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Tick function error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
