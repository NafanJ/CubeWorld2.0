// supabase/functions/tick/index.ts
// World simulation tick — movement, relationships, energy/rest.
// Chat is handled separately by the chat edge function.

// @ts-expect-error Deno module resolution
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-expect-error Deno module resolution
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing PROJECT_URL / SERVICE_ROLE_KEY env vars");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

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
    const roomsMap = await getRooms();
    const relationships = await getRelationships();

    const movedAgents = new Set<string>();

    // ----------------------------------------------------------
    // Phase 1: Move agents along their paths
    // ----------------------------------------------------------
    const roomIds = Array.from(roomsMap.keys());
    // Non-elevator rooms are valid destinations (elevators are at x=1)
    const nonElevatorRoomIds = roomIds.filter((id) => {
      const r = roomsMap.get(id);
      return r && r.x !== 1;
    });
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
                const targetRoom = otherAgent?.room_id ? roomsMap.get(otherAgent.room_id) : null;
                if (otherAgent?.room_id && otherAgent.room_id !== agent.room_id && targetRoom && targetRoom.x !== 1) {
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

            const candidates = nonElevatorRoomIds.filter(
              (r) => r !== agent.room_id && !avoidRooms.has(r)
            );
            if (candidates.length > 0) {
              destinationId = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
              // Fallback: pick any non-elevator room if all are avoided
              const fallback = nonElevatorRoomIds.filter((r) => r !== agent.room_id);
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

            const { error: logErr } = await supabase.from("agent_logs").insert({
              agent_id: agent.id,
              text: movementMsg,
            });

            if (logErr) {
              console.error("Error inserting movement log:", logErr);
            }
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

    // ----------------------------------------------------------
    // Phase 3: Update alone ticks and handle resting
    // ----------------------------------------------------------
    const refreshedAgents = await getAgents();

    for (const agent of refreshedAgents) {
      if (!agent.room_id) continue;

      const memory: AgentMemory = (agent.memory as AgentMemory) ?? {};
      const roomAgentCount = agentsByRoom.get(agent.room_id)?.length ?? 0;
      const aloneTicks = roomAgentCount <= 1
        ? (memory.alone_ticks ?? 0) + 1
        : 0;

      // Energy check: if depleted, rest
      if (agent.energy <= 0) {
        const restMsg = `${agent.name} rests quietly, eyes half-closed.`;
        const { error } = await supabase.from("agent_logs").insert({
          agent_id: agent.id,
          text: restMsg,
        });
        if (error) console.error("Error inserting rest log:", error);

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

      // Update alone ticks
      await supabase.from("agents").update({
        memory: { ...memory, alone_ticks: aloneTicks },
      }).eq("id", agent.id);
    }

    // ----------------------------------------------------------
    // Phase 4: Increment tick counter
    // ----------------------------------------------------------
    const { error: tickErr } = await supabase.rpc("increment_tick_count");
    if (tickErr) {
      console.error("Error incrementing tick_count:", tickErr);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Tick function error:", (err as Error)?.message ?? String(err));
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
