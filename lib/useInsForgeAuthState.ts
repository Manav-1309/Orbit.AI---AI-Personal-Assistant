import { insforge } from "@/lib/insforge";
import { proto } from "@whiskeysockets/baileys";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";

const TABLE = "whatsapp_credentials";

async function readFromDB(userId: string, keyId: string) {
  try {
    const { data, error } = await insforge.database
      .from(TABLE)
      .select("value")
      .eq("user_id", userId)
      .eq("key_id", keyId)
      .maybeSingle();

    if (error || !data?.value) return null;
    return JSON.parse(data.value, BufferJSON.reviver);
  } catch {
    return null;
  }
}

async function writeToDB(userId: string, keyId: string, value: unknown) {
  try {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await insforge.database
      .from(TABLE)
      .upsert(
        {
          user_id: userId,
          key_id: keyId,
          value: serialized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key_id" }
      );
  } catch (err) {
    console.error(`[WA Auth] Failed to write key ${keyId}:`, err);
  }
}

async function deleteFromDB(userId: string, keyId: string) {
  try {
    await insforge.database
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("key_id", keyId);
  } catch (err) {
    console.error(`[WA Auth] Failed to delete key ${keyId}:`, err);
  }
}

export async function useInsForgeAuthState(userId: string) {
  // Load creds or initialize fresh
  const storedCreds = await readFromDB(userId, "creds");
  const creds: ReturnType<typeof initAuthCreds> = storedCreds ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const result: Record<string, unknown> = {};
          await Promise.all(
            ids.map(async (id) => {
              const val = await readFromDB(userId, `${type}-${id}`);
              if (val) {
                // Baileys requires pre-key type to be decoded via proto
                if (type === "pre-key") {
                  result[id] = proto.Message.fromObject(val);
                } else {
                  result[id] = val;
                }
              }
            })
          );
          return result;
        },

        set: async (data: Record<string, Record<string, unknown> | null>) => {
          await Promise.all(
            Object.entries(data).map(async ([type, keyMap]) => {
              if (!keyMap) return;
              await Promise.all(
                Object.entries(keyMap).map(async ([id, value]) => {
                  const keyId = `${type}-${id}`;
                  if (value != null) {
                    await writeToDB(userId, keyId, value);
                  } else {
                    await deleteFromDB(userId, keyId);
                  }
                })
              );
            })
          );
        },
      },
    },

    saveCreds: async () => {
      await writeToDB(userId, "creds", creds);
    },
  };
}

/** Remove all stored credentials for a user (call on disconnect/logout) */
export async function clearInsForgeAuthState(userId: string) {
  try {
    await insforge.database
      .from(TABLE)
      .delete()
      .eq("user_id", userId);
  } catch (err) {
    console.error("[WA Auth] Failed to clear credentials:", err);
  }
}
