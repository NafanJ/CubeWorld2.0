// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("PROJECT_URL")!,
  Deno.env.get("SERVICE_ROLE_KEY")!
);


// Phase A: no LLMs — just rotate friendly messages.
const FAKE_LINES = [
  "Put the kettle on ☕",
  "Watered the window herbs 🌿",
  "Straightened the frames 🖼️",
  "Hummed a soft tune 🎵",
  "Jotted a tiny note 📒",
  "Lantern’s glow feels kind ✨",
];

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, room_id, name")
    .eq("is_active", true);
  if (error) return new Response(JSON.stringify({ ok:false, error }), { status:500 });

  for (const a of agents ?? []) {
    const line = FAKE_LINES[Math.floor(Math.random() * FAKE_LINES.length)];
    await supabase.from("messages").insert({
      from_agent: a.id,
      room_id: a.room_id,
      content: `${a.name}: ${line}`,
    });
  }

  await supabase.from("world_state").update({ tick: Date.now() }).eq("id", 1);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" }});
});
