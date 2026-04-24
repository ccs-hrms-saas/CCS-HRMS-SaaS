import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { user_id, image_base64 } = await req.json();
    if (!user_id || !image_base64) {
      return NextResponse.json({ error: "Missing user_id or image_base64" }, { status: 400 });
    }

    const clean  = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
    const bytes  = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
    const blob   = new Blob([bytes], { type: "image/jpeg" });
    const fileName = `${user_id}/avatar_${Date.now()}.jpg`;  // folder matches RLS: avatars/{user_id}/...

    const { error } = await supabaseAdmin.storage
      .from("avatars")   // ← correct bucket
      .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(fileName);
    const avatar_url = data.publicUrl;

    // Persist to profile
    await supabaseAdmin.from("profiles").update({ avatar_url }).eq("id", user_id);

    return NextResponse.json({ success: true, avatar_url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
