import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { insforge } from "@/lib/insforge";
import { GoogleGenAI } from "@google/genai";

const MOCK_BRIEF_DATA = {
  stats: {
    importantCount: 3,
    priorityCount: 2,
    followUpCount: 1
  },
  brief: [
    {
      id: "b1",
      app: "gmail",
      type: "Gmail Digest",
      title: "Q2 Budget Review",
      summary: "Sarah requested a final review of the Q2 budget proposal with a proposed 10% marketing spend adjustment.",
      time: "12m ago",
      action: "Review proposal"
    },
    {
      id: "b2",
      app: "whatsapp",
      type: "WhatsApp Digest",
      title: "Co-Founder Sync",
      summary: "Alex wants to meet for coffee tomorrow at 4:30 PM to align on tech roadmap milestones.",
      time: "45m ago",
      action: "Check schedule"
    }
  ],
  priorityItems: [
    {
      id: "p1",
      app: "gmail",
      title: "Submit Q2 Slides to John",
      time: "Due 4:45 PM today",
      description: "Send final compiled roadmap and budget presentation slides.",
      priority: "High"
    },
    {
      id: "p2",
      app: "whatsapp",
      title: "Coffee with Alex",
      time: "Tomorrow 4:30 PM",
      description: "Discuss tech milestones and next deployment roadmap.",
      priority: "Medium"
    }
  ]
};

export async function POST(req: NextRequest) {
  try {
    const { userId, forceRegenerate } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // 1. Fetch user integrations and cached brief from database
    const { data: dbUser, error: dbError } = await insforge.database
      .from("users")
      .select("integrations, dashboard_brief")
      .eq("id", userId)
      .maybeSingle();

    if (dbError || !dbUser) {
      return NextResponse.json({ error: "User not found or database error" }, { status: 404 });
    }

    // 2. Check if cached brief is valid (less than 2 hours old)
    const cachedBrief = dbUser.dashboard_brief as any;
    if (!forceRegenerate && cachedBrief && cachedBrief.generatedAt) {
      const ageMs = Date.now() - new Date(cachedBrief.generatedAt).getTime();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      if (ageMs < twoHoursMs) {
        return NextResponse.json({
          ...cachedBrief,
          isFromCache: true
        });
      }
    }

    const integrations = dbUser?.integrations || {};
    const isGmailConnected = !!integrations.gmail?.connected;
    const isWhatsAppConnected = !!integrations.whatsapp?.connected;

    const origin = req.nextUrl.origin;

    let gmailMessages: any[] = [];
    let whatsappMessages: any[] = [];

    // 3. Fetch Gmail data if connected
    if (isGmailConnected) {
      try {
        const gmailRes = await fetch(`${origin}/api/gmail-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "gmail_list_messages",
            params: { q: "label:inbox", maxResults: 5 }, // limit results for speed
            userId
          })
        });

        if (gmailRes.ok) {
          const data = await gmailRes.json();
          const text = data.result?.content?.[0]?.text;
          if (text) {
            gmailMessages = JSON.parse(text).messages || [];
          }
        }
      } catch (e) {
        console.error("Error fetching Gmail messages in dashboard brief API:", e);
      }
    }

    // 4. Fetch WhatsApp data if connected
    if (isWhatsAppConnected) {
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
          const data = await waRes.json();
          const text = data.result?.content?.[0]?.text;
          if (text) {
            whatsappMessages = JSON.parse(text).messages || [];
          }
        }
      } catch (e) {
        console.error("Error fetching WhatsApp messages in dashboard brief API:", e);
      }
    }

    // 5. Generate with Gemini if Key is available and at least one app is connected
    const hasApiKey = !!process.env.GEMINI_API_KEY;
    const hasData = gmailMessages.length > 0 || whatsappMessages.length > 0;

    if (hasApiKey && hasData) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const systemPrompt = `You are an advanced AI personal assistant named OmniSync.
Analyze the following recent email and chat communications.
Generate a structured intelligence briefing for the user's dashboard today.
The current local time is: ${new Date().toISOString()} (${format(new Date(), "EEEE")}).

Connected communications data:
Gmail messages:
${JSON.stringify(gmailMessages.slice(0, 3), null, 2)}

WhatsApp messages:
${JSON.stringify(whatsappMessages.slice(0, 3), null, 2)}

Produce a valid JSON object matching this schema:
{
  "stats": {
    "importantCount": number,
    "priorityCount": number,
    "followUpCount": number
  },
  "brief": [
    {
      "id": string,
      "app": "gmail" | "whatsapp",
      "type": "Gmail Digest" | "WhatsApp Digest",
      "title": string,
      "summary": string,
      "time": string,
      "action": string
    }
  ],
  "priorityItems": [
    {
      "id": string,
      "app": "gmail" | "whatsapp",
      "title": string,
      "time": string,
      "description": string,
      "priority": "High" | "Medium" | "Low"
    }
  ]
}

CRITICAL FOR SPEED AND USER EXPERIENCE:
1. Make all summary and description fields extremely short and quick (strictly under 10-12 words).
2. Generate concise, quick bullet-style sentences.
3. Priority count, important count, and followUp count should match the number of relevant tasks identified from the messages.
4. Output must generate within 1-2 seconds. Make it snappy and direct.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: systemPrompt,
          config: {
            responseMimeType: "application/json"
          }
        });

        const textResponse = response.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          const newBriefData = {
            ...parsed,
            generatedAt: new Date().toISOString(),
            isSimulated: false
          };

          // Save to database
          await insforge.database
            .from("users")
            .update({ dashboard_brief: newBriefData })
            .eq("id", userId);

          return NextResponse.json(newBriefData);
        }
      } catch (aiError) {
        console.error("Gemini generation failed, falling back to mockup:", aiError);
      }
    }

    // 6. Fallback Mock Data (High-fidelity previews representing connected state)
    const customMockData = JSON.parse(JSON.stringify(MOCK_BRIEF_DATA));
    
    if (isGmailConnected || isWhatsAppConnected) {
      if (!isGmailConnected) {
        customMockData.brief = customMockData.brief.filter((b: any) => b.app !== "gmail");
        customMockData.priorityItems = customMockData.priorityItems.filter((p: any) => p.app !== "gmail");
      }
      if (!isWhatsAppConnected) {
        customMockData.brief = customMockData.brief.filter((b: any) => b.app !== "whatsapp");
        customMockData.priorityItems = customMockData.priorityItems.filter((p: any) => p.app !== "whatsapp");
      }
      
      customMockData.stats.importantCount = customMockData.brief.length + customMockData.priorityItems.length;
      customMockData.stats.priorityCount = customMockData.priorityItems.filter((p: any) => p.priority === "High").length;
      customMockData.stats.followUpCount = customMockData.brief.filter((b: any) => b.action.toLowerCase().includes("check") || b.action.toLowerCase().includes("sync")).length;
    }

    const savedBriefData = {
      ...customMockData,
      generatedAt: new Date().toISOString(),
      isSimulated: true,
      warn: !hasApiKey ? "GEMINI_API_KEY env var missing. Running in simulated fallback mode." : undefined
    };

    // Save mock configuration/preview to database so we don't query it repeatedly
    await insforge.database
      .from("users")
      .update({ dashboard_brief: savedBriefData })
      .eq("id", userId);

    return NextResponse.json(savedBriefData);

  } catch (err: any) {
    console.error("Error in dashboard-brief API:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
