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
    .select("id, name, provider, model, room_id, is_active")
    .eq("is_active", true);

  if (error) {
    console.error("Error fetching agents:", error);
    throw error;
  }

  return (data ?? []) as Agent[];
}

async function generateMessage(agent: Agent): Promise<string> {
  const cosyLines = [
    "makes a cup of tea and watches the rain."/*,
    "rearranges their bookshelf in quiet concentration.",
    "leans on the windowsill, listening to the city hush.",
    "scribbles a small note in their journal.",
    "straightens the cushions and hums softly.",
    "brushes crumbs off the table and smiles to themself.",
    "adjusts a picture frame until it feels just right."*/
  ];

  function randomCosyLine() {
    const line = cosyLines[Math.floor(Math.random() * cosyLines.length)];
    return `${agent.name} ${line}`;
  }

  // Fallback if no OpenAI key set at all
  if (!openai) {
    return randomCosyLine();
  }

  const prompt = `
You are a cosy, low-key villager called ${agent.name} in a tiny 2x3 apartment block called Cozy Village.
You belong to provider "${agent.provider}".
Write ONE short, present-tense line (max ~80 characters) describing what you are doing right now.
Keep it gentle, slice-of-life, and grounded. No quotes, no emojis, no dialogue.
Just the line, nothing else.
`;

  async function callOnce(): Promise<string | null> {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You write very short, cosy present-tense lines describing tiny actions."
        },
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    return content || null;
  }

  try {
    // First attempt
    const first = await callOnce();
    if (first) return first;

    // If we somehow got empty content, just fall back
    return randomCosyLine();
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    const message = err?.message ?? err?.toString?.() ?? "unknown error";

    console.error("OpenAI error on first try:", status, message);

    // If rate limited, wait a bit and retry once
    if (status === 429) {
      const jitter = Math.floor(Math.random() * 300); // 0–300ms
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + jitter)
      );

      try {
        const second = await callOnce();
        if (second) return second;

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

    // Any failure path ends up here
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
    let inserted = 0;

    for (const agent of agents) {
      if (!agent.room_id) continue; // skip agents without a room

      const content = await generateMessage(agent);

      const { error } = await supabase.from("messages").insert({
        from_agent: agent.id,
        room_id: agent.room_id,
        content
        // ts defaults to now()
        // mood_tag left null for now
      });

      if (error) {
        console.error("Error inserting message:", error);
        continue; // continue ticking other agents
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
