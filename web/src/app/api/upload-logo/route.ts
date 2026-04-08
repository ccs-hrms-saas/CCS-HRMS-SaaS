import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { image_base64 } = await req.json();
    if (!image_base64) {
      return NextResponse.json({ error: "Missing image_base64" }, { status: 400 });
    }

    const clean  = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
    const bytes  = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
    const blob   = new Blob([bytes], { type: "image/png" });
    const fileName = `logo_${Date.now()}.png`;

    // Ensure bucket exists (will silently succeed if already exists)
    await supabaseAdmin.storage.createBucket("app-branding", { public: true }).catch(() => {});

    const { error } = await supabaseAdmin.storage
      .from("app-branding")
      .upload(fileName, blob, { contentType: "image/png", upsert: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabaseAdmin.storage.from("app-branding").getPublicUrl(fileName);
    const logo_url = data.publicUrl;

    // Save to app_settings
    const { data: existing } = await supabaseAdmin.from("app_settings").select("id").limit(1).single();
    if (existing?.id) {
      await supabaseAdmin.from("app_settings").update({ logo_url, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("app_settings").insert({ logo_url });
    }

    return NextResponse.json({ success: true, logo_url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
