// === 用户友好配置 ===
// 只需在此文件中填写下面的 CONFIG 对象即可完成所有配置。

const CONFIG = {
  // --- 基本设置 ---
  
  // 1. 【必须修改】这个工作表的名称，脚本将从这里读取和同步数据。
  sheetName: "Project Management", // 例如: "事件管理", "活动日历"

  // 2. 数据标题所在的行号。
  headerRow: 1,

  // --- 同步字段设置 ---

  // 3. 定义 Google Sheet 中哪些列的数据需要被同步到 Supabase。
  //    列名必须与 Supabase 表中的字段名完全一致。
  syncHeaders: [
    'event_uid',
    'created_at', 
    'category',
    'project_phase',
    'title', 
    'status', 
    'priority',
    'start_time', 
    'end_time', 
    'recurring_rule',
    'owner', 
    'description'
  ],

  // 4. 【可选】硬编码字段：在这里设置的值会自动添加到每一条同步到 Supabase 的数据中。
  //    这对于自动分类非常有用。
  //    示例：对于市场活动表，可以设置为 { category: 'marketing' }
  //    如果不需要，可以留空，例如：{}
  hardcodedFields: {
    category: ''
  },

  // 5. 必要字段：如果这一列没有值，则该行数据将不会被同步。通常设置为 'title'。
  requiredField: 'title',

  // --- 显示文本设置 ---

  // 6. 定义同步状态在表格“sync_status”列中的显示文本。
  statusIndicators: {
    modified: 'modified', // 已修改，待同步
    syncing: 'syncing...', // 正在同步
    synced: 'synced'      // 已同步
  }
};

// --- 【重要】手动设置脚本属性 ---
// 为了让脚本能够连接到你的 Supabase 后端，你需要设置两个关键的脚本属性。
// 这个操作每个工作表只需要设置一次。
//
// 设置步骤:
// 1. 在 Apps Script 编辑器左侧，点击齿轮图标 ("Project Settings" / “项目设置”)。
// 2. 在打开的页面中，找到 "Script Properties" / “脚本属性” 部分。
// 3. 点击 "+ Add script property" / “+ 添加脚本属性”。
// 4. 添加以下两个属性:
//    - 属性 (Property) 1:
//      - Name / 名称: SUPABASE_FUNCTION_URL
//      - Value / 值: [粘贴你的 Supabase Edge Function 的 URL]
//    - 属性 (Property) 2:
//      - Name / 名称: AURA_FLOW_API_KEY
//      - Value / 值: [粘贴你的 Supabase project API key (anon key)]
// 5. 点击 "Save script properties" / “保存脚本属性”。
//
// 完成后，你的 Aura Flow 菜单中的 "Sync" 功能即可正常工作。

// --- 【重要】手动设置触发器 ---
// 为了让脚本在您编辑单元格时自动运行 (例如，自动填充创建日期)，
// 您需要手动为此工作表设置一个 "onEdit" 触发器。
//
// 设置步骤:
// 1. 在 Apps Script 编辑器左侧，点击闹钟图标 ("Triggers" / “触发器”)。
// 2. 在右下角，点击 "+ Add Trigger" / “+ 添加触发器” 按钮。
// 3. 在弹出的窗口中，进行如下配置:
//    - Choose which function to run: 选择 "handleEdit"
//    - Select event source: 选择 "From spreadsheet" / “来自电子表格”
//    - Select event type: 选择 "On edit" / “编辑时”
// 4. 点击 "Save" / “保存”。
// 5. Google 可能会要求您再次授权，请允许。
//
// 完成后，您的自动化功能即可生效。
