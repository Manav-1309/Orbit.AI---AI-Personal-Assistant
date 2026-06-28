import { createClient } from "@insforge/sdk";

// Browser-safe InsForge client. Only public project values belong here because
// this module is imported by Client Components and API routes.
const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL!;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!;

export const insforge = createClient({
  baseUrl,
  anonKey,
});
