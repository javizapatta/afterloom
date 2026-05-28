import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ejsmojbqmarwctwdzhui.supabase.co";

const supabaseKey = "sb_publishable_beEJXVIIeI4vypuF5HqKcQ_DadswY_E";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);