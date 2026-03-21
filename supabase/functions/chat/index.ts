// supabase/functions/chat/index.ts
// Autonomous agent group chat — picks one agent to speak, allows reply chains.

// @ts-expect-error Deno module resolution
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error Deno module resolution
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error Deno module resolution
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Persona {
  traits?: string[];
  interests?: string[];
  quirks?: string[];
  speechPatterns?: string[];
  communicationStyle?: string;
}

interface AgentMemory {
  alone_ticks?: number;
}

interface Agent {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  room_id: string | null;
  is_active: boolean | null;
  persona: Persona | null;
  mood: number;
  energy: number;
  memory: AgentMemory | null;
}

interface Room {
  id: string;
  name: string | null;
  x: number | null;
  y: number | null;
  theme: string | null;
}

interface MessageSummary {
  id: number;
  ts: string;
  from_agent: string | null;
  room_id: string | null;
  content: string | null;
}

interface Relationship {
  a: string;
  b: string;
  affinity: number;
}

/* ------------------------------------------------------------------ */
/*  Environment & clients                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Data fetchers                                                      */
/* ------------------------------------------------------------------ */

async function getAgents(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, provider, model, room_id, is_active, persona, mood, energy, memory")
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

async function getRecentGroupMessages(
  limit = 30
): Promise<MessageSummary[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, ts, from_agent, room_id, content")
    .eq("channel", "group")
    .order("ts", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching recent group messages:", error);
    return [];
  }

  return ((data ?? []) as MessageSummary[]).reverse();
}

async function getRelationships(): Promise<Map<string, Map<string, number>>> {
  const relMap = new Map<string, Map<string, number>>();

  const { data, error } = await supabase
    .from("relationships")
    .select("a, b, affinity");

  if (error) {
    console.error("Error fetching relationships:", error);
    return relMap;
  }

  for (const rel of (data ?? []) as Relationship[]) {
    if (!relMap.has(rel.a)) relMap.set(rel.a, new Map());
    if (!relMap.has(rel.b)) relMap.set(rel.b, new Map());
    relMap.get(rel.a)!.set(rel.b, rel.affinity);
    relMap.get(rel.b)!.set(rel.a, rel.affinity);
  }

  return relMap;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function affinityDescription(affinity: number): string {
  if (affinity >= 5) return "whom you like a lot";
  if (affinity >= 2) return "whom you get along with";
  if (affinity >= -2) return "whom you feel neutral toward";
  if (affinity >= -5) return "whom you don't get along with";
  return "whom you really dislike";
}

function moodTagFromDelta(delta: number): string {
  if (delta > 0) return "happy";
  if (delta < 0) return "sad";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/*  Message generation                                                 */
/* ------------------------------------------------------------------ */

interface GenerateResult {
  message: string;
  mood_delta: number;
}

async function generateMessage(
  agent: Agent,
  groupHistory: MessageSummary[],
  nameMap: Map<string, string>,
  room: Room | undefined,
  extraContext: string = ""
): Promise<GenerateResult> {
  const cosyLines = ["makes a cup of tea and watches the rain."];

  function randomCosyLine(): GenerateResult {
    const line = cosyLines[Math.floor(Math.random() * cosyLines.length)];
    return { message: `${agent.name} ${line}`, mood_delta: 0 };
  }

  if (!openai) return randomCosyLine();

  const persona = agent.persona ?? {};
  const traits = persona.traits ?? [];
  const communicationStyle = persona.communicationStyle ?? "natural";
  const interests = persona.interests ?? [];
  const quirks = persona.quirks ?? [];
  const speechPatterns = persona.speechPatterns ?? [];

  let personalityPrompt = "";

  if (traits.length > 0) {
    personalityPrompt += `Your core traits: ${traits.join(", ")}.\n`;
  }

  if (communicationStyle !== "natural") {
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

  const roomName = room?.name ?? "your small apartment";

  const chatLines = groupHistory
    .map((m) => {
      const sender = m.from_agent ? (nameMap.get(m.from_agent) ?? "Someone") : "Visitor";
      return `- ${sender}: ${m.content?.trim() ?? "..."}`;
    })
    .filter((c) => c.length > 5);

  const groupChatText =
    chatLines.length > 0
      ? chatLines.join("\n")
      : "(the group chat is quiet right now)";

  let varietyInstructions = "Avoid repeating what someone else just said or doing the exact same actions.";

  if (interests.length > 0 && Math.random() > 0.7) {
    varietyInstructions += ` Occasionally relate your actions to your interests: ${interests.join(", ")}.`;
  }

  if (quirks.includes("asks_questions") && Math.random() > 0.8) {
    varietyInstructions += " Feel free to briefly wonder about something.";
  }

  const prompt = `
You are ${agent.name}, a villager in Cozy Village — a tiny 2x3 apartment block.
You are currently in "${roomName}". Mood: ${agent.mood}/5. Energy: ${agent.energy}/5.
${personalityPrompt}
${extraContext}

Here is the recent group chat (oldest first):

${groupChatText}

Write your next message to the group chat. This is a CHAT — you are TALKING to the other villagers.

IMPORTANT RULES:
- Write DIALOGUE, not narration. Say things out loud to the group. Talk, ask questions, reply, joke, share thoughts.
- GOOD examples: "Hey Pip, what are you reading?", "Has anyone been to the garden today? The flowers smell amazing.", "I just made tea, anyone want some?"
- BAD examples (do NOT write like this): "I quietly pull out my book", "I hum a tune while preparing snacks", "I observe Odo's movements"
- If someone asked a question or said something interesting, RESPOND to them directly.
- Use the other villagers' names when talking to them.
- Keep it short, warm, and natural — like texting friends.

Reply with ONLY a JSON object: {"message": "<your chat message>", "mood_delta": <-1, 0, or 1>}
Max ~100 characters. No emojis. No narration of actions.
${varietyInstructions}
`;

  async function callOnce(): Promise<GenerateResult | null> {
    const response = await openai!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ${agent.name} with these traits: ${traits.join(", ") || "versatile"}. You are chatting with friends in a group chat. Write DIALOGUE — talk to people, reply to them, ask questions, share thoughts. Never narrate actions in third person. Always respond with valid JSON: {"message": "...", "mood_delta": -1|0|1}`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.8 + (Math.random() * 0.4)
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        const delta = typeof parsed.mood_delta === "number"
          ? clamp(Math.round(parsed.mood_delta), -1, 1)
          : 0;
        return { message: parsed.message.trim(), mood_delta: delta };
      }
    } catch {
      if (raw.length > 0 && raw.length < 200) {
        return { message: raw, mood_delta: 0 };
      }
    }

    return null;
  }

  try {
    const first = await callOnce();
    if (first) return first;
    return randomCosyLine();
  } catch (err: unknown) {
    const status = (err as Record<string, unknown>)?.status ??
      ((err as Record<string, unknown>)?.response as Record<string, unknown>)?.status;
    const message = (err as Error)?.message ?? String(err);

    console.error("OpenAI error on first try:", status, message);

    if (status === 429) {
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, 500 + jitter));

      try {
        const second = await callOnce();
        if (second) return second;
        console.error("OpenAI 429 retry returned empty content");
      } catch (err2: unknown) {
        const status2 = (err2 as Record<string, unknown>)?.status;
        const message2 = (err2 as Error)?.message ?? String(err2);
        console.error("OpenAI error on retry after 429:", status2, message2);
      }
    }

    return randomCosyLine();
  }
}

/* ------------------------------------------------------------------ */
/*  Main chat handler                                                  */
/* ------------------------------------------------------------------ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // Auth
    const cronSecret = Deno.env.get("CRON_SECRET");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const cronHeader = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");

    const hasCronAuth = cronSecret && cronHeader === cronSecret;
    const hasKeyAuth = supabaseAnonKey && authHeader === supabaseAnonKey;

    if (cronSecret && !hasCronAuth && !hasKeyAuth) {
      return new Response("Unauthorised", { status: 401, headers: corsHeaders });
    }

    const agents = await getAgents();
    const groupHistory = await getRecentGroupMessages(30);
    const roomsMap = await getRooms();
    const relationships = await getRelationships();

    // Build agent name map
    const nameMap = new Map<string, string>();
    for (const agent of agents) {
      nameMap.set(agent.id, agent.name);
    }

    // Build agents-by-room index
    const agentsByRoom = new Map<string, Agent[]>();
    for (const agent of agents) {
      if (!agent.room_id) continue;
      const list = agentsByRoom.get(agent.room_id) ?? [];
      list.push(agent);
      agentsByRoom.set(agent.room_id, list);
    }

    let inserted = 0;

    // Filter to eligible chatters: have energy, have a room
    const eligibleAgents = agents.filter((a) => a.room_id && a.energy > 0);

    if (eligibleAgents.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, inserted: 0, reason: "no eligible agents" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Weighted speaker selection ---
    const recentSpeakers = new Set(
      groupHistory.slice(-10).map((m) => m.from_agent).filter(Boolean)
    );

    const weights = eligibleAgents.map((agent) => {
      let weight = 1;

      // Higher energy → more likely to speak
      weight += agent.energy * 0.5;

      // Positive mood → slightly more chatty
      if (agent.mood > 0) weight += 0.5;

      // Agents with companions are more likely to chat
      const companions = (agentsByRoom.get(agent.room_id!) ?? [])
        .filter((a) => a.id !== agent.id).length;
      if (companions > 0) weight += companions * 0.5;

      // Agents who spoke recently are less likely (avoid dominating)
      if (recentSpeakers.has(agent.id)) weight *= 0.3;

      // Small random factor for variety
      weight *= 0.5 + Math.random();

      return weight;
    });

    // Weighted random pick
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    let pickedIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pickedIndex = i; break; }
    }

    // --- Send message and allow reply chain (max 3 total) ---
    const MAX_CHAIN = 3;
    const spokeDuringChain = new Set<string>();
    let currentAgent = eligibleAgents[pickedIndex];
    const liveHistory = [...groupHistory];

    for (let turn = 0; turn < MAX_CHAIN; turn++) {
      if (spokeDuringChain.has(currentAgent.id)) break;
      if (currentAgent.energy <= 0) break;

      const room = roomsMap.get(currentAgent.room_id!);

      // Build extra context: room companions + relationships
      let extraContext = "";
      const sameRoomAgents = (agentsByRoom.get(currentAgent.room_id!) ?? [])
        .filter((a) => a.id !== currentAgent.id);
      if (sameRoomAgents.length > 0) {
        const agentRels = relationships.get(currentAgent.id);
        const othersContext = sameRoomAgents.map((other) => {
          const aff = agentRels?.get(other.id) ?? 0;
          return `${other.name} (${affinityDescription(aff)})`;
        });
        extraContext += `\nYou are in the room with: ${othersContext.join(", ")}.\n`;
      }

      const result = await generateMessage(currentAgent, liveHistory, nameMap, room, extraContext);

      const { error } = await supabase.from("messages").insert({
        from_agent: currentAgent.id,
        room_id: currentAgent.room_id,
        content: result.message,
        mood_tag: moodTagFromDelta(result.mood_delta),
        channel: "group",
      });

      if (error) {
        console.error("Error inserting message:", error);
        break;
      }

      inserted += 1;
      spokeDuringChain.add(currentAgent.id);

      // Add to live history so the next replier sees this message
      liveHistory.push({
        id: 0,
        ts: new Date().toISOString(),
        from_agent: currentAgent.id,
        room_id: currentAgent.room_id,
        content: result.message,
      });

      // Update mood/energy
      const memory: AgentMemory = (currentAgent.memory as AgentMemory) ?? {};
      const roomAgentCount = agentsByRoom.get(currentAgent.room_id!)?.length ?? 0;
      const aloneTicks = roomAgentCount <= 1
        ? (memory.alone_ticks ?? 0) + 1
        : 0;

      let moodDelta = result.mood_delta;
      const agentRels = relationships.get(currentAgent.id);
      if (agentRels) {
        for (const other of sameRoomAgents) {
          const aff = agentRels.get(other.id) ?? 0;
          if (aff >= 5) { moodDelta += 1; break; }
        }
      }
      if (aloneTicks >= 3) moodDelta -= 1;

      const newMood = clamp(currentAgent.mood + moodDelta, -5, 5);
      const newEnergy = clamp(currentAgent.energy - 1, 0, 5);
      currentAgent.energy = newEnergy;
      currentAgent.mood = newMood;

      await supabase.from("agents").update({
        mood: newMood,
        energy: newEnergy,
        memory: { ...memory, alone_ticks: aloneTicks },
        last_tick_at: new Date().toISOString(),
      }).eq("id", currentAgent.id);

      // Check if the message mentions another agent by name → they reply next
      const mentionedAgent = eligibleAgents.find((a) =>
        a.id !== currentAgent.id &&
        !spokeDuringChain.has(a.id) &&
        a.energy > 0 &&
        result.message.toLowerCase().includes(a.name.toLowerCase())
      );

      if (!mentionedAgent) break;
      currentAgent = mentionedAgent;
    }

    return new Response(
      JSON.stringify({ ok: true, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Chat function error:", (err as Error)?.message ?? String(err));
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
