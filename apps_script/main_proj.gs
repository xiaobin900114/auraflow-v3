// === AuraFlow V2 Sync Engine (Final Version) ===
// 这个 Google Apps Script 脚本是同步系统的客户端部分。
// 主要职责包括：
// 1. 在 Google Sheet 中创建操作菜单。
// 2. 监听用户对工作表的编辑，并自动标记已修改的行。
// 3. 收集所有已修改的数据（包括项目信息和任务列表）。
// 4. 将数据打包并发送到 Supabase Edge Function 进行处理。
// 5. 根据 Edge Function 返回的结果，更新工作表中的同步状态和 ID。

// --- 全局常量 ---
// 从脚本属性中获取配置，这是一种安全存储敏感信息（如 API Key）的做法。
const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const SUPABASE_FUNCTION_URL = SCRIPT_PROPS.getProperty('SUPABASE_FUNCTION_URL');
const AURA_FLOW_API_KEY = SCRIPT_PROPS.getProperty('AURA_FLOW_API_KEY');

/**
 * 特殊函数，当用户打开 Google Sheet 时自动运行。
 * 它会在界面上创建一个名为 "Aura Flow" 的自定义菜单。
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Aura Flow')
      .addItem('Sync All Changes', 'syncAllChanges') // 添加菜单项，点击时触发 syncAllChanges 函数
      .addToUi();
}

/**
 * Apps Script 的简单触发器，当用户编辑任何单元格时自动运行。
 * @param {Object} e - 事件对象，包含了关于编辑的所有信息（如范围、值等）。
 */
function handleEdit(e) {
  const sheet = e.range.getSheet();
  // 检查编辑是否发生在指定的任务工作表，并且不是在标题行。
  if (sheet.getName() === CONFIG.tasksSheet && e.range.getRow() > CONFIG.headerRow) {
    const headers = getHeaders(sheet);
    // 如果 "title" 列被填写但 "created_at" 为空，则自动填充创建时间。
    autoFillCreatedAt(sheet, e.range.getRow(), headers);
    
    // 找到 'sync_status' 列，并将其值设置为 'modified'，标记此行需要同步。
    const statusCol = headers.indexOf('sync_status') + 1;
    if (statusCol > 0) {
      sheet.getRange(e.range.getRow(), statusCol).setValue(CONFIG.statusIndicators.modified);
    }
  }
}

/**
 * 手动触发的核心函数，用于启动整个同步流程。
 * 负责收集、发送数据并处理响应。
 */
function syncAllChanges() {
  const ui = SpreadsheetApp.getUi();
  // 前置检查：确保脚本已正确配置 API URL 和 Key。
  if (!SUPABASE_FUNCTION_URL || !AURA_FLOW_API_KEY) {
    ui.alert('Script configuration is missing.');
    return;
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheetId = spreadsheet.getId();
  let projectPayload = null;
  const tasksToSync = [];
  const taskRowLocations = []; // 用于存储待同步任务的位置信息，方便后续更新状态。

  const projectInfoSheet = spreadsheet.getSheetByName(CONFIG.projectInfoSheet);
  const tasksSheet = spreadsheet.getSheetByName(CONFIG.tasksSheet);

  // 确保核心的 tasksSheet 存在。
  if (!tasksSheet) {
    ui.alert(`Error: The required tasks sheet "${CONFIG.tasksSheet}" was not found.`);
    return;
  }

  // 如果项目信息工作表存在，则从中创建项目数据负载。
  if (projectInfoSheet) {
    projectPayload = createProjectPayload(projectInfoSheet, spreadsheetId);
  }

  // 从任务工作表中获取所有被标记为 'modified' 的任务。
  const taskData = getTasksToSync(tasksSheet, spreadsheetId);
  tasksToSync.push(...taskData.tasks);
  taskRowLocations.push(...taskData.locations);

  // 如果没有任何需要同步的数据，则提前终止。
  if (!projectPayload && tasksToSync.length === 0) {
    ui.alert('No changes to sync.');
    return;
  }

  // 构建最终发送到服务器的 JSON 负载。
  const finalPayload = { project: projectPayload, tasks: tasksToSync };
  
  // 在发送请求前，将所有待同步任务的状态更新为 'syncing...'，为用户提供即时反馈。
  taskRowLocations.forEach(loc => loc.sheet.getRange(loc.row, loc.col).setValue(CONFIG.statusIndicators.syncing));
  SpreadsheetApp.flush(); // 强制立即应用所有待处理的电子表格更改。

  // 调用函数，将数据发送到 Supabase Edge Function。
  const response = syncBatchToSupabase(finalPayload);

  // 根据服务器返回的结果处理后续逻辑。
  if (response && response.status === 'success') {
    // 如果同步成功，并且有任务结果返回，则更新工作表。
    if (response.taskResults && response.taskResults.length > 0) {
      updateSheetWithResults(tasksSheet, response.taskResults);
    }
    ui.alert(`Sync complete! Processed project info and ${response.taskResults ? response.taskResults.length : 0} tasks.`);
  } else {
    // 如果同步失败，向用户显示错误信息，并将状态回滚到 'modified'。
    ui.alert(`Sync failed: ${response ? response.message : 'Unknown error. Check logs.'}`);
    taskRowLocations.forEach(loc => loc.sheet.getRange(loc.row, loc.col).setValue(CONFIG.statusIndicators.modified));
  }
}

/**
 * 从 "Project_Info" 工作表中提取项目数据。
 * @param {Sheet} sheet - "Project_Info" 工作表对象。
 * @param {string} spreadsheetId - 当前电子表格的 ID。
 * @returns {Object} - 包含项目信息的 JSON 对象。
 */
function createProjectPayload(sheet, spreadsheetId) {
  const headers = getHeaders(sheet);
  const data = sheet.getRange(CONFIG.headerRow + 1, 1, 1, headers.length).getValues()[0];
  const payload = { spreadsheet_id: spreadsheetId };
  
  headers.forEach((header, index) => {
    // 将 Sheet 中的列名（如 'Due Date'）转换为数据库字段名（如 'due_date'）。
    const dbField = header.toLowerCase().replace(/ /g, '_');
    // 只包含在 CONFIG 中定义的字段，且单元格内容不为空。
    if (CONFIG.projectFields.includes(header) && data[index] !== '') {
      payload[dbField] = data[index];
    }
  });
  return payload;
}

/**
 * 遍历任务工作表，找出所有状态为 'modified' 的行。
 * @param {Sheet} sheet - 任务工作表对象。
 * @param {string} spreadsheetId - 当前电子表格的 ID。
 * @returns {{tasks: Array<Object>, locations: Array<Object>}} - 包含任务数据负载和其位置信息的对象。
 */
function getTasksToSync(sheet, spreadsheetId) {
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.headerRow) return { tasks: [], locations: [] };

  const dataRange = sheet.getRange(CONFIG.headerRow + 1, 1, lastRow - CONFIG.headerRow, headers.length);
  const allData = dataRange.getValues();
  const statusColIndex = headers.indexOf('sync_status');
  if (statusColIndex === -1) return { tasks: [], locations: [] }; // 如果没有状态列，则无法同步。

  const tasks = [];
  const locations = [];
  const sheetName = sheet.getName();

  allData.forEach((row, index) => {
    // 检查 'sync_status' 列的值是否为 'modified'。
    if (row[statusColIndex] === CONFIG.statusIndicators.modified) {
      const rowNum = index + CONFIG.headerRow + 1; // 计算在工作表中的实际行号。
      const sheetGid = sheet.getSheetId();
      const taskPayload = createTaskPayload(headers, row, spreadsheetId, sheetName, rowNum, sheetGid);
      
      // 只有包含必填字段（如 title）的任务才会被加入同步列表。
      if (taskPayload) {
        tasks.push(taskPayload);
        locations.push({ sheet: sheet, row: rowNum, col: statusColIndex + 1 });
      }
    }
  });
  return { tasks, locations };
}

/**
 * 根据单行数据创建一个任务的数据负载对象。
 * @param {Array<string>} headers - 标题行数组。
 * @param {Array<any>} rowData - 当前行的数据数组。
 * @param {string} spreadsheetId - 电子表格 ID。
 * @param {string} sheetName - 工作表名称。
 * @param {number} rowNum - 当前行号。
 * @param {number} sheetGid - 工作表的 GID。
 * @returns {Object|null} - 格式化后的任务对象，或在缺少必填字段时返回 null。
 */
function createTaskPayload(headers, rowData, spreadsheetId, sheetName, rowNum, sheetGid) {
  const payload = {};
  // 添加 Google Sheet 的元数据，用于唯一标识和定位。
  payload.spreadsheet_id = spreadsheetId; 
  payload.sheet_row_id = `${spreadsheetId}:${sheetName}:${rowNum}`;
  payload.sheet_gid = sheetGid; 

  CONFIG.taskFields.forEach(header => {
    // 确保不会覆盖上面已经手动设置好的核心 ID。
    if (header === 'spreadsheet_id' || header === 'sheet_gid' || header === 'sheet_row_id') {
      return;
    }
    const colIndex = headers.indexOf(header);
    if (colIndex !== -1 && rowData[colIndex] !== '') {
      let value = rowData[colIndex];
      // 将日期对象转换为 ISO 格式字符串，便于数据库存储。
      if (value instanceof Date) value = value.toISOString();
      payload[header] = value;
    }
  });

  // （此部分为特定业务逻辑，可根据需要调整）
  const isProjectWorkbook = !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.projectInfoSheet);
  if (isProjectWorkbook) {
    for (const key in CONFIG.hardcodedFields) {
      payload[key] = CONFIG.hardcodedFields[key];
    }
  } else if (CONFIG.defaultCategoryForArea) {
    payload.category = CONFIG.defaultCategoryForArea;
  }

  // 检查任务是否包含 CONFIG 中定义的必填字段。
  return payload[CONFIG.requiredField] ? payload : null;
}

/**
 * 发送 HTTP POST 请求到 Supabase Edge Function。
 * @param {Object} payload - 要发送的 JSON 数据。
 * @returns {Object} - 解析后的服务器响应 JSON 对象。
 */
function syncBatchToSupabase(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + AURA_FLOW_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // 设置为 true，这样即使发生 HTTP 错误（如 4xx, 5xx），脚本也不会抛出异常而停止，而是返回响应对象，便于我们自己处理。
  };
  try {
    const response = UrlFetchApp.fetch(SUPABASE_FUNCTION_URL, options);
    return JSON.parse(response.getContentText());
  } catch (e) {
    // 捕获网络请求本身发生的严重错误（如 DNS 解析失败）。
    Logger.log(`Critical fetch error: ${e.toString()}`);
    return { status: 'error', message: e.message };
  }
}

/**
 * 根据服务器返回的成功结果，更新工作表。
 * @param {Sheet} sheet - 任务工作表对象。
 * @param {Array<Object>} results - 来自服务器的任务处理结果数组。
 */
function updateSheetWithResults(sheet, results) {
  const headers = getHeaders(sheet);
  const eventUidCol = headers.indexOf('event_uid') + 1;
  const syncStatusCol = headers.indexOf('sync_status') + 1;
  
  results.forEach(result => {
    // 只处理成功的任务。
    if (result.success && result.rowNum && result.event_uid) {
      // 如果是新创建的任务，回写数据库生成的 event_uid。
      if (eventUidCol > 0) sheet.getRange(result.rowNum, eventUidCol).setValue(result.event_uid);
      // 将同步状态更新为 'synced'。
      if (syncStatusCol > 0) sheet.getRange(result.rowNum, syncStatusCol).setValue(CONFIG.statusIndicators.synced);
    }
  });
}

/**
 * 一个辅助函数，用于获取指定工作表的标题行内容。
 * @param {Sheet} sheet - 工作表对象。
 * @returns {Array<string>} - 包含所有标题的字符串数组。
 */
function getHeaders(sheet) {
  // 从配置的标题行读取整行数据。
  const row = sheet.getRange(CONFIG.headerRow, 1, 1, sheet.getMaxColumns()).getValues()[0];
  const headers = [];
  // 遍历直到遇到空单元格，认为标题结束。
  for (let i = 0; i < row.length; i++) { if (row[i] === '') break; headers.push(row[i]); }
  return headers;
}

/**
 * 一个辅助函数，用于在用户填写任务标题时自动填充创建日期。
 * @param {Sheet} sheet - 工作表对象。
 * @param {number} rowNum - 被编辑的行号。
 * @param {Array<string>} headers - 标题行数组。
 */
function autoFillCreatedAt(sheet, rowNum, headers) {
  const titleColIndex = headers.indexOf('title');
  const createdAtColIndex = headers.indexOf('created_at');
  
  if (titleColIndex !== -1 && createdAtColIndex !== -1) {
    const titleCell = sheet.getRange(rowNum, titleColIndex + 1);
    const createdAtCell = sheet.getRange(rowNum, createdAtColIndex + 1);
    
    // 当标题格有值，而创建时间格没有值时，自动填入当前时间。
    if (titleCell.getValue() && !createdAtCell.getValue()) {
      createdAtCell.setValue(new Date());
    }
  }
}
