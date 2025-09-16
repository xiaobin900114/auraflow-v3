import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const webhookUrl = Deno.env.get('WEBHOOK_V2_URL');
const webhookSecret = Deno.env.get('GOOGLE_SCRIPT_SECRET_TOKEN');

const requiredFields = [
  'title',
  'status',
  'priority',
  'project_id',
  'spreadsheet_id',
  'sheet_gid',
];

const errorResponse = (message: string, status = 400) =>
  new Response(JSON.stringify({ status: 'error', message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header.', 401);
    }

    let payload;
    try {
      payload = await req.json();
    } catch (_) {
      return errorResponse('Invalid JSON payload.');
    }

    const missing = requiredFields.filter((field) => {
      const value = payload?.[field];
      return value === undefined || value === null || value === '';
    });
    if (missing.length) {
      return errorResponse(`Missing required fields: ${missing.join(', ')}`);
    }

    if (!webhookUrl || !webhookSecret) {
      return errorResponse('Server is missing Google Sheet webhook configuration.', 500);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { error: authError } = await authClient.auth.getUser();
    if (authError) {
      console.error('[create-event-with-sheet] auth error', authError);
      return errorResponse('Invalid or expired token.', 401);
    }

    const eventUid = crypto.randomUUID();
    const insertPayload: Record<string, unknown> = {
      title: payload.title,
      status: payload.status,
      priority: payload.priority,
      owner: payload.owner ?? null,
      description: payload.description ?? null,
      start_time: payload.start_time ?? null,
      end_time: payload.end_time ?? null,
      project_id: payload.project_id,
      category: payload.category ?? null,
      spreadsheet_id: payload.spreadsheet_id,
      sheet_gid: payload.sheet_gid,
      sheet_row_id: null,
      event_uid: eventUid,
    };

    const sanitizedInsert = Object.fromEntries(
      Object.entries(insertPayload).filter(([, value]) => value !== undefined)
    );

    const { data: insertedEvent, error: insertError } = await serviceClient
      .from('events')
      .insert(sanitizedInsert)
      .select('*')
      .single();

    if (insertError || !insertedEvent) {
      console.error('[create-event-with-sheet] insert error', insertError);
      return errorResponse(insertError?.message ?? 'Failed to create event.', 500);
    }

    const sheetPayload = {
      secret: webhookSecret,
      action: 'CREATE',
      spreadsheet_id: payload.spreadsheet_id,
      sheet_gid: payload.sheet_gid,
      data: {
        event_uid: eventUid,
        title: insertedEvent.title,
        status: insertedEvent.status,
        priority: insertedEvent.priority,
        owner: insertedEvent.owner,
        description: insertedEvent.description,
        start_time: insertedEvent.start_time,
        end_time: insertedEvent.end_time,
        category: insertedEvent.category,
        created_at: insertedEvent.created_at,
        spreadsheet_id: insertedEvent.spreadsheet_id,
        sheet_gid: insertedEvent.sheet_gid,
        sync_status: 'synced',
      },
    };

    try {
      const sheetResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetPayload),
      });

      const sheetText = await sheetResponse.text();
      let sheetResult: Record<string, unknown> = {};
      try {
        sheetResult = JSON.parse(sheetText);
      } catch (_) {
        sheetResult = { raw: sheetText };
      }

      if (!sheetResponse.ok || !sheetResult?.success) {
        console.error('[create-event-with-sheet] sheet error', {
          status: sheetResponse.status,
          statusText: sheetResponse.statusText,
          result: sheetResult,
        });
        await serviceClient.from('events').delete().eq('id', insertedEvent.id);
        return errorResponse(
          (sheetResult?.error as string) || sheetResponse.statusText || 'Failed to append to Google Sheet.',
          502,
        );
      }

      const sheetRowId = (sheetResult.sheet_row_id as string) ?? null;
      let finalEvent = insertedEvent;

      if (sheetRowId) {
        const { data: updatedEvent, error: updateError } = await serviceClient
          .from('events')
          .update({ sheet_row_id: sheetRowId })
          .eq('id', insertedEvent.id)
          .select('*')
          .single();

        if (updateError) {
          console.error('[create-event-with-sheet] update sheet_row_id error', updateError);
        } else if (updatedEvent) {
          finalEvent = updatedEvent;
        }
      }

      return new Response(
        JSON.stringify({ status: 'success', event: finalEvent, sheet: sheetResult }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    } catch (sheetError) {
      console.error('[create-event-with-sheet] unexpected sheet error', sheetError);
      await serviceClient.from('events').delete().eq('id', insertedEvent.id);
      return errorResponse('Unexpected error when contacting Google Sheet.', 502);
    }
  } catch (error) {
    console.error('[create-event-with-sheet] unexpected error', error);
    return errorResponse('Unexpected server error.', 500);
  }
});
