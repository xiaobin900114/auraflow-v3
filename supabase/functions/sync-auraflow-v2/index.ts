// === Supabase Edge Function: Google Sheet Sync Endpoint ===
// 这个 Deno 脚本是同步系统的服务端。它作为一个 API 端点，接收来自 Google Apps Script 的数据请求。
// 主要职责包括：
// 1. 验证请求的合法性（CORS 和 API Key）。
// 2. 连接到 Supabase 数据库。
// 3. 解析接收到的项目和任务数据。
// 4. 使用 "upsert" 逻辑处理项目信息（存在则更新，不存在则创建）。
// 5. 遍历任务列表，根据是否存在 'event_uid' 来执行更新或插入操作。
// 6. 为新任务生成 UUID。
// 7. 构造并返回一个包含每个任务处理结果的响应。

// --- 依赖导入 ---
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { v4 as uuidv4 } from 'https://esm.sh/uuid@8.3.2'; // 用于为新任务生成唯一ID
import { corsHeaders } from '../_shared/cors.ts'; // 导入预设的CORS头，用于处理跨域请求

// --- 函数主入口 ---
// Deno.serve 会创建一个 HTTP 服务器来监听和处理请求。
Deno.serve(async (req) => {
  // --- 0. 处理 CORS 预检请求 (Preflight Request) ---
  // 浏览器在发送实际的 POST 请求前，会先发送一个 OPTIONS 请求来询问服务器是否允许跨域。
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. 认证 ---
    // 从请求头中获取 Authorization 信息，用于验证请求来源的合法性。
    const authorization = req.headers.get('Authorization');
    const AURA_FLOW_API_KEY = Deno.env.get('AURA_FLOW_API_KEY'); // 从环境变量中安全地获取 API Key

    // 验证 API Key 是否存在且匹配。
    if (!AURA_FLOW_API_KEY || authorization !== `Bearer ${AURA_FLOW_API_KEY}`) {
      // 如果认证失败，返回 401 Unauthorized 错误。
      return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // --- 2. 初始化 Supabase 客户端 ---
    // 使用从环境变量中获取的 URL 和 Service Role Key 来创建 Supabase 客户端。
    // Service Role Key 拥有最高权限，可以在 Edge Function 中安全地使用以绕过任何 RLS 策略。
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // --- 3. 解析来自 Google Sheet 的 JSON 数据 ---
    const { project, tasks } = await req.json();
    let projectId = null; // 用于存储项目在数据库中的 ID
    const taskResults = []; // 用于收集每个任务的处理结果，并返回给 Apps Script

    // --- 4. 处理项目信息 (如果存在) ---
    if (project && project.spreadsheet_id) {
      // 使用 upsert 操作：如果 `spreadsheet_id` 已存在，则更新记录；否则，插入新记录。
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .upsert(project, { onConflict: 'spreadsheet_id' }) // onConflict 指定了判断冲突的列
        .select('id') // 在操作后，仅查询并返回新记录或已更新记录的 'id'
        .single(); // .single() 确保只返回一条记录

      if (projectError) throw projectError;
      projectId = projectData.id; // 保存项目 ID，用于关联任务
    }

    // --- 5. 串行循环处理任务 ---
    // 使用 for...of 循环来确保任务被一个接一个地处理，避免并发问题和数据库过载。
    if (tasks && tasks.length > 0) {
      for (const task of tasks) {
        // 从任务数据中分离出 sheet_row_id，因为它不是数据库表的字段。
        const { sheet_row_id, ...taskData } = task;
        
        // 如果本次同步包含项目信息，将项目ID关联到每个任务上。
        if (projectId) {
          taskData.project_id = projectId;
        }

        let eventUid = taskData.event_uid;
        let success = false;

        try {
          // --- 判断是更新还是插入 ---
          if (taskData.event_uid) {
            // 更新 (UPDATE) 逻辑: 如果任务数据中已存在 event_uid，说明这是一个已存在的任务。
            const { error: updateError } = await supabase
              .from('events')
              .update(taskData)
              .eq('event_uid', taskData.event_uid); // 根据 event_uid 找到要更新的行
            if (updateError) throw updateError;
          } else {
            // 插入 (INSERT) 逻辑: 如果没有 event_uid，说明这是一个新任务。
            // 1. 在函数内部明确地、主动地生成一个新的、唯一的 event_uid。
            const newUid = uuidv4();
            
            // 2. 将这个新生成的 uid 添加到要插入的数据中。
            const dataToInsert = { ...taskData, event_uid: newUid };
            
            // 3. 将包含新 uid 的完整数据插入数据库。
            const { error: insertError } = await supabase
              .from('events')
              .insert(dataToInsert);

            if (insertError) throw insertError;
            
            // 4. 将我们自己生成的 uid 用于返回结果，以便 Apps Script 回写到工作表中。
            eventUid = newUid;
          }
          success = true; // 标记此任务处理成功
        } catch (taskError) {
          // 如果单个任务处理失败，记录错误并继续处理下一个任务。
          console.error(`处理任务时出错 (sheet_row_id: ${sheet_row_id}):`, taskError.message);
          success = false; 
        }
        
        // 将此任务的处理结果（成功与否、行号、uid）添加到结果数组中。
        taskResults.push({
          success: success,
          rowNum: sheet_row_id ? parseInt(sheet_row_id.split(':').pop()) : null,
          event_uid: eventUid
        });
      }
    }

    // --- 6. 返回成功的响应 ---
    // 将包含整体状态和详细任务结果的 JSON 对象返回给 Google Apps Script。
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
    // 如果在上述任一步骤中发生未被捕获的错误，将在此处处理。
    console.error('全局同步错误:', error.message);
    // 返回 500 Internal Server Error，并附带错误信息。
    return new Response(
      JSON.stringify({ status: 'error', message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
