// === AuraFlow V2 Configuration File (Final Version) ===
// 这个配置文件用于定义与新项目层级架构相关的设置。
// 将所有可变配置集中在此处，可以方便地调整脚本行为而无需修改核心逻辑代码。

const CONFIG = {
  // --- 工作表名称定义 ---
  // 定义了脚本需要操作的两个核心工作表的名称。
  projectInfoSheet: "Project_Info", // 存储项目级别信息的表名
  tasksSheet: "Project Management",   // 存储任务列表的表名

  // --- 字段映射 ---
  // 定义了 Google Sheet 中的列名与数据库字段之间的映射关系。
  // 只有出现在这里的字段才会被脚本处理和发送。

  // 项目信息表中的有效字段
  projectFields: [ 'Name', 'Description', 'Status', 'Owner', 'Due Date','Category', 'Folder Link', 'Is Archived' ],
  
  // 任务表中的有效字段
  taskFields: [
    'event_uid',      // 任务的唯一ID（由数据库生成并回写）
    'sheet_row_id',   // Google Sheet 行的唯一标识（由脚本生成）
    'sheet_gid',      // 工作表的 GID（由脚本生成）
    'spreadsheet_id', // 电子表格的 ID（由脚本生成）
    'created_at',     // 创建时间
    'title',          // 任务标题
    'status',         // 任务状态 (e.g., To Do, In Progress)
    'priority',       // 优先级
    'start_time',     // 开始时间
    'end_time',       // 结束时间
    'recurring_rule', // 重复规则 (e.g., RRULE string)
    'owner',          // 负责人
    'description',    // 描述
    // 'category'        // 分类
  ],

  // --- 核心设置 ---
  headerRow: 1, // 定义标题行在第几行。数据将从这一行的下一行开始读取。
  requiredField: 'title', // 定义一个任务行被视为有效所必须包含的字段。如果该字段为空，则此行将被忽略。
  
  // --- 显示文本设置 ---
  // 定义了 'sync_status' 列中使用的不同状态的显示文本。
  // 这使得状态文本可以轻松地被修改或本地化。
  statusIndicators: {
    modified: 'modified',   // 当行被编辑后，脚本自动设置的状态。
    syncing: 'syncing...',  // 当数据正在发送到服务器时显示的状态。
    synced: 'synced'        // 当数据成功同步到数据库后，脚本设置的状态。
  }
};
