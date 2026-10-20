import { createClient } from "@/lib/supabase/server";

export type SyncContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  businessId: string;
  deviceCode: string;
};

export type SyncContextResult =
  | { context: SyncContext; response?: never }
  | { context?: never; response: Response };

export async function getSyncContext(
  deviceCode: unknown
): Promise<SyncContextResult> {
  if (typeof deviceCode !== "string" || deviceCode.length === 0) {
    return {
      response: Response.json({ error: "Cihaz kodu zorunludur." }, { status: 400 }),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      response: Response.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("Eşitleme için kullanıcı işletmesi bulunamadı:", profileError?.message);
    return {
      response: Response.json({ error: "Kullanıcı işletmesi bulunamadı." }, { status: 403 }),
    };
  }

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id")
    .eq("business_id", profile.business_id)
    .eq("user_id", user.id)
    .eq("device_code", deviceCode)
    .eq("is_active", true)
    .maybeSingle();

  if (deviceError) {
    console.error("Eşitleme cihazı doğrulanamadı:", deviceError.message);
    return {
      response: Response.json({ error: "Cihaz doğrulanamadı." }, { status: 500 }),
    };
  }

  if (!device) {
    return {
      response: Response.json(
        { error: "Bu cihaz kayıtlı değil veya iptal edilmiş." },
        { status: 403 }
      ),
    };
  }

  return {
    context: {
      supabase,
      userId: user.id,
      businessId: profile.business_id,
      deviceCode,
    },
  };
}
