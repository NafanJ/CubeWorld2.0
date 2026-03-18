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

async function getRecentMessagesByAgent(
  limitPerAgent = 10
): Promise<Map<string, MessageSummary[]>> {
  const historyByAgent = new Map<string, MessageSummary[]>();

  const { data, error } = await supabase
    .from("messages")
    .select("id, ts, from_agent, room_id, content")
    .order("ts", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Error fetching recent messages:", error);
    return historyByAgent;
  }

  for (const row of (data ?? []) as MessageSummary[]) {
    const key = row.from_agent;
    if (!key) continue;

    const arr = historyByAgent.get(key) ?? [];
    if (arr.length >= limitPerAgent) continue;

    arr.push(row);
    historyByAgent.set(key, arr);
  }

  return historyByAgent;
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
  history: MessageSummary[],
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

  const recentLines = history
    .map((m) => m.content?.trim())
    .filter((c): c is string => !!c)
    .slice(0, 20);

  const recentHistoryText =
    recentLines.length > 0
      ? recentLines.map((c) => `- ${c}`).join("\n")
      : "(no recent actions recorded yet)";

  let varietyInstructions = "Avoid repeating the exact same actions or wording as above.";

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

Here are the last few things you have been doing recently (newest first):

${recentHistoryText}

Now decide what to do this tick:

- Choose to describe a tiny new action.

Reply with a JSON object: {"message": "<your one-line action>", "mood_delta": <-1, 0, or 1>}
The message should be ONE short, present-tense line (max ~80 characters)
describing what you are doing right now in this room.
mood_delta should reflect how this action makes you feel (-1 worse, 0 same, 1 better).

Keep it gentle, slice-of-life, and grounded.
${varietyInstructions}
No emojis, no dialogue in the message. Always write in third person perspective.
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
/*  Conversation generation                                            */
/* ------------------------------------------------------------------ */

async function generateConversationMessage(
  agent: Agent,
  otherAgent: Agent,
  previousMessage: string | null,
  history: MessageSummary[],
  room: Room | undefined,
  affinity: number
): Promise<GenerateResult> {
  if (!openai) {
    return { message: `${agent.name} nods quietly.`, mood_delta: 0 };
  }

  const persona = agent.persona ?? {};
  const traits = persona.traits ?? [];
  const roomName = room?.name ?? "a room";
  const relationship = affinityDescription(affinity);

  let conversationContext: string;
  if (previousMessage) {
    conversationContext = `${otherAgent.name} just said/did: "${previousMessage}"\nRespond naturally to them.`;
  } else {
    conversationContext = `You see ${otherAgent.name} (${relationship}) in the room. Say or do something directed at them.`;
  }

  const recentLines = history
    .map((m) => m.content?.trim())
    .filter((c): c is string => !!c)
    .slice(0, 10);

  const recentHistoryText =
    recentLines.length > 0
      ? recentLines.map((c) => `- ${c}`).join("\n")
      : "(no recent actions)";

  const prompt = `
You are ${agent.name}, a cosy villager in Cozy Village.
Your traits: ${traits.join(", ") || "versatile"}.
You are in "${roomName}" with ${otherAgent.name}, ${relationship}.
Your mood: ${agent.mood}, energy: ${agent.energy}/5.

Recent history:
${recentHistoryText}

${conversationContext}

Reply with JSON: {"message": "<action or speech, ~80 chars>", "mood_delta": <-1, 0, or 1>}
Write in third person. Can include speech like: ${agent.name} says "..."
Keep it gentle and grounded. No emojis. ONLY the JSON object.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ${agent.name}. Generate a conversational action or speech directed at ${otherAgent.name}. Always respond with valid JSON: {"message": "...", "mood_delta": -1|0|1}`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.85 + (Math.random() * 0.3)
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) return { message: `${agent.name} glances at ${otherAgent.name}.`, mood_delta: 0 };

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

    return { message: `${agent.name} smiles at ${otherAgent.name}.`, mood_delta: 0 };
  } catch (err: unknown) {
    console.error("Conversation generation error:", (err as Error)?.message ?? String(err));
    return { message: `${agent.name} nods at ${otherAgent.name}.`, mood_delta: 0 };
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

serve(async (req: Request) => {
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
    const relationships = await getRelationships();
    const userMessages = await getRecentUserMessages();
    const tickCount = await getTickCount();

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
    // Phase 3: Agent-to-agent conversations + solo messages
    // ----------------------------------------------------------
    const refreshedAgents = await getAgents();

    // Rebuild room groupings with refreshed data
    const refreshedByRoom = new Map<string, Agent[]>();
    for (const agent of refreshedAgents) {
      if (!agent.room_id || movedAgents.has(agent.id)) continue;
      const list = refreshedByRoom.get(agent.room_id) ?? [];
      list.push(agent);
      refreshedByRoom.set(agent.room_id, list);
    }

    const conversedAgents = new Set<string>();

    // Handle conversations in rooms with 2+ non-moved agents
    for (const [roomId, roomAgents] of refreshedByRoom) {
      if (roomAgents.length < 2) continue;

      // Find agents with energy > 0
      const availableAgents = roomAgents.filter((a) => a.energy > 0);
      if (availableAgents.length < 2) continue;

      // Pick the pair with highest mutual affinity
      let bestPair: [Agent, Agent] | null = null;
      let bestAffinity = -Infinity;

      for (let i = 0; i < availableAgents.length; i++) {
        for (let j = i + 1; j < availableAgents.length; j++) {
          const aRels = updatedRelationships.get(availableAgents[i].id);
          const affinity = aRels?.get(availableAgents[j].id) ?? 0;
          if (affinity > bestAffinity) {
            bestAffinity = affinity;
            bestPair = [availableAgents[i], availableAgents[j]];
          }
        }
      }

      if (!bestPair) continue;

      const [agentA, agentB] = bestPair;
      const room = roomsMap.get(roomId);
      const affinity = bestAffinity;

      // Build extra context for user messages in this room
      const roomUserMsgs = userMessages.filter((m) => m.room_id === roomId);
      let userContext = "";
      if (roomUserMsgs.length > 0) {
        const userLines = roomUserMsgs
          .map((m) => m.content?.trim())
          .filter((c): c is string => !!c)
          .slice(0, 3);
        if (userLines.length > 0) {
          userContext = `\nA visitor in the room said: "${userLines.join('" and "')}"\nYou may acknowledge or respond to the visitor.\n`;
        }
      }

      // Turn 1: Agent A initiates
      const historyA = historyByAgent.get(agentA.id) ?? [];
      const turn1 = await generateConversationMessage(
        agentA, agentB, null, historyA, room, affinity
      );

      const { error: msg1Err } = await supabase.from("messages").insert({
        from_agent: agentA.id,
        room_id: roomId,
        content: turn1.message,
        mood_tag: moodTagFromDelta(turn1.mood_delta),
      });
      if (!msg1Err) inserted += 1;

      // Update Agent A mood/energy
      const newMoodA = clamp(agentA.mood + turn1.mood_delta, -5, 5);
      const newEnergyA = clamp(agentA.energy - 1, 0, 5);
      await supabase.from("agents").update({
        mood: newMoodA,
        energy: newEnergyA,
        last_tick_at: new Date().toISOString(),
      }).eq("id", agentA.id);

      // Turn 2: Agent B responds
      const historyB = historyByAgent.get(agentB.id) ?? [];
      const turn2 = await generateConversationMessage(
        agentB, agentA, turn1.message, historyB, room, affinity
      );

      const { error: msg2Err } = await supabase.from("messages").insert({
        from_agent: agentB.id,
        room_id: roomId,
        content: turn2.message,
        mood_tag: moodTagFromDelta(turn2.mood_delta),
      });
      if (!msg2Err) inserted += 1;

      // Update Agent B mood/energy
      const newMoodB = clamp(agentB.mood + turn2.mood_delta, -5, 5);
      const newEnergyB = clamp(agentB.energy - 1, 0, 5);
      await supabase.from("agents").update({
        mood: newMoodB,
        energy: newEnergyB,
        last_tick_at: new Date().toISOString(),
      }).eq("id", agentB.id);

      // Turn 3: 30% chance Agent A replies
      if (Math.random() <= 0.3 && newEnergyA > 0) {
        const turn3 = await generateConversationMessage(
          agentA, agentB, turn2.message, historyA, room, affinity
        );

        const { error: msg3Err } = await supabase.from("messages").insert({
          from_agent: agentA.id,
          room_id: roomId,
          content: turn3.message,
          mood_tag: moodTagFromDelta(turn3.mood_delta),
        });
        if (!msg3Err) inserted += 1;

        const finalMoodA = clamp(newMoodA + turn3.mood_delta, -5, 5);
        const finalEnergyA = clamp(newEnergyA - 1, 0, 5);
        await supabase.from("agents").update({
          mood: finalMoodA,
          energy: finalEnergyA,
        }).eq("id", agentA.id);
      }

      conversedAgents.add(agentA.id);
      conversedAgents.add(agentB.id);
    }

    // Solo messages for remaining agents
    for (const agent of refreshedAgents) {
      if (!agent.room_id) continue;
      if (movedAgents.has(agent.id)) continue;
      if (conversedAgents.has(agent.id)) continue;

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

      // Build extra context
      let extraContext = "";

      // Add user message awareness
      const roomUserMsgs = userMessages.filter((m) => m.room_id === agent.room_id);
      if (roomUserMsgs.length > 0) {
        const userLines = roomUserMsgs
          .map((m) => m.content?.trim())
          .filter((c): c is string => !!c)
          .slice(0, 3);
        if (userLines.length > 0) {
          extraContext += `\nA visitor in the room said: "${userLines.join('" and "')}"\nYou may choose to respond to the visitor or continue your own activities.\n`;
        }
      }

      // Add relationship context for agents in the same room
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

      const history = historyByAgent.get(agent.id) ?? [];
      const result = await generateMessage(agent, history, room, extraContext);

      const { error } = await supabase.from("messages").insert({
        from_agent: agent.id,
        room_id: agent.room_id,
        content: result.message,
        mood_tag: moodTagFromDelta(result.mood_delta),
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

      const history = historyByAgent.get(agent.id) ?? [];
      const diaryText = await generateDiaryEntry(agent, history);

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
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Tick function error:", (err as Error)?.message ?? String(err));
    return new Response("Internal error", { status: 500 });
  }
});
