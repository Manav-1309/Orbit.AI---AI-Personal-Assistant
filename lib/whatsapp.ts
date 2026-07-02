/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/rules-of-hooks */
import makeWASocket, {
  DisconnectReason,
  ConnectionState
} from "@whiskeysockets/baileys";
import { useInsForgeAuthState, clearInsForgeAuthState } from "@/lib/useInsForgeAuthState";
import pino from "pino";
import path from "path";
import fs from "fs";
import { insforge } from "@/lib/insforge";

export interface Chat {
  id: string;
  name?: string;
  unreadCount?: number;
}

export interface Message {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
  };
  messageTimestamp: number;
}

export interface Contact {
  id: string;
  name?: string;
  phone?: string;
}

export class WhatsAppStore {
  private userId: string;
  private storePath: string;

  public chats: Chat[] = [];
  public messages: Record<string, Message[]> = {};
  public contacts: Record<string, Contact> = {};

  constructor(userId: string, sessionDir: string) {
    this.userId = userId;
    this.storePath = path.join(sessionDir, "store.json");
    this.load();
  }

  private load() {
    if (fs.existsSync(this.storePath)) {
      try {
        const raw = fs.readFileSync(this.storePath, "utf-8");
        const data = JSON.parse(raw);
        this.chats = data.chats || [];
        this.messages = data.messages || {};
        this.contacts = data.contacts || {};
      } catch (e) {
        console.error("Failed to load WhatsApp store from file:", e);
      }
    }
  }

  public save() {
    try {
      const data = {
        chats: this.chats,
        messages: this.messages,
        contacts: this.contacts
      };
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save WhatsApp store to file:", e);
    }
  }

  public bind(ev: any) {
    ev.on("messaging-history.set", ({ chats, messages, contacts }: any) => {
      if (chats) {
        chats.forEach((chat: any) => {
          const index = this.chats.findIndex(c => c.id === chat.id);
          if (index !== -1) {
            this.chats[index] = { ...this.chats[index], ...chat };
          } else {
            this.chats.push(chat);
          }
        });
      }

      if (messages) {
        messages.forEach(async (msg: any) => {
          const chatId = msg.key.remoteJid;
          if (chatId) {
            if (!this.messages[chatId]) {
              this.messages[chatId] = [];
            }
            const index = this.messages[chatId].findIndex(m => m.key.id === msg.key.id);
            if (index !== -1) {
              this.messages[chatId][index] = { ...this.messages[chatId][index], ...msg };
            } else {
              this.messages[chatId].push(msg);
            }
            if (this.messages[chatId].length > 100) {
              this.messages[chatId] = this.messages[chatId].slice(-100);
            }
            try {
              await insforge.database
                .from("whatsapp_messages")
                .upsert({
                  user_id: this.userId,
                  chat_id: chatId,
                  message_id: msg.key.id,
                  sender: msg.pushName ?? "",
                  body:
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    "",
                  from_me: msg.key.fromMe,
                  timestamp: new Date(Number(msg.messageTimestamp) * 1000),
                  push_name: msg.pushName ?? ""
                });
            } catch (err) {
              console.error("Failed to save WhatsApp history:", err);
            }
          }
        });
      }

      if (contacts) {
        contacts.forEach((contact: any) => {
          this.contacts[contact.id] = { ...this.contacts[contact.id], ...contact };
        });
      }
      this.save();
    });

    ev.on("chats.upsert", (newChats: any[]) => {
      newChats.forEach((chat: any) => {
        const index = this.chats.findIndex(c => c.id === chat.id);
        if (index !== -1) {
          this.chats[index] = { ...this.chats[index], ...chat };
        } else {
          this.chats.push(chat);
        }
      });
      this.save();
    });

    


    ev.on("chats.update", (updates: any[]) => {
      updates.forEach((update: any) => {
        const index = this.chats.findIndex(c => c.id === update.id);
        if (index !== -1) {
          this.chats[index] = { ...this.chats[index], ...update };
        }
      });
      this.save();
    });

    ev.on("messages.upsert", ({ messages: newMsgs, type }: any) => {
      if (type === "notify" || type === "append") {
        newMsgs.forEach(async (msg: any) => {
          const chatId = msg.key.remoteJid;
          if (chatId) {
            if (!this.messages[chatId]) {
              this.messages[chatId] = [];
            }
            const index = this.messages[chatId].findIndex(m => m.key.id === msg.key.id);
            if (index !== -1) {
              this.messages[chatId][index] = { ...this.messages[chatId][index], ...msg };
            } else {
              this.messages[chatId].push(msg);
            }
            if (this.messages[chatId].length > 100) {
              this.messages[chatId] = this.messages[chatId].slice(-100);
            }

            try {
              await insforge.database
                .from("whatsapp_messages")
                .upsert({
                  user_id: this.userId,
                  chat_id: chatId,
                  message_id: msg.key.id,
                  sender: msg.pushName ?? "",
                  body:
                    msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    "",
                  from_me: msg.key.fromMe,
                  timestamp: new Date(Number(msg.messageTimestamp) * 1000),
                  push_name: msg.pushName ?? ""
                });
            } catch (err) {
              console.error("Failed to save WhatsApp message:", err);
            }

            const chatIndex = this.chats.findIndex(c => c.id === chatId);
            if (chatIndex === -1) {
              this.chats.push({ id: chatId, name: msg.pushName || chatId });
            }
          }
        });
        this.save();
      }
    });

    ev.on("contacts.upsert", (newContacts: any[]) => {
      newContacts.forEach((contact: any) => {
        this.contacts[contact.id] = { ...this.contacts[contact.id], ...contact };
      });
      this.save();
    });

    ev.on("contacts.update", (updates: any[]) => {
      updates.forEach((update: any) => {
        if (update.id) {
          this.contacts[update.id] = { ...this.contacts[update.id], ...update };
        }
      });
      this.save();
    });
  }
}

export interface WhatsAppSession {
  sock: any;
  store: WhatsAppStore;
  status: "disconnected" | "connecting" | "connected";
  pairingCode?: string;
  phoneNumber?: string;
}

// Global mapping to survive Next.js hot-reloads
const globalForWhatsApp = global as unknown as {
  whatsappSessions?: Record<string, WhatsAppSession>;
};

if (!globalForWhatsApp.whatsappSessions) {
  globalForWhatsApp.whatsappSessions = {};
}

export const whatsappSessions = globalForWhatsApp.whatsappSessions;

const SESSION_DIR_BASE = process.env.WHATSAPP_SESSION_DIR
  ? path.join(process.env.WHATSAPP_SESSION_DIR)
  : path.join(process.cwd(), ".whatsapp-sessions");

export function getSessionDir(userId: string) {
  const dir = path.join(SESSION_DIR_BASE, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getWhatsAppSession(userId: string): WhatsAppSession | undefined {
  return whatsappSessions[userId];
}

async function requestPairingCodeWithRetry(
  userId: string,
  session: WhatsAppSession,
  phoneNumber: string,
) {
  const cleanNumber = phoneNumber.replace(/[^\d]/g, "");

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (whatsappSessions[userId] !== session || session.status === "connected") {
        return;
      }

      const code = await session.sock.requestPairingCode(cleanNumber);

      if (whatsappSessions[userId] === session) {
        session.pairingCode = code;
        console.log(`Generated pairing code for ${cleanNumber}: ${code}`);
      }
      return;
    } catch (err) {
      console.error(`Failed to generate pairing code (attempt ${attempt}/4):`, err);

      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }
}

export async function initWhatsAppConnection(
  userId: string,
  phoneNumber?: string,
  options?: { forceNew?: boolean }
): Promise<WhatsAppSession> {
  const sessionDir = getSessionDir(userId);

  // If already connected/connecting, return it
  if (!options?.forceNew && whatsappSessions[userId]) {
    const session = whatsappSessions[userId];
    if (
      session.status === "connected" ||
      (session.status === "connecting" && (session.pairingCode || !phoneNumber || session.phoneNumber === phoneNumber))
    ) {
      return session;
    }

    delete whatsappSessions[userId];
  }

  const logger = pino({ level: "silent" });
  // Use InsForge DB for credentials — works on ephemeral environments like Render free tier
  const { state, saveCreds } = await useInsForgeAuthState(userId);

  // Setup memory store
  const store = new WhatsAppStore(userId, sessionDir);

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    // Keep WebSocket alive on Render/serverless — prevents 30s idle timeout drops
    keepAliveIntervalMs: 15_000,
    // Longer timeouts for pairing on slow connections
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    // Retry failed queries
    retryRequestDelayMs: 500,
    // Don't emit own events (reduces noise)
    emitOwnEvents: false,
  });

  store.bind(sock.ev);

  const session: WhatsAppSession = {
    sock,
    store,
    status: "connecting",
    phoneNumber,
  };

  whatsappSessions[userId] = session;

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      session.status = "connecting";
    }

    if (connection === "open") {
      session.status = "connected";
      session.pairingCode = undefined;
      console.log(`WhatsApp connected for user ${userId}`);

      try {
        const { data: dbUser } = await insforge.database
          .from("users")
          .select("integrations")
          .eq("id", userId)
          .maybeSingle();

        const currentIntegrations = dbUser?.integrations || {};
        const updatedIntegrations = {
          ...currentIntegrations,
          whatsapp: {
            connected: true,
            phoneNumber: phoneNumber || session.phoneNumber || "",
            isSimulated: false,
            connectedAt: new Date().toISOString()
          }
        };

        await insforge.database
          .from("users")
          .update({ integrations: updatedIntegrations })
          .eq("id", userId);
      } catch (err) {
        console.error("Failed to update database on WhatsApp connected:", err);
      }
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode || (lastDisconnect?.error as any)?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`WhatsApp connection closed for user ${userId}. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        session.status = "connecting";
        session.pairingCode = undefined;

        // 401 = credentials rejected by WhatsApp — clear corrupted creds and stop
        if (statusCode === 401) {
          console.warn(`[WA] 401 Unauthorized for user ${userId} — clearing stored credentials`);
          if (whatsappSessions[userId] === session) {
            delete whatsappSessions[userId];
          }
          clearInsForgeAuthState(userId).catch(console.error);
          return;
        }

        // During pairing, keep session reference alive so UI polling still works
        if (whatsappSessions[userId] === session) {
          delete whatsappSessions[userId];
        }

        // Exponential backoff: 2s → 4s → 8s (max) for production stability
        const delay = Math.min(2000 * Math.pow(2, (session as any)._reconnectAttempts || 0), 8000);
        (session as any)._reconnectAttempts = ((session as any)._reconnectAttempts || 0) + 1;

        setTimeout(() => {
          initWhatsAppConnection(userId, phoneNumber).catch(console.error);
        }, delay);
      } else {
        session.status = "disconnected";
        delete whatsappSessions[userId];

        try {
          const { data: dbUser } = await insforge.database
            .from("users")
            .select("integrations")
            .eq("id", userId)
            .maybeSingle();

          if (dbUser) {
            const currentIntegrations = dbUser.integrations || {};
            const updatedIntegrations = {
              ...currentIntegrations,
              whatsapp: null
            };

            await insforge.database
              .from("users")
              .update({ integrations: updatedIntegrations })
              .eq("id", userId);
          }
        } catch (err) {
          console.error("Failed to update database on WhatsApp logout:", err);
        }
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered && phoneNumber) {
    setTimeout(async () => {
      try {
        if (whatsappSessions[userId] !== session) {
          return;
        }

        await requestPairingCodeWithRetry(userId, session, phoneNumber);
      } catch (err) {
        console.error("Failed to generate pairing code:", err);
      }
    }, 1000);
  }

  return session;
}

export async function disconnectWhatsApp(userId: string) {
  const session = whatsappSessions[userId];
  if (session) {
    try {
      await session.sock.logout();
    } catch (e) {
      console.warn("Error during socket logout:", e);
      try {
        session.sock.end(undefined);
      } catch {
        // Safe fallback
      }
    }
    delete whatsappSessions[userId];
  }

  // Clear credentials from InsForge DB
  await clearInsForgeAuthState(userId).catch(console.error);

  const sessionDir = path.join(SESSION_DIR_BASE, userId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (err) {
      console.error("Failed to delete WhatsApp session directory:", err);
    }
  }

  const { data: dbUser } = await insforge.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (dbUser) {
    const currentIntegrations = dbUser.integrations || {};
    const updatedIntegrations = {
      ...currentIntegrations,
      whatsapp: null
    };

    await insforge.database
      .from("users")
      .update({ integrations: updatedIntegrations })
      .eq("id", userId);
  }
}
