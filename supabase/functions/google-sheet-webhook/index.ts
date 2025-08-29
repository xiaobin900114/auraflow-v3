// supabase/functions/google-sheet-webhook/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// These are read from the secrets you set in Supabase
const WEB_APP_URL = Deno.env.get("GOOGLE_SCRIPT_WEB_APP_URL");
const SECRET_TOKEN = Deno.env.get("GOOGLE_SCRIPT_SECRET_TOKEN");

console.log("Function loaded. Web App URL and Secret Token are set.");

serve(async (req) => {
  // We only expect POST requests from the database trigger
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  
  try {
    // The trigger sends a payload with a 'record' object containing the updated row data
    const { record } = await req.json();
    console.log("Received record:", record);

    // 【核心改造】
    // Build the payload to be sent to the Google Apps Script Web App.
    // We now include the spreadsheet_id from the database record.
    const payload = {
      secret: SECRET_TOKEN,
      event_uid: record.event_uid,
      new_status: record.status,
      spreadsheet_id: record.spreadsheet_id, // <-- 从数据库记录中获取 spreadsheet_id
    };
    
    // 【重要】添加一个健壮性检查，如果 spreadsheet_id 不存在，则中止并报错。
    if (!payload.spreadsheet_id) {
      console.error("Error: Missing spreadsheet_id in the database record. Cannot determine target sheet.");
      throw new Error("Missing spreadsheet_id in the database record.");
    }
    
    console.log("Sending payload to Google Script:", payload);

    // Send the payload to your standalone Google Script Web App
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseData = await res.json();
    
    if (!res.ok || !responseData.success) {
      console.error("Google Script webhook returned an error:", responseData);
      throw new Error(`Google Script webhook failed with status ${res.status}. Response: ${JSON.stringify(responseData)}`);
    }
    
    console.log("Successfully received response from Google Script:", responseData);

    return new Response(JSON.stringify({ success: true, message: "Webhook sent successfully.", gsheet_response: responseData }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error processing webhook:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
