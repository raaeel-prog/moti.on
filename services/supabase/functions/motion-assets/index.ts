// Moti.on stock media endpoint. Deno (Supabase Edge Functions).
// Provider keys are function secrets set by services/supabase/scripts/assets-setup.mjs.
import { createAssetsHandler } from "./handler.ts";

Deno.serve(createAssetsHandler({ env: Deno.env.toObject(), fetch }));
