import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";
import { GoogleGenAI } from "@google/genai";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (id) {
      const { data, error } = await insforge.database
        .from("generated_briefings")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
      return NextResponse.json(data);
    } else {
      const { data, error } = await insforge.database
        .from("generated_briefings")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }
  } catch (err: any) {
    console.error("Error in GET /api/briefings:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, scheduleId } = await req.json();
    const origin = req.nextUrl.origin;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    let scheduleName = `Daily Briefing — ${format(new Date(), "MMM d, yyyy")}`;
    let scheduleDesc = "Your daily communication digest and action items summary.";
    let categories = ["email", "messages", "mentions", "tasks", "follow_ups"];
    let apps = ["gmail", "whatsapp"];

    // 1. Load custom schedule config if provided
    if (scheduleId) {
      const { data: schedule } = await insforge.database
        .from("briefing_schedules")
        .select("*")
        .eq("id", scheduleId)
        .maybeSingle();

      if (schedule) {
        scheduleName = schedule.name;
        scheduleDesc = schedule.description || scheduleDesc;
        categories = schedule.categories?.length ? schedule.categories : categories;
        apps = schedule.apps?.length ? schedule.apps : apps;
      }
    }

    // 2. Fetch user's connected integrations
    const { data: userRow } = await insforge.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    const integrations = userRow?.integrations || {};
    const hasGmail = !!integrations.gmail?.connected;
    const hasWhatsApp = !!integrations.whatsapp?.connected;

    let gmailMessages: any[] = [];
    let whatsappMessages: any[] = [];
    let connectedAppsUsed: string[] = [];

    // 3. Fetch real Gmail data
    if (apps.includes("gmail") && hasGmail) {
      try {
        const gmailRes = await fetch(`${origin}/api/gmail-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "gmail_list_messages",
            params: { q: "label:inbox is:unread", maxResults: 15 },
            userId
          })
        });
        if (gmailRes.ok) {
          const resJson = await gmailRes.json();
          const text = resJson.result?.content?.[0]?.text;
          if (text) {
            gmailMessages = JSON.parse(text).messages || [];
            if (gmailMessages.length > 0) connectedAppsUsed.push("Gmail");
          }
        }
        console.log(`[Briefings] Fetched ${gmailMessages.length} Gmail messages`);
      } catch (e) {
        console.error("[Briefings] Gmail fetch failed:", e);
      }
    }

    // 4. Fetch real WhatsApp data
    if (apps.includes("whatsapp") && hasWhatsApp) {
      try {
        const waRes = await fetch(`${origin}/api/whatsapp-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "whatsapp_get_recent_messages",
            userId
          })
        });
        if (waRes.ok) {
          const resJson = await waRes.json();
          const text = resJson.result?.content?.[0]?.text;
          if (text) {
            whatsappMessages = JSON.parse(text).messages || [];
            if (whatsappMessages.length > 0) connectedAppsUsed.push("WhatsApp");
          }
        }
        console.log(`[Briefings] Fetched ${whatsappMessages.length} WhatsApp messages`);
      } catch (e) {
        console.error("[Briefings] WhatsApp fetch failed:", e);
      }
    }

    const hasAnyData = gmailMessages.length > 0 || whatsappMessages.length > 0;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    // 5. Generate with Gemini using real data
    if (geminiApiKey && hasAnyData) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        const prompt = `You are Orbit, an AI personal assistant. Analyze the following real communications fetched from the user's connected apps and produce a structured intelligence briefing.

Briefing: "${scheduleName}"
Goal: ${scheduleDesc}
Date: ${format(new Date(), "EEEE, MMMM d, yyyy")}
Time: ${format(new Date(), "h:mm a")}
Connected apps with data: ${connectedAppsUsed.join(", ")}
Categories to include: ${categories.join(", ")}

--- REAL GMAIL INBOX (${gmailMessages.length} messages) ---
${JSON.stringify(gmailMessages, null, 2)}

--- REAL WHATSAPP MESSAGES (${whatsappMessages.length} messages) ---
${JSON.stringify(whatsappMessages, null, 2)}

Analyze the REAL data above carefully. Produce a valid JSON briefing:
{
  "title": "Short, descriptive title based on today's actual messages (e.g. 'Q2 Review & Budget Follow-ups — Jun 8')",
  "summary": "2-3 sentence executive summary of the most important updates from the real data above",
  "stats": {
    "email": <count of actual email items>,
    "messages": <count of actual message items>,
    "mentions": <count of actual mention items>,
    "tasks": <count of extracted tasks>,
    "follow_ups": <count of follow-up items>
  },
  "data": {
    "email": [{ "id": "string", "app": "gmail", "from": "string", "subject": "string", "snippet": "string", "time": "string", "body": "string" }],
    "messages": [{ "id": "string", "app": "whatsapp", "from": "string", "snippet": "string", "time": "string", "body": "string" }],
    "mentions": [{ "id": "string", "app": "string", "from": "string", "snippet": "string", "time": "string", "body": "string" }],
    "tasks": [{ "id": "string", "app": "string", "title": "string", "description": "string", "time": "string", "priority": "High" | "Medium" | "Low" }],
    "follow_ups": [{ "id": "string", "app": "string", "title": "string", "description": "string", "time": "string" }]
  }
}

RULES:
- Base ALL content ONLY on the real data provided above — do NOT invent anything
- Extract tasks from any message containing action items, deadlines or requests
- Extract follow-ups from conversations that need a response or follow-through
- Only populate categories that were requested: ${categories.join(", ")}
- Return valid JSON only`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const textResponse = response.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          const { data, error } = await insforge.database
            .from("generated_briefings")
            .insert({
              user_id: userId,
              schedule_id: scheduleId || null,
              title: parsed.title || scheduleName,
              summary: parsed.summary || "",
              stats: parsed.stats || {},
              data: parsed.data || {}
            })
            .select()
            .single();

          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          console.log(`[Briefings] AI briefing generated and saved: ${parsed.title}`);
          return NextResponse.json(data);
        }
      } catch (aiError: any) {
        console.error("[Briefings] Gemini generation failed:", aiError.message);
        // Fall through to raw data save below
      }
    }

    // 6. If Gemini fails or no key — save the  raw fetched data with a basic summary
    // Still only save REAL data, not fabricated mock content
    const emailItems = gmailMessages.map((msg: any, i: number) => ({
      id: msg.id || `email_${i}`,
      app: "gmail",
      from: msg.from || "Unknown",
      subject: msg.subject || "No Subject",
      snippet: msg.snippet || "",
      time: msg.date ? format(new Date(msg.date), "h:mm a") : "",
      body: msg.body || msg.snippet || ""
    }));

    const messageItems = whatsappMessages.map((msg: any, i: number) => ({
      id: `wa_${i}`,
      app: msg.app || "whatsapp",
      from: msg.from || msg.chatName || "Unknown",
      snippet: msg.body || "",
      time: msg.timestamp ? format(new Date(msg.timestamp), "h:mm a") : "",
      body: msg.body || ""
    }));

    const noGeminiTitle = hasAnyData
      ? `${scheduleName}`
      : `${scheduleName} — No new activity`;

    const noGeminiSummary = hasAnyData
      ? `${emailItems.length} email${emailItems.length !== 1 ? "s" : ""} and ${messageItems.length} message${messageItems.length !== 1 ? "s" : ""} from your connected apps. Review the categories below for details.`
      : "No new messages or emails found in your connected apps at this time.";

    if (!hasGmail && !hasWhatsApp) {
      return NextResponse.json(
        { error: "No connected apps. Please connect Gmail or WhatsApp from Integrations." },
        { status: 400 }
      );
    }

    const { data: dbData, error: dbError } = await insforge.database
      .from("generated_briefings")
      .insert({
        user_id: userId,
        schedule_id: scheduleId || null,
        title: noGeminiTitle,
        summary: noGeminiSummary,
        stats: {
          email: emailItems.length,
          messages: messageItems.length,
          mentions: 0,
          tasks: 0,
          follow_ups: 0
        },
        data: {
          email: emailItems,
          messages: messageItems,
          mentions: [],
          tasks: [],
          follow_ups: []
        }
      })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json(dbData);

  } catch (err: any) {
    console.error("Error in POST /api/briefings:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
