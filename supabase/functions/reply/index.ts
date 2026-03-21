// supabase/functions/reply/index.ts
// Instant agent reply to user @mentions.

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

interface Agent {
  id: string;
  name: string;
  provider: string;
  model: string;
  room_id: string | null;
  is_active: boolean;
  persona: Persona | null;
  mood: number;
  energy: number;
}

interface Room {
  id: string;
  name: string;
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

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ------------------------------------------------------------------ */
/*  Build personality prompt (mirrors tick function)                    */
/* ------------------------------------------------------------------ */

function buildPersonalityPrompt(persona: Persona | null): string {
  if (!persona) return "";
  const parts: string[] = [];
  if (persona.traits?.length)
    parts.push(`Your core traits: ${persona.traits.join(", ")}.`);
  if (persona.communicationStyle && persona.communicationStyle !== "natural")
    parts.push(`You communicate in a ${persona.communicationStyle} manner.`);
  if (persona.interests?.length)
    parts.push(`You care deeply about: ${persona.interests.join(", ")}.`);
  if (persona.quirks?.length)
    parts.push(`Your quirks: ${persona.quirks.map((q) => `- ${q}`).join("\n")}`);
  if (persona.speechPatterns?.length)
    parts.push(`Speech style: ${persona.speechPatterns.join(", ")}.`);
  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Generate a reply from one agent to a visitor message               */
/* ------------------------------------------------------------------ */

async function generateReply(
  agent: Agent,
  visitorMessage: string,
  roomName: string,
  isDM: boolean = false,
  dmHistory: string = ""
): Promise<string> {
  if (!openai) return `${agent.name} waves at the visitor.`;

  const personalityPrompt = buildPersonalityPrompt(agent.persona);
  const traits = agent.persona?.traits ?? [];

  let contextBlock = "";
  if (isDM) {
    contextBlock = `You are in a private conversation with a visitor. Only you and the visitor can see these messages.`;
    if (dmHistory) {
      contextBlock += `\n\nRecent conversation history:\n${dmHistory}`;
    }
    contextBlock += `\n\nThe visitor just said: "${visitorMessage}"`;
  } else {
    contextBlock = `A visitor just said to you in the group chat: "${visitorMessage}"`;
  }

  const prompt = `
You are a cosy, low-key villager called ${agent.name} in a tiny 2x3 apartment block called Cozy Village.
You are currently in a room called "${roomName}".
Your current mood: ${agent.mood} (scale: -5 very sad to 5 very happy).
Your current energy: ${agent.energy}/5.
${personalityPrompt}

${contextBlock}

Respond naturally and in character. Keep it brief (1-2 sentences).
Write in third person (e.g. "${agent.name} smiles and says '...'").
Stay gentle, cosy, and grounded. No emojis.
Reply with ONLY your response text, nothing else.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are ${agent.name} with these traits: ${traits.join(", ") || "versatile"}. A visitor is talking to you${isDM ? " privately" : " in the group chat"}. Respond briefly and in character, in third person.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 150,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    return raw || `${agent.name} nods thoughtfully at the visitor.`;
  } catch (err: unknown) {
    console.error("OpenAI error:", (err as Error)?.message ?? String(err));
    return `${agent.name} looks up at the visitor curiously.`;
  }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Auth: accept anon key or cron secret
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret");

  const hasAuth =
    (supabaseAnonKey && authHeader === supabaseAnonKey) ||
    (cronSecret && cronHeader === cronSecret);

  if (supabaseAnonKey && cronSecret && !hasAuth) {
    return new Response("Unauthorised", {
      status: 401,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    const content: string = (body.content ?? "").trim();
    const mentions: { agents?: string[]; rooms?: string[] } =
      body.mentions ?? {};
    const channel: string = body.channel ?? "group";

    if (!content) {
      return new Response(
        JSON.stringify({ ok: false, error: "Empty message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isDM = channel.startsWith("dm:");

    // Fetch all active agents and rooms
    const [agentsRes, roomsRes] = await Promise.all([
      supabase
        .from("agents")
        .select("id, name, provider, model, room_id, is_active, persona, mood, energy"),
      supabase.from("rooms").select("id, name"),
    ]);

    const allAgents: Agent[] = (agentsRes.data ?? []) as Agent[];
    const allRooms: Room[] = (roomsRes.data ?? []) as Room[];
    const roomMap = new Map(allRooms.map((r) => [r.id, r]));
    const roomByName = new Map(
      allRooms.map((r) => [r.name.toLowerCase(), r])
    );

    let respondingAgents: Agent[] = [];

    if (isDM) {
      // DM: target agent is identified by channel
      const dmAgentId = channel.replace("dm:", "");
      const dmAgent = allAgents.find((a) => a.id === dmAgentId);
      if (dmAgent) respondingAgents = [dmAgent];
    } else {
      // Group chat: resolve mentions
      const targetAgents: Agent[] = [];
      const mentionedAgentNames = (mentions.agents ?? []).map((n) =>
        n.toLowerCase()
      );
      const mentionedRoomNames = (mentions.rooms ?? []).map((n) =>
        n.toLowerCase()
      );

      // @everyone → all active agents
      const isEveryone = mentionedAgentNames.includes("everyone");

      if (isEveryone) {
        for (const agent of allAgents) {
          if (agent.is_active) targetAgents.push(agent);
        }
      } else {
        // Direct agent mentions
        for (const name of mentionedAgentNames) {
          const agent = allAgents.find((a) => a.name.toLowerCase() === name);
          if (agent && !targetAgents.find((t) => t.id === agent.id)) {
            targetAgents.push(agent);
          }
        }

        // Room mentions → add agents in those rooms
        for (const roomName of mentionedRoomNames) {
          const room = roomByName.get(roomName);
          if (room) {
            const agentsInRoom = allAgents.filter((a) => a.room_id === room.id);
            for (const agent of agentsInRoom) {
              if (!targetAgents.find((t) => t.id === agent.id)) {
                targetAgents.push(agent);
              }
            }
          }
        }
      }

      // Cap: 6 for @everyone announcements, 3 for targeted mentions
      const maxAgents = isEveryone ? 6 : 3;
      respondingAgents = targetAgents.slice(0, maxAgents);
    }

    // Determine room for the user message
    let messageRoomId: string | null = null;
    if (respondingAgents.length > 0 && respondingAgents[0].room_id) {
      messageRoomId = respondingAgents[0].room_id;
    }
    // Fallback to first room if nothing matched
    if (!messageRoomId && allRooms.length > 0) {
      messageRoomId = allRooms[0].id;
    }

    // Insert user message with channel
    const { error: msgErr } = await supabase.from("messages").insert({
      from_agent: null,
      room_id: messageRoomId,
      content,
      channel,
    });
    if (msgErr) {
      console.error("[reply] Error inserting user message:", JSON.stringify(msgErr));
    }

    // For DMs, fetch conversation history for context
    let dmHistory = "";
    if (isDM) {
      const { data: dmMessages } = await supabase
        .from("messages")
        .select("from_agent, content")
        .eq("channel", channel)
        .order("ts", { ascending: false })
        .limit(20);

      if (dmMessages && dmMessages.length > 0) {
        const dmAgent = respondingAgents[0];
        dmHistory = (dmMessages as Array<{ from_agent: string | null; content: string }>)
          .reverse()
          .map((m) => {
            const sender = m.from_agent ? dmAgent.name : "Visitor";
            return `- ${sender}: ${m.content}`;
          })
          .join("\n");
      }
    }

    // Generate replies from each target agent
    let replies = 0;
    for (const agent of respondingAgents) {
      const room = agent.room_id ? roomMap.get(agent.room_id) : null;
      const roomName = room?.name ?? "the village";
      const replyText = await generateReply(agent, content, roomName, isDM, dmHistory);

      const { error: insertErr } = await supabase.from("messages").insert({
        from_agent: agent.id,
        room_id: agent.room_id ?? messageRoomId,
        content: replyText,
        channel,
      });

      if (insertErr) {
        console.error(`Error inserting reply from ${agent.name}:`, insertErr);
      } else {
        replies++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, replies }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("Reply function error:", (err as Error)?.message ?? String(err));
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
