// Supabase Edge Function: 'handle-event-update/index.ts'
// 这个函数现在包含了“项目 category 覆盖 event category”的高级逻辑。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// --- 可复用的 HTTP 响应创建函数 ---
const createResponse = (data: object, status: number) => {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
};

// 启动 Deno 服务来处理请求
serve(async (req) => {
  // 处理浏览器的 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const payload = await req.json();
    const { record: newRecord, old_record: oldRecord } = payload;

    // 从环境变量中安全地获取敏感信息
    const WEBHOOK_V2_URL = Deno.env.get('WEBHOOK_V2_URL');
    const WEBHOOK_SECRET = Deno.env.get('GOOGLE_SCRIPT_SECRET_TOKEN');

    if (!WEBHOOK_V2_URL || !WEBHOOK_SECRET) {
      console.error("环境变量缺失: Webhook V2 URL 或 Secret 未设置。");
      return createResponse({ error: "服务器配置错误。" }, 500);
    }
    
    // 【新逻辑】初始化 Supabase 客户端，用于查询 projects 表
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // --- 核心判断逻辑 ---
    // 这个函数现在只处理有关联 project_id 的 V2 流程
    if (newRecord.project_id) {
      // --- 【新需求】项目 Category 覆盖逻辑 ---
      let projectCategory = null;
      
      // 1. 根据 event 的 project_id，查询 projects 表获取其 category
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('category')
        .eq('id', newRecord.project_id)
        .single();

      if (projectError) {
        console.error(`查询项目 category 时出错 (project_id: ${newRecord.project_id}):`, projectError.message);
        // 即使查询失败，也继续执行，不中断流程
      } else if (projectData && projectData.category) {
        projectCategory = projectData.category;
      }

      // 2. 决定最终的 category：如果 project 有 category，则使用它；否则，使用 event 自己的 category。
      const finalCategory = projectCategory ?? newRecord.category;

      // 3. 构建一个只包含已变更字段的 'data' 对象
      const dataToSend: { [key: string]: any } = {};
      const fieldsToCompare = [
        'title', 'status', 'priority', 'owner', 
        'start_time', 'end_time', 'description'
      ];
      
      fieldsToCompare.forEach(field => {
        if (newRecord[field] !== oldRecord[field]) {
          dataToSend[field] = newRecord[field];
        }
      });

      // 4. 单独处理 category 的比较逻辑：用最终 category 和旧记录的 category 比较
      if (finalCategory !== oldRecord.category) {
        dataToSend['category'] = finalCategory;
      }

      // 如果没有任何需要同步的字段发生变化，则提前退出
      if (Object.keys(dataToSend).length === 0) {
        return createResponse({ message: "没有相关字段发生变更，不触发 Webhook V2。" }, 200);
      }

      // 5. 构建 V2.0 规范的 Payload
      const payloadV2 = {
        secret: WEBHOOK_SECRET,
        action: 'UPDATE',
        spreadsheet_id: newRecord.spreadsheet_id,
        sheet_gid: newRecord.sheet_gid,
        lookup: {
          column: 'event_uid',
          value: newRecord.event_uid,
        },
        data: dataToSend,
      };

      // 6. 向新的 Webhook Receiver 2.0 发送 POST 请求
      await fetch(WEBHOOK_V2_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadV2),
      });

      return createResponse({ message: "Webhook V2 已成功触发（含 Category 覆盖逻辑）。" }, 200);

    } else {
      // 如果 event 没有 project_id，此函数将不执行任何操作。
      // 旧的 trigger 会负责处理这种情况。
      return createResponse({ message: "Event 没有 project_id，由 V1 trigger 处理。" }, 200);
    }
  } catch (error) {
    console.error('在 handle-event-update 函数中发生错误:', error);
    return createResponse({ error: error.message }, 500);
  }
});
