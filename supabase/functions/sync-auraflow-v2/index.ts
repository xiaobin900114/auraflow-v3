// Import necessary libraries
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// 【最终修复】重新引入 uuid 库，以确保在函数内部可靠地生成 UID
import { v4 as uuidv4 } from 'https://esm.sh/uuid@8.3.2';
import { corsHeaders } from '../_shared/cors.ts';

// Main function entry point
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. 认证 ---
    const authorization = req.headers.get('Authorization');
    const AURA_FLOW_API_KEY = Deno.env.get('AURA_FLOW_API_KEY');

    if (!AURA_FLOW_API_KEY || authorization !== `Bearer ${AURA_FLOW_API_KEY}`) {
      return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // --- 2. 初始化 Supabase 客户端 ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // --- 3. 解析来自 Google Sheet 的数据 ---
    const { project, tasks } = await req.json();
    let projectId = null;
    const taskResults = [];

    // --- 4. 处理项目信息 (如果存在) ---
    if (project && project.spreadsheet_id) {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .upsert(project, { onConflict: 'spreadsheet_id' })
        .select('id')
        .single();

      if (projectError) throw projectError;
      projectId = projectData.id;
    }

    // --- 5. 使用串行循环处理任务 ---
    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        const { sheet_row_id, ...taskData } = task;
        
        if (projectId) {
          taskData.project_id = projectId;
        }

        let eventUid = taskData.event_uid;
        let success = false;

        try {
          if (taskData.event_uid) {
            // 更新 (UPDATE) 逻辑
            const { error: updateError } = await supabase
              .from('events')
              .update(taskData)
              .eq('event_uid', taskData.event_uid);
            if (updateError) throw updateError;
          } else {
            // --- 【核心修复】插入 (INSERT) 逻辑 ---
            // 1. 在函数内部明确地、主动地生成一个新的、唯一的 event_uid
            const newUid = uuidv4();
            
            // 2. 将这个新生成的 uid 添加到要插入的数据中
            const dataToInsert = { ...taskData, event_uid: newUid };
            
            // 3. 将包含新 uid 的完整数据插入数据库。不再需要 .select()，因为我们已经有 uid 了。
            const { error: insertError } = await supabase
              .from('events')
              .insert(dataToInsert);

            if (insertError) throw insertError;
            
            // 4. 将我们自己生成的 uid 用于返回结果
            eventUid = newUid;
          }
          success = true;
        } catch (taskError) {
          console.error(`处理任务时出错 (sheet_row_id: ${sheet_row_id}):`, taskError.message);
          success = false; 
        }
        
        taskResults.push({
          success: success,
          rowNum: sheet_row_id ? parseInt(sheet_row_id.split(':').pop()) : null,
          event_uid: eventUid
        });
      }
    }

    // --- 6. 返回成功的响应 ---
    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'Sync processed.',
        taskResults: taskResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    // --- 7. 处理全局错误 ---
    console.error('全局同步错误:', error.message);
    return new Response(
      JSON.stringify({ status: 'error', message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
