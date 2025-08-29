// 导入必要的库
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// 主函数入口
Deno.serve(async (req) => {
  // 处理 CORS 预检请求
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

    // --- 3. 解析传入的数据 ---
    const { project, tasks } = await req.json();
    
    // 【新增】增加详细的日志记录，以便在 Supabase 后台查看收到的确切数据
    // 这对于调试非常重要，可以看到 Google Sheet 发送过来的原始数据结构。
    console.log("Received sync request. Processing payload:", JSON.stringify({ project, tasks }, null, 2));

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
      
      if (!projectData) {
        throw new Error('Failed to upsert project, no data returned from database.');
      }
      projectId = projectData.id;
    }

    // --- 5. 批量处理任务 (如果存在) ---
    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        const { sheet_row_id, ...taskData } = task;
        
        if (projectId) {
          taskData.project_id = projectId;
        }

        let eventUid = taskData.event_uid;
        let success = false;
        let errorMessage = null;

        try {
          if (taskData.event_uid) {
            // --- 更新现有任务 ---
            const { event_uid, ...updateData } = taskData;
            const { error: updateError } = await supabase
              .from('events')
              .update(updateData)
              .eq('event_uid', event_uid);
              
            if (updateError) throw updateError;

          } else {
            // --- 创建新任务 ---
            const newUid = crypto.randomUUID();
            taskData.event_uid = newUid;
            eventUid = newUid; 

            const { error: insertError } = await supabase
              .from('events')
              .insert(taskData);

            if (insertError) throw insertError;
          }
          success = true;

        } catch (taskError) {
          console.error('Task processing error:', taskError.message);
          success = false; 
          errorMessage = taskError.message;
        }
        
        taskResults.push({
          success: success,
          rowNum: sheet_row_id ? parseInt(sheet_row_id.split(':').pop()) : null,
          event_uid: eventUid,
          error: errorMessage,
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
    console.error('Global sync error:', error.message);
    return new Response(
      JSON.stringify({ status: 'error', message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
