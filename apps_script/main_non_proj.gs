// === 通用同步引擎 ===
// 这个文件是脚本的核心逻辑，通常无需修改。

// 从脚本属性中获取 Supabase 的配置信息
const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const SUPABASE_FUNCTION_URL = SCRIPT_PROPS.getProperty('SUPABASE_FUNCTION_URL');
const AURA_FLOW_API_KEY = SCRIPT_PROPS.getProperty('AURA_FLOW_API_KEY');

/**
 * 当用户打开 Google Sheet 时，在菜单栏创建一个名为 "Aura Flow" 的自定义菜单。
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('Aura Flow')
      .addItem('Sync All Changes', 'syncAllChanges') // 添加一个“同步所有更改”的菜单项
      .addToUi();
}

/**
 * 当用户编辑单元格时自动触发的函数 (需要手动设置触发器)。
 * @param {Object} e - Google Sheet 传递的事件对象。
 */
function handleEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const editedRow = range.getRow();
  
  // 如果编辑的不是配置中指定的工作表，或者编辑的是标题行，则不做任何处理
  if (sheet.getName() !== CONFIG.sheetName || editedRow <= CONFIG.headerRow) return;

  const headers = getHeaders(sheet);
  // 自动填充 created_at 字段
  autoFillCreatedAt(sheet, editedRow, headers);
  
  // 将被编辑行的 sync_status 标记为 'modified'
  const statusCol = headers.indexOf('sync_status') + 1;
  if (statusCol > 0) {
    sheet.getRange(editedRow, statusCol).setValue(CONFIG.statusIndicators.modified);
  }
}

/**
 * 主同步函数，由用户点击菜单触发。
 * 负责收集所有标记为 'modified' 的行，将它们发送到 Supabase，并根据返回结果更新工作表。
 */
function syncAllChanges() {
  const ui = SpreadsheetApp.getUi();
  // 检查必要的配置是否存在
  if (!SUPABASE_FUNCTION_URL || !AURA_FLOW_API_KEY) {
    ui.alert('脚本配置缺失。请在项目设置中添加 SUPABASE_FUNCTION_URL 和 AURA_FLOW_API_KEY。');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
  if (!sheet) { ui.alert(`名为 "${CONFIG.sheetName}" 的工作表未找到。`); return; }

  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.headerRow) { ui.alert('没有数据需要同步。'); return; }
  
  const dataRange = sheet.getRange(CONFIG.headerRow + 1, 1, lastRow - CONFIG.headerRow, headers.length);
  const allData = dataRange.getValues();
  const statusColIndex = headers.indexOf('sync_status');
  if (statusColIndex === -1) { ui.alert('未找到 "sync_status" 列，无法同步。'); return; }

  const eventsToSync = []; // 存储需要同步的事件数据
  const rowLocationsToUpdate = []; // 存储需要更新状态的单元格位置

  // 遍历所有行，找出状态为 'modified' 的数据
  allData.forEach((row, index) => {
    if (row[statusColIndex] === CONFIG.statusIndicators.modified) {
      const rowNum = index + CONFIG.headerRow + 1;
      // 为每一行创建一个符合 Supabase 格式的 payload
      const payload = createPayload(headers, row, sheet.getParent().getId(), sheet.getName(), rowNum);
      if (payload) {
        eventsToSync.push(payload);
        rowLocationsToUpdate.push({ sheet: sheet, row: rowNum, col: statusColIndex + 1 });
      }
    }
  });

  if (eventsToSync.length === 0) { ui.alert('没有检测到需要同步的更改。'); return; }

  // 【核心修改】 payload 现在直接是事件对象的数组，不再包含外层的 'project' 对象。
  const finalPayload = eventsToSync;

  // 在发送请求前，将这些行的状态更新为 'syncing...'
  rowLocationsToUpdate.forEach(loc => loc.sheet.getRange(loc.row, loc.col).setValue(CONFIG.statusIndicators.syncing));
  SpreadsheetApp.flush(); // 确保 UI 更新

  // 调用函数，将数据批量发送到 Supabase
  const response = syncBatchToSupabase(finalPayload);

  // 根据 Supabase 的返回结果，更新工作表
  if (response && response.status === 'success' && Array.isArray(response.eventResults)) {
    updateSheetWithResults(sheet, headers, response.eventResults);
    ui.alert(`同步完成！共处理了 ${response.eventResults.length} 行数据。`);
  } else {
    // 如果同步失败，显示从服务器返回的错误信息
    const errorMessage = (response && response.message) ? response.message : '未知错误，请检查 Apps Script 日志获取详情。';
    ui.alert('同步失败。服务器错误: ' + errorMessage);
    Logger.log(`从 Supabase 返回失败的响应: ${JSON.stringify(response)}`);
    // 将失败的行状态恢复为 'modified'，以便下次重试
    rowLocationsToUpdate.forEach(loc => loc.sheet.getRange(loc.row, loc.col).setValue(CONFIG.statusIndicators.modified));
  }
}

/**
 * 根据单行数据和配置，创建一个发送到 Supabase 的数据对象 (payload)。
 * @param {string[]} sheetHeaders - 标题行数组。
 * @param {any[]} rowData - 当前行的数据数组。
 * @param {string} spreadsheetId - Google Sheet 的唯一 ID。
 * @param {string} sheetName - 工作表的名称。
 * @param {number} rowNum - 当前行的行号。
 * @returns {Object|null} - 返回构建好的 payload 对象，或在不满足条件时返回 null。
 */
function createPayload(sheetHeaders, rowData, spreadsheetId, sheetName, rowNum) {
  const payload = {};
  
  // 添加硬编码的字段
  for (const key in CONFIG.hardcodedFields) {
    if (CONFIG.hardcodedFields[key]) {
      payload[key] = CONFIG.hardcodedFields[key];
    }
  }
  
  // 添加用于回溯的元数据
  payload.sheet_row_id = `${spreadsheetId}:${sheetName}:${rowNum}`;
  payload.spreadsheet_id = spreadsheetId;

  // 根据 syncHeaders 配置，将对应的列数据添加到 payload 中
  CONFIG.syncHeaders.forEach(headerToSync => {
    const colIndex = sheetHeaders.indexOf(headerToSync);
    if (colIndex !== -1) {
      let value = rowData[colIndex];
      // 确保单元格有值
      if (value !== '') {
        // 如果是日期对象，转换为 ISO 格式的字符串
        if (value instanceof Date) {
          payload[headerToSync] = value.toISOString();
        } else {
          payload[headerToSync] = value;
        }
      }
    }
  });

  // 如果必要字段为空，则此行无效，返回 null
  if (!payload[CONFIG.requiredField]) return null;
  
  return payload;
}

/**
 * 根据 Supabase 返回的结果，批量更新 Google Sheet 中的内容。
 * @param {Sheet} sheet - 当前操作的工作表对象。
 * @param {string[]} headers - 标题行数组。
 * @param {Object[]} results - 从 Supabase 返回的结果数组。
 */
function updateSheetWithResults(sheet, headers, results) {
  const eventUidCol = headers.indexOf('event_uid') + 1;
  const syncErrorCol = headers.indexOf('sync_error') + 1;
  const syncStatusCol = headers.indexOf('sync_status') + 1;
  
  results.forEach(result => {
    if (!result || !result.rowNum) return;
    const rowNum = result.rowNum;
    
    if (result.success) {
      // 如果成功，更新 event_uid 和 sync_status，并清除错误信息
      if (eventUidCol > 0) sheet.getRange(rowNum, eventUidCol).setValue(result.event_uid);
      if (syncStatusCol > 0) sheet.getRange(rowNum, syncStatusCol).setValue(CONFIG.statusIndicators.synced);
      if (syncErrorCol > 0) sheet.getRange(rowNum, syncErrorCol).clearContent();
    } else {
      // 如果失败，将错误信息写回 sync_error 列，并将状态改回 modified
      if (syncErrorCol > 0) sheet.getRange(rowNum, syncErrorCol).setValue(result.error);
      if (syncStatusCol > 0) sheet.getRange(rowNum, syncStatusCol).setValue(CONFIG.statusIndicators.modified);
    }
  });
}

/**
 * 向 Supabase Edge Function 发送 HTTP POST 请求。
 * @param {Object} payload - 要发送的数据。
 * @returns {Object} - 从服务器返回的、解析后的 JSON 对象。
 */
function syncBatchToSupabase(payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + AURA_FLOW_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // 允许捕获 HTTP 错误，而不是让脚本直接停止
  };
  try {
    const response = UrlFetchApp.fetch(SUPABASE_FUNCTION_URL, options);
    const responseText = response.getContentText();
    // 如果服务器返回空响应，也视为错误
    if (!responseText) {
      return { status: 'error', message: '从服务器收到空响应。' };
    }
    return JSON.parse(responseText);
  } catch (e) {
    Logger.log(`同步时发生严重错误: ${e.toString()}`);
    return { status: 'error', message: `请求失败或 JSON 解析错误: ${e.message}` };
  }
}

// --- 辅助函数 ---

/**
 * 获取工作表的标题行。
 * @param {Sheet} sheet - 工作表对象。
 * @returns {string[]} - 标题数组。
 */
function getHeaders(sheet) {
  const row = sheet.getRange(CONFIG.headerRow, 1, 1, sheet.getMaxColumns()).getValues()[0];
  const headers = [];
  for (let i = 0; i < row.length; i++) { if (row[i] === '') break; headers.push(row[i]); }
  return headers;
}

/**
 * 如果 'title' 列被填写，且 'created_at' 列为空，则自动填充当前时间。
 * @param {Sheet} sheet - 工作表对象。
 * @param {number} rowNum - 当前行号。
 * @param {string[]} headers - 标题数组。
 */
function autoFillCreatedAt(sheet, rowNum, headers) {
  const titleColIndex = headers.indexOf('title');
  const createdAtColIndex = headers.indexOf('created_at');
  if (titleColIndex !== -1 && createdAtColIndex !== -1) {
    const titleCell = sheet.getRange(rowNum, titleColIndex + 1);
    const createdAtCell = sheet.getRange(rowNum, createdAtColIndex + 1);
    if (titleCell.getValue() && !createdAtCell.getValue()) {
      createdAtCell.setValue(new Date());
    }
  }
}
