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

  // Enhanced persona extraction
  const persona = agent.persona || {};
  const traits = Array.isArray(persona.traits) ? persona.traits : [];
  const communicationStyle = persona.communicationStyle || "natural";
  const interests = Array.isArray(persona.interests) ? persona.interests : [];
  const quirks = Array.isArray(persona.quirks) ? persona.quirks : [];
  const speechPatterns = Array.isArray(persona.speechPatterns) ? persona.speechPatterns : [];

  // Build richer personality description
  let personalityPrompt = "";
  
  if (traits.length > 0) {
    personalityPrompt += `Your core traits: ${traits.join(", ")}.\n`;
  }
  
  if (communicationStyle && communicationStyle !== "natural") {
    personalityPrompt += `You communicate in a ${communicationStyle} manner.\n`;
  }
  
  if (interests.length > 0) {
    personalityPrompt += `You care deeply about: ${interests.join(", ")}.\n`;
  }
  
  if (quirks.length > 0) {
    personalityPrompt += `Your quirks: ${quirks.map((q: string) => `- ${q}`).join("\n")}\n`;
  }

  if (speechPatterns.length > 0) {
    personalityPrompt += `Speech style: ${speechPatterns.join(", ")}.\n`;
  }

  // Room context
  const roomName = room?.name || "your small apartment";

  // Recent history summary for this agent
  const recentLines = history
    .map((m) => m.content?.trim())
    .filter((c): c is string => !!c)
    .slice(0, 10);

  const recentHistoryText =
    recentLines.length > 0
      ? recentLines.map((c) => `- ${c}`).join("\n")
      : "(no recent actions recorded yet)";

  // Add variety instructions based on persona
  let varietyInstructions = "Avoid repeating the exact same actions or wording as above.";
  
  if (interests.length > 0 && Math.random() > 0.7) {
    varietyInstructions += ` Occasionally relate your actions to your interests: ${interests.join(", ")}.`;
  }
  
  if (quirks && quirks.includes("asks_questions") && Math.random() > 0.8) {
    varietyInstructions += " Feel free to briefly wonder about something.";
  }

  const prompt = `
You are a cosy, low-key villager called ${agent.name} in a tiny 2x3 apartment block called Cozy Village.
You belong to provider "${agent.provider}".
You are currently in a room called "${roomName}".
${personalityPrompt}

Here are the last few things you have been doing recently (newest first):

${recentHistoryText}

Now decide what to do this tick:

- Choose to describe a tiny new action.

Reply with ONE new short, present-tense line (max ~80 characters)
describing what you are doing right now in this room.

Keep it gentle, slice-of-life, and grounded.
${varietyInstructions}
No emojis, no dialogue. Always write in third person perspective.
Reply with the one line. Nothing else.
`;

  async function callOnce(): Promise<string | null> {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You are ${agent.name} with these traits: ${traits.join(", ") || "versatile"}. Generate one unique, grounded action. Be varied and avoid repetition.`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.8 + (Math.random() * 0.4)
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    if (!content) return null;

    return content;
  }

  try {
    const first = await callOnce();

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

    // Track which agents moved this tick
    const movedAgents = new Set<string>();

    // Phase 1: Move agents first, before generating messages
    // Build a list of room ids to pick from
    const roomIds = Array.from(roomsMap.keys());
    for (const agent of agents) {
      try {
        // 15% chance to move this tick
        if (Math.random() > 0.15) continue;

        const current = agent.room_id;
        // pick a different room at random
        const candidates = roomIds.filter((r) => r !== current);
        if (candidates.length === 0) continue;
        const newRoom = candidates[Math.floor(Math.random() * candidates.length)];

        const { error: uErr } = await supabase
          .from('agents')
          .update({ room_id: newRoom })
          .eq('id', agent.id);

        if (uErr) {
          console.error('Error moving agent', agent.id, uErr);
          continue;
        }

        // Mark this agent as moved
        movedAgents.add(agent.id);

        // Insert a movement message
        const newRoomName = roomsMap.get(newRoom)?.name || `room ${newRoom.substring(0, 8)}`;
        const { error: msgErr } = await supabase.from("messages").insert({
          from_agent: agent.id,
          room_id: newRoom,
          content: `${agent.name} moves to ${newRoomName}`
          // ts defaults to now()
          // mood_tag left null for now
        });

        if (msgErr) {
          console.error('Error inserting movement message:', msgErr);
          continue;
        }

        inserted += 1;
      } catch (moveErr) {
        console.error('Error in moving agents:', moveErr);
      }
    }

    // Phase 2: Generate messages for agents that didn't move
    // Refresh agents to get updated room_id values after moves
    const refreshedAgents = await getAgents();
    for (const agent of refreshedAgents) {
      if (!agent.room_id) continue;

      // Skip agents that moved this tick
      if (movedAgents.has(agent.id)) continue;

      const history = historyByAgent.get(agent.id) ?? [];
      const room = roomsMap.get(agent.room_id) as Room | undefined;

      const content = await generateMessage(agent, history, room);

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
      JSON.stringify({ ok: true, inserted }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Tick function error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
