import { createAdminClient } from "@insforge/sdk";
import { insforge } from "./insforge";

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL!;
const apiKey = process.env.INSFORGE_API_KEY || process.env.INSFORGE_ADMIN_KEY || "";

// Server-side helpers prefer the admin client when an API key is configured.
// Falling back to the anon client keeps local development usable, but RLS-heavy
// background jobs still report a clear missing-key error before writing data.
export const insforgeAdmin = apiKey
  ? createAdminClient({
    baseUrl,
    apiKey,
  })
  : insforge;

export const hasInsforgeAdminKey = Boolean(apiKey);
