// supabase/functions/create-or-update-event/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { v4 as uuidv4 } from 'https://esm.sh/uuid@8.3.2';

// 预期的请求体结构 (部分字段变为可选)
interface EventPayload {
  sheet_row_id: string;
  created_at: string | null;
  category?: string; // 可选
  title: string;
  status: string;
  priority: string;
  start_time: string | null;
  end_time: string | null;
  recurring_rule?: string; // 可选
  owner: string;
  description: string;
  project_name?: string; // 新增，可选
  project_phase?: string; // 新增，可选
}

const API_KEY_SECRET = Deno.env.get('AURA_FLOW_API_KEY');
const TABLE_NAME = 'events';

// 单个事件的处理函数
async function processEvent(supabase, event: EventPayload) {
  try {
    // 清理空的日期字段
    event.created_at = event.created_at || null;
    event.start_time = event.start_time || null;
    event.end_time = event.end_time || null;

    const dataToUpsert = {
      ...event,
      source_id: `google_sheet:${event.sheet_row_id}`,
      event_uid: uuidv4(),
    };

    const { data: existing } = await supabase
      .from(TABLE_NAME)
      .select('event_uid')
      .eq('sheet_row_id', event.sheet_row_id)
      .single();

    if (existing) {
      const { error } = await supabase
        .from(TABLE_NAME)
        .update(event)
        .eq('sheet_row_id', event.sheet_row_id)
        .select('event_uid')
        .single();
      if (error) throw error;
      return { sheet_row_id: event.sheet_row_id, success: true, event_uid: existing.event_uid };
    } else {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(dataToUpsert)
        .select('event_uid')
        .single();
      if (error) throw error;
      return { sheet_row_id: event.sheet_row_id, success: true, event_uid: data.event_uid };
    }
  } catch (error) {
    console.error(`Error processing ${event.sheet_row_id}:`, error);
    return { sheet_row_id: event.sheet_row_id, success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }});
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!API_KEY_SECRET || `Bearer ${API_KEY_SECRET}` !== authorization) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let results;
    if (Array.isArray(payload)) {
      const promises = payload.map(event => processEvent(supabase, event));
      results = await Promise.all(promises);
    } else {
      results = [await processEvent(supabase, payload)];
    }

    return new Response(JSON.stringify({ results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('General error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});