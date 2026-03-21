// supabase/functions/tick/index.ts
// Core simulation engine — runs every 5 minutes via GitHub Actions cron.

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
  path?: string[];
}

interface AgentMemory {
  alone_ticks?: number;
  last_diary_tick?: number;
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

  // Return in chronological order (oldest first)
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
    // Store both directions for easy lookup
    if (!relMap.has(rel.a)) relMap.set(rel.a, new Map());
    if (!relMap.has(rel.b)) relMap.set(rel.b, new Map());
    relMap.get(rel.a)!.set(rel.b, rel.affinity);
    relMap.get(rel.b)!.set(rel.a, rel.affinity);
  }

  return relMap;
}

async function getRecentUserMessages(): Promise<MessageSummary[]> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("id, ts, from_agent, room_id, content")
    .eq("channel", "group")
    .is("from_agent", null)
    .gte("ts", fiveMinutesAgo)
    .order("ts", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching user messages:", error);
    return [];
  }

  return (data ?? []) as MessageSummary[];
}

async function getTickCount(): Promise<number> {
  const { data, error } = await supabase
    .from("world_state")
    .select("tick")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Error fetching tick count:", error);
    return 0;
  }

  return (data as { tick: number })?.tick ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Pathfinding                                                        */
/* ------------------------------------------------------------------ */

function calculatePath(
  fromRoom: Room,
  toRoom: Room,
  roomsMap: Map<string, Room>
): string[] {
  if (fromRoom.id === toRoom.id) return [];

  const path: string[] = [];

  const findRoomByCoords = (x: number, y: number): Room | undefined => {
    for (const room of roomsMap.values()) {
      if (room.x === x && room.y === y) return room;
    }
    return undefined;
  };

  const currentX = fromRoom.x ?? 0;
  const currentY = fromRoom.y ?? 0;
  const targetX = toRoom.x ?? 0;
  const targetY = toRoom.y ?? 0;

  if (currentY === targetY) {
    const xDirection = targetX > currentX ? 1 : -1;
    for (let x = currentX + xDirection; x !== targetX + xDirection; x += xDirection) {
      const room = findRoomByCoords(x, currentY);
      if (room) path.push(room.id);
    }
  } else {
    if (currentX !== 1) {
      const xDirection = 1 - currentX > 0 ? 1 : -1;
      for (let x = currentX + xDirection; x !== 1 + xDirection; x += xDirection) {
        const room = findRoomByCoords(x, currentY);
        if (room) path.push(room.id);
      }
    }

    const yDirection = targetY > currentY ? 1 : -1;
    for (let y = currentY + yDirection; y !== targetY + yDirection; y += yDirection) {
      const room = findRoomByCoords(1, y);
      if (room) path.push(room.id);
    }

    if (targetX !== 1) {
      const xDirection = targetX - 1 > 0 ? 1 : -1;
      for (let x = 1 + xDirection; x !== targetX + xDirection; x += xDirection) {
        const room = findRoomByCoords(x, targetY);
        if (room) path.push(room.id);
      }
    }
  }

  return path;
}

/* ------------------------------------------------------------------ */
/*  Movement message templates                                         */
/* ------------------------------------------------------------------ */

const MOVEMENT_TEMPLATES: Record<string, string[]> = {
  shy: [
    "{name} tiptoes quietly into {room}.",
    "{name} slips into {room} unnoticed.",
    "{name} shuffles shyly into {room}.",
  ],
  bold: [
    "{name} bursts into {room}!",
    "{name} strides into {room} with confidence.",
    "{name} marches boldly into {room}.",
  ],
  curious: [
    "{name} wanders into {room}, looking around.",
    "{name} peeks into {room} curiously.",
    "{name} explores their way into {room}.",
  ],
  calm: [
    "{name} drifts into {room} peacefully.",
    "{name} strolls into {room} at a leisurely pace.",
    "{name} glides calmly into {room}.",
  ],
  builder: [
    "{name} heads to {room} with purpose.",
    "{name} marches into {room}, ready to work.",
    "{name} makes their way purposefully to {room}.",
  ],
  organiser: [
    "{name} heads to {room} with a plan in mind.",
    "{name} steps efficiently into {room}.",
    "{name} moves to {room} with clear intent.",
  ],
  painter: [
    "{name} glides into {room} gracefully.",
    "{name} wanders into {room}, eyes bright with inspiration.",
    "{name} drifts dreamily into {room}.",
  ],
  poet: [
    "{name} wanders thoughtfully into {room}.",
    "{name} drifts into {room}, lost in thought.",
    "{name} meanders into {room} with a faraway look.",
  ],
  gardener: [
    "{name} ambles into {room} with soil-dusted hands.",
    "{name} wanders into {room}, brushing off a leaf.",
    "{name} steps lightly into {room}.",
  ],
  chatty: [
    "{name} bounces into {room} with a grin.",
    "{name} bustles into {room}, already talking.",
    "{name} hurries into {room} excitedly.",
  ],
  polite: [
    "{name} steps politely into {room}.",
    "{name} enters {room} with a gentle nod.",
    "{name} makes a quiet entrance into {room}.",
  ],
  observant: [
    "{name} slips into {room}, eyes scanning everything.",
    "{name} enters {room} quietly, taking it all in.",
    "{name} moves into {room} with watchful eyes.",
  ],
  default: [
    "{name} walks into {room}.",
    "{name} heads over to {room}.",
    "{name} arrives at {room}.",
    "{name} makes their way to {room}.",
  ],
};

function generateMovementMessage(agent: Agent, roomName: string): string {
  const traits = agent.persona?.traits ?? [];
  let templates = MOVEMENT_TEMPLATES.default;

  // Try to find a matching template for one of the agent's traits
  for (const trait of traits) {
    const key = trait.toLowerCase();
    if (MOVEMENT_TEMPLATES[key]) {
      templates = MOVEMENT_TEMPLATES[key];
      break;
    }
  }

  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace("{name}", agent.name).replace("{room}", roomName);
}

/* ------------------------------------------------------------------ */
/*  Mood & energy helpers                                              */
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

  // Format group chat history with sender names
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
You are a cosy, low-key villager called ${agent.name} in a tiny 2x3 apartment block called Cozy Village.
You belong to provider "${agent.provider}".
You are currently in a room called "${roomName}".
Your current mood: ${agent.mood} (scale: -5 very sad to 5 very happy).
Your current energy: ${agent.energy}/5.
${personalityPrompt}
${extraContext}

Here is the recent group chat (oldest first). Everyone in the village can see these messages:

${groupChatText}

Now decide what to do or say next. You can:
- Respond to something another villager said or did
- Address someone by name
- Do your own thing independently
- React to what's happening around you in ${roomName}

Reply with a JSON object: {"message": "<your one-line action or speech>", "mood_delta": <-1, 0, or 1>}
The message should be ONE short, present-tense line (max ~100 characters).
Write as yourself in first person — speak naturally, describe what you're doing, or chat with others.
mood_delta should reflect how this makes you feel (-1 worse, 0 same, 1 better).

Keep it gentle, slice-of-life, and grounded.
${varietyInstructions}
No emojis.
Reply with ONLY the JSON object. Nothing else.
`;

  async function callOnce(): Promise<GenerateResult | null> {
    const response = await openai!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ${agent.name} with these traits: ${traits.join(", ") || "versatile"}. Generate one unique, grounded action. Be varied and avoid repetition. Always respond with valid JSON: {"message": "...", "mood_delta": -1|0|1}`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.8 + (Math.random() * 0.4)
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) return null;

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        const delta = typeof parsed.mood_delta === "number"
          ? clamp(Math.round(parsed.mood_delta), -1, 1)
          : 0;
        return { message: parsed.message.trim(), mood_delta: delta };
      }
    } catch {
      // If JSON parse fails, treat the whole response as the message
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
/*  Diary generation                                                   */
/* ------------------------------------------------------------------ */

async function generateDiaryEntry(
  agent: Agent,
  history: MessageSummary[]
): Promise<string | null> {
  if (!openai) return null;

  const persona = agent.persona ?? {};
  const traits = persona.traits ?? [];

  const recentLines = history
    .map((m) => m.content?.trim())
    .filter((c): c is string => !!c)
    .slice(0, 5);

  const recentText =
    recentLines.length > 0
      ? recentLines.map((c) => `- ${c}`).join("\n")
      : "- (quiet day, not much happened)";

  const prompt = `
You are ${agent.name}, a cosy villager. Traits: ${traits.join(", ") || "versatile"}.
Current mood: ${agent.mood} (-5 to 5 scale). Energy: ${agent.energy}/5.

Recent things you've been doing:
${recentText}

Write a brief private diary entry (2-3 sentences) reflecting on your recent experiences.
Write in first person. Be introspective and match your personality.
No emojis. Just the diary text, nothing else.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ${agent.name} writing in your private diary. Be reflective and personal.`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.9
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    return content || null;
  } catch (err: unknown) {
    console.error("Diary generation error:", (err as Error)?.message ?? String(err));
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main tick handler                                                  */
/* ------------------------------------------------------------------ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // Auth: accept either the cron secret or a valid Supabase anon/service key
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
    const userMessages = await getRecentUserMessages();
    const tickCount = await getTickCount();

    // Build agent name map for formatting chat history
    const nameMap = new Map<string, string>();
    for (const agent of agents) {
      nameMap.set(agent.id, agent.name);
    }

    let inserted = 0;
    const movedAgents = new Set<string>();

    // ----------------------------------------------------------
    // Phase 1: Move agents along their paths
    // ----------------------------------------------------------
    const roomIds = Array.from(roomsMap.keys());
    for (const agent of agents) {
      try {
        if (!agent.room_id) continue;

        const currentRoom = roomsMap.get(agent.room_id);
        if (!currentRoom) continue;

        const persona = agent.persona ?? {};
        let path: string[] = Array.isArray(persona.path) ? [...persona.path] : [];

        // If no path, chance to pick a new destination
        if (path.length === 0 && Math.random() <= 0.15) {
          // Check relationships to influence destination
          const agentRels = relationships.get(agent.id);
          let destinationId: string | undefined;

          if (agentRels && Math.random() <= 0.4) {
            // Try to move toward a high-affinity agent
            let bestAffinity = -Infinity;
            let bestTargetRoom: string | undefined;

            for (const [otherId, affinity] of agentRels) {
              if (affinity >= 5 && affinity > bestAffinity) {
                const otherAgent = agents.find((a) => a.id === otherId);
                if (otherAgent?.room_id && otherAgent.room_id !== agent.room_id) {
                  bestAffinity = affinity;
                  bestTargetRoom = otherAgent.room_id;
                }
              }
            }

            if (bestTargetRoom) {
              destinationId = bestTargetRoom;
            }
          }

          if (!destinationId) {
            // Random destination, but avoid rooms with disliked agents
            const agentRelsMap = relationships.get(agent.id);
            const avoidRooms = new Set<string>();

            if (agentRelsMap) {
              for (const [otherId, affinity] of agentRelsMap) {
                if (affinity <= -3) {
                  const otherAgent = agents.find((a) => a.id === otherId);
                  if (otherAgent?.room_id) {
                    avoidRooms.add(otherAgent.room_id);
                  }
                }
              }
            }

            const candidates = roomIds.filter(
              (r) => r !== agent.room_id && !avoidRooms.has(r)
            );
            if (candidates.length > 0) {
              destinationId = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
              // Fallback: pick any room if all are avoided
              const fallback = roomIds.filter((r) => r !== agent.room_id);
              if (fallback.length > 0) {
                destinationId = fallback[Math.floor(Math.random() * fallback.length)];
              }
            }
          }

          if (destinationId) {
            const destinationRoom = roomsMap.get(destinationId);
            if (destinationRoom) {
              path = calculatePath(currentRoom, destinationRoom, roomsMap);
            }
          }
        }

        // Move to the next room in path
        if (path.length > 0) {
          const nextRoomId = path[0];
          const nextRoom = roomsMap.get(nextRoomId);

          if (nextRoom) {
            const updatedPath = path.slice(1);
            const updatedPersona = { ...persona, path: updatedPath };

            // Energy cost for moving: -1
            const newEnergy = clamp(agent.energy - 1, 0, 5);

            const { error: uErr } = await supabase
              .from("agents")
              .update({
                room_id: nextRoomId,
                persona: updatedPersona,
                energy: newEnergy,
                last_tick_at: new Date().toISOString(),
              })
              .eq("id", agent.id);

            if (uErr) {
              console.error("Error moving agent", agent.id, uErr);
              continue;
            }

            // Update in-memory for later phases
            agent.room_id = nextRoomId;
            agent.energy = newEnergy;

            movedAgents.add(agent.id);

            const nextRoomName = nextRoom.name ?? `room ${nextRoomId.substring(0, 8)}`;
            const movementMsg = generateMovementMessage(agent, nextRoomName);

            const { error: msgErr } = await supabase.from("messages").insert({
              from_agent: agent.id,
              room_id: nextRoomId,
              content: movementMsg,
              mood_tag: "neutral",
              channel: "group",
            });

            if (msgErr) {
              console.error("Error inserting movement message:", msgErr);
              continue;
            }

            inserted += 1;
          }
        }
      } catch (moveErr: unknown) {
        console.error("Error in moving agents:", (moveErr as Error)?.message ?? String(moveErr));
      }
    }

    // ----------------------------------------------------------
    // Phase 2: Update relationships (co-location affinity)
    // ----------------------------------------------------------
    const agentsByRoom = new Map<string, Agent[]>();
    for (const agent of agents) {
      if (!agent.room_id) continue;
      const list = agentsByRoom.get(agent.room_id) ?? [];
      list.push(agent);
      agentsByRoom.set(agent.room_id, list);
    }

    for (const [, roomAgents] of agentsByRoom) {
      if (roomAgents.length < 2) continue;
      for (let i = 0; i < roomAgents.length; i++) {
        for (let j = i + 1; j < roomAgents.length; j++) {
          const a = roomAgents[i].id;
          const b = roomAgents[j].id;
          // Order UUIDs consistently
          const [first, second] = a < b ? [a, b] : [b, a];
          try {
            await supabase.rpc("upsert_affinity", {
              a_id: first,
              b_id: second,
              d: 1,
            });
          } catch (relErr: unknown) {
            console.error("Error updating affinity:", (relErr as Error)?.message ?? String(relErr));
          }
        }
      }
    }

    // Refresh relationships after updates
    const updatedRelationships = await getRelationships();

    // ----------------------------------------------------------
    // Phase 3: Independent agent messages to group chat
    // ----------------------------------------------------------
    const refreshedAgents = await getAgents();

    for (const agent of refreshedAgents) {
      if (!agent.room_id) continue;
      if (movedAgents.has(agent.id)) continue;

      const room = roomsMap.get(agent.room_id);

      // Track alone ticks
      const memory: AgentMemory = (agent.memory as AgentMemory) ?? {};
      const roomAgentCount = agentsByRoom.get(agent.room_id)?.length ?? 0;
      const aloneTicks = roomAgentCount <= 1
        ? (memory.alone_ticks ?? 0) + 1
        : 0;

      // Energy check: if depleted, rest
      if (agent.energy <= 0) {
        const restMsg = `${agent.name} rests quietly, eyes half-closed.`;
        const { error } = await supabase.from("messages").insert({
          from_agent: agent.id,
          room_id: agent.room_id,
          content: restMsg,
          mood_tag: "neutral",
          channel: "group",
        });
        if (!error) inserted += 1;

        // Rest restores energy, but being depleted hurts mood
        const newEnergy = clamp(agent.energy + 2, 0, 5);
        const newMood = clamp(agent.mood - 1, -5, 5);
        await supabase.from("agents").update({
          mood: newMood,
          energy: newEnergy,
          memory: { ...memory, alone_ticks: aloneTicks },
          last_tick_at: new Date().toISOString(),
        }).eq("id", agent.id);
        continue;
      }

      // Random skip (~30%) for natural gaps — not every agent posts every tick
      if (Math.random() < 0.3) {
        // Still update alone ticks even if skipping
        await supabase.from("agents").update({
          memory: { ...memory, alone_ticks: aloneTicks },
        }).eq("id", agent.id);
        continue;
      }

      // Build extra context: room companions + relationships
      let extraContext = "";

      const sameRoomAgents = (agentsByRoom.get(agent.room_id) ?? [])
        .filter((a) => a.id !== agent.id);
      if (sameRoomAgents.length > 0) {
        const agentRels = updatedRelationships.get(agent.id);
        const othersContext = sameRoomAgents.map((other) => {
          const aff = agentRels?.get(other.id) ?? 0;
          return `${other.name} (${affinityDescription(aff)})`;
        });
        extraContext += `\nYou are in the room with: ${othersContext.join(", ")}.\n`;
      }

      const result = await generateMessage(agent, groupHistory, nameMap, room, extraContext);

      const { error } = await supabase.from("messages").insert({
        from_agent: agent.id,
        room_id: agent.room_id,
        content: result.message,
        mood_tag: moodTagFromDelta(result.mood_delta),
        channel: "group",
      });

      if (error) {
        console.error("Error inserting message:", error);
        continue;
      }

      inserted += 1;

      // Update mood/energy
      let moodDelta = result.mood_delta;

      // Mood modifier: high-affinity agent in room
      const agentRels = updatedRelationships.get(agent.id);
      if (agentRels) {
        for (const other of sameRoomAgents) {
          const aff = agentRels.get(other.id) ?? 0;
          if (aff >= 5) {
            moodDelta += 1;
            break;
          }
        }
      }

      // Mood modifier: alone for too long
      if (aloneTicks >= 3) {
        moodDelta -= 1;
      }

      const newMood = clamp(agent.mood + moodDelta, -5, 5);
      const newEnergy = clamp(agent.energy - 1, 0, 5);

      await supabase.from("agents").update({
        mood: newMood,
        energy: newEnergy,
        memory: { ...memory, alone_ticks: aloneTicks },
        last_tick_at: new Date().toISOString(),
      }).eq("id", agent.id);
    }

    // ----------------------------------------------------------
    // Phase 4: Idle energy recovery for moved agents
    // ----------------------------------------------------------
    // Agents that moved already had energy drained, but agents that
    // didn't act at all (shouldn't happen, but just in case) get +1

    // ----------------------------------------------------------
    // Phase 5: Diary entries (staggered, ~1 per agent per 10 ticks)
    // ----------------------------------------------------------
    for (let i = 0; i < refreshedAgents.length; i++) {
      const agent = refreshedAgents[i];
      if (tickCount % 10 !== i % 10) continue;

      const memory: AgentMemory = (agent.memory as AgentMemory) ?? {};
      // Skip if already wrote a diary this cycle
      if (memory.last_diary_tick && memory.last_diary_tick >= tickCount - 5) continue;

      // Filter group history to this agent's messages for diary context
      const agentHistory = groupHistory.filter((m) => m.from_agent === agent.id);
      const diaryText = await generateDiaryEntry(agent, agentHistory);

      if (diaryText) {
        const { error } = await supabase.from("diary_entries").insert({
          agent_id: agent.id,
          text: diaryText,
        });

        if (error) {
          console.error("Error inserting diary entry:", error);
        } else {
          // Update memory with last diary tick
          await supabase.from("agents").update({
            memory: { ...memory, last_diary_tick: tickCount },
          }).eq("id", agent.id);
        }
      }
    }

    // ----------------------------------------------------------
    // Phase 6: Increment tick counter
    // ----------------------------------------------------------
    const { error: tickErr } = await supabase.rpc("increment_tick_count");
    if (tickErr) {
      console.error("Error incrementing tick_count:", tickErr);
    }

    return new Response(
      JSON.stringify({ ok: true, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Tick function error:", (err as Error)?.message ?? String(err));
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
