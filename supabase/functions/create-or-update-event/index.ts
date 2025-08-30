// 导入 Supabase 客户端和 CORS 头配置
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Edge Function 主服务函数
Deno.serve(async (req) => {
  // 处理浏览器的 CORS 预检请求 (OPTIONS method)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- 1. 认证 ---
    // 验证请求头中的 API 密钥是否正确
    const authorization = req.headers.get('Authorization');
    const AURA_FLOW_API_KEY = Deno.env.get('AURA_FLOW_API_KEY');

    if (!AURA_FLOW_API_KEY || authorization !== `Bearer ${AURA_FLOW_API_KEY}`) {
      // 如果密钥不匹配，返回 401 Unauthorized 错误
      return new Response(JSON.stringify({ status: 'error', message: '未经授权的访问。' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // --- 2. 初始化 Supabase 客户端 ---
    // 使用环境变量中的 URL 和 service_role_key 初始化，以便拥有完全的管理权限
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // --- 3. 解析传入的数据 ---
    // 【核心修改】直接将请求体解析为事件数组，不再需要外层的 'project' 对象
    const events = await req.json();
    
    // 增加一个数据格式校验，确保收到的是一个数组
    if (!Array.isArray(events)) {
      throw new Error("无效的数据格式。期望的格式是一个事件数组。");
    }

    // 在日志中打印收到的数据，方便在 Supabase后台 Functions 日志中调试
    console.log("收到同步请求，正在处理 payload:", JSON.stringify(events, null, 2));

    const eventResults = []; // 用于存放每一行数据的处理结果

    // --- 4. 批量处理事件 (Upsert Logic) ---
    // 遍历从 Google Sheet 发送过来的每一个事件对象
    if (events.length > 0) {
      for (const event of events) {
        // 从事件对象中分离出 sheet_row_id (元数据) 和 eventData (要写入数据库的数据)
        const { sheet_row_id, ...eventData } = event;
        
        // 【核心修改】移除了所有与 project_id 相关的逻辑

        let eventUid = eventData.event_uid;
        let success = false;
        let errorMessage = null;

        try {
          // 如果 event_uid 已存在，说明是更新操作
          if (eventData.event_uid) {
            const { event_uid, ...updateData } = eventData;
            // 在 'events' 表中更新 event_uid 匹配的记录
            const { error: updateError } = await supabase
              .from('events')
              .update(updateData)
              .eq('event_uid', event_uid);
              
            if (updateError) throw updateError; // 如果更新出错，抛出异常

          } else {
            // 如果 event_uid 不存在，说明是创建操作
            const newUid = crypto.randomUUID(); // 生成一个新的唯一 ID
            eventData.event_uid = newUid;
            eventUid = newUid; 

            // 在 'events' 表中插入一条新记录
            const { error: insertError } = await supabase
              .from('events')
              .insert(eventData);

            if (insertError) throw insertError; // 如果插入出错，抛出异常
          }
          success = true; // 操作成功

        } catch (eventError) {
          // 如果在 try 块中发生任何错误，捕获它
          console.error('事件处理错误:', eventError.message);
          success = false; 
          errorMessage = eventError.message; // 记录错误信息
        }
        
        // 将此行的处理结果（成功或失败、行号、uid、错误信息）添加到结果数组中
        eventResults.push({
          success: success,
          rowNum: sheet_row_id ? parseInt(sheet_row_id.split(':').pop()) : null,
          event_uid: eventUid,
          error: errorMessage,
        });
      }
    }

    // --- 5. 返回成功的响应 ---
    // 将包含所有行处理结果的数组返回给 Google Apps Script
    return new Response(
      JSON.stringify({
        status: 'success',
        message: '同步已处理。',
        eventResults: eventResults, // 【核心修改】字段名从 taskResults 改为 eventResults
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    // --- 6. 处理全局错误 ---
    // 如果在主 try 块的任何位置发生未被捕获的错误（例如 JSON 解析失败、认证失败等）
    console.error('全局同步错误:', error.message);
    // 返回一个 500 Internal Server Error 响应
    return new Response(
      JSON.stringify({ status: 'error', message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
