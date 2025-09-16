// === Webhook Receiver 2.0: 通用数据同步引擎 ===
// 该脚本将作为独立的 Web App 部署，并作为 Supabase Webhook 通知的中心化接收器。
// 它的设计目标是通用、健壮和安全。

// --- 全局配置 ---
// 【重要】请将 'YOUR_SECRET_TOKEN_HERE' 替换为您自己的共享安全令牌。
// 这个令牌将用于验证所有传入请求的合法性。
const SECRET_TOKEN = "D4AAs/jTiqG5APZM52cmrVgf+Y1txY/bfEILiMM7Uqk="; 
const HEADER_ROW = 1; // 假设所有工作表的表头都位于第 1 行。

/**
 * Google Apps Script Web App 的主入口点，用于处理 HTTP POST 请求。
 * @param {object} e - 事件参数，其中 e.postData.contents 包含了 POST 请求的主体内容。
 * @returns {ContentService.TextOutput} - 返回一个 JSON 格式的响应，告知调用方操作成功或失败。
 */
function doPost(e) {
  // --- 1. 验证传入的 Payload ---
  let payload;
  try {
    // 确保请求中包含有效数据
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("请求体中缺少数据。");
    }
    payload = JSON.parse(e.postData.contents);
    Logger.log(`Incoming payload: ${JSON.stringify(payload)}`);

    // 验证安全令牌
    if (payload.secret !== SECRET_TOKEN) {
      // 使用 403 Forbidden 状态码（虽然 Apps Script 不直接支持，但这是正确的语义）
      return createJsonResponse({ success: false, error: "无效的安全令牌。" }, 403);
    }
    
    // 验证操作类型和核心字段是否存在
    if (['UPDATE', 'CREATE'].indexOf(payload.action) === -1) {
      return createJsonResponse({ success: false, error: "无效的操作类型。当前仅支持 'UPDATE' 或 'CREATE'。" }, 400);
    }

    if (!payload.spreadsheet_id || !payload.sheet_gid) {
      return createJsonResponse({ success: false, error: "请求体中缺少必要的字段：'spreadsheet_id' 或 'sheet_gid'。" }, 400);
    }

    if (payload.action === 'UPDATE' && (!payload.lookup || !payload.data)) {
      return createJsonResponse({ success: false, error: "UPDATE 操作需要提供 'lookup' 和 'data' 字段。" }, 400);
    }

    if (payload.action === 'CREATE' && !payload.data) {
      return createJsonResponse({ success: false, error: "CREATE 操作需要提供 'data' 字段。" }, 400);
    }

  } catch (err) {
    Logger.log(`Payload 解析或验证时出错: ${err.message}`);
    return createJsonResponse({ success: false, error: `无效的请求数据: ${err.message}` }, 400);
  }

  // --- 2. 使用锁服务处理请求，防止并发冲突 ---
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // 最长等待 20 秒以获取锁

  try {
    // 根据 payload 中的 spreadsheet_id 打开目标电子表格
    const spreadsheet = SpreadsheetApp.openById(payload.spreadsheet_id);
    // 使用更健壮的 GID (工作表唯一数字 ID) 来定位工作表
    const sheet = getSheetByGid(spreadsheet, payload.sheet_gid);
    
    if (!sheet) {
      throw new Error(`在电子表格 '${payload.spreadsheet_id}' 中未找到 GID 为 '${payload.sheet_gid}' 的工作表。`);
    }

    // 创建一个表头名称到列号的映射，方便后续查找
    // 例如：{ "event_uid": 1, "status": 5, "owner": 8 }
    const headersMap = getHeadersMap(sheet);

    if (payload.action === 'CREATE') {
      try {
        const maxColumn = sheet.getLastColumn();
        const rowValues = Array(maxColumn).fill('');

        for (const columnName in payload.data) {
          const columnIndex = headersMap[columnName];
          if (columnIndex) {
            rowValues[columnIndex - 1] = payload.data[columnName];
          } else {
            Logger.log(`CREATE: 未找到列 ${columnName}，跳过。`);
          }
        }

        sheet.appendRow(rowValues);
        const rowNum = sheet.getLastRow();
        const sheetRowId = `${payload.spreadsheet_id}:${sheet.getName()}:${rowNum}`;

        if (headersMap['sheet_row_id']) {
          sheet.getRange(rowNum, headersMap['sheet_row_id']).setValue(sheetRowId);
        }

        return createJsonResponse({ success: true, message: `第 ${rowNum} 行已成功创建。`, row_num: rowNum, sheet_row_id: sheetRowId, debug: rowValues });
      } catch (createErr) {
        Logger.log(`CREATE 失败: ${createErr.message}`);
        return createJsonResponse({ success: false, error: `CREATE 失败: ${createErr.message}` }, 500);
      }
    }

    // --- UPDATE 流程 ---
    const lookupColumnIndex = headersMap[payload.lookup.column];
    if (!lookupColumnIndex) {
      throw new Error(`查找列 '${payload.lookup.column}' 在目标工作表中不存在。`);
    }

    const rowNum = findRowByValue(sheet, lookupColumnIndex, payload.lookup.value);
    if (rowNum === -1) {
      throw new Error(`未找到满足条件 '${payload.lookup.column}' = '${payload.lookup.value}' 的行。`);
    }

    try {
      const dataToUpdate = payload.data;
      for (const columnName in dataToUpdate) {
        const columnIndex = headersMap[columnName];
        if (columnIndex) {
          sheet.getRange(rowNum, columnIndex).setValue(dataToUpdate[columnName]);
        } else {
          Logger.log(`警告: 来自 payload 的列名 '${columnName}' 在工作表中未找到，已跳过。`);
        }
      }
      return createJsonResponse({ success: true, message: `第 ${rowNum} 行已成功更新。` });
    } catch (updateErr) {
      Logger.log(`UPDATE 失败: ${updateErr.message}`);
      return createJsonResponse({ success: false, error: `UPDATE 失败: ${updateErr.message}` }, 500);
    }

  } catch (error) {
    Logger.log(`执行更新时出错: ${error.message} | Payload: ${JSON.stringify(payload)}`);
    return createJsonResponse({ success: false, error: `发生意外错误: ${error.message}` }, 500);
  } finally {
    lock.releaseLock(); // 确保在操作结束后释放锁
  }
}

// --- 辅助函数 ---

/**
 * 通过唯一 GID 在电子表格中查找工作表。
 * 这比使用工作表名称更可靠，因为用户可能会重命名工作表。
 * @param {Spreadsheet} spreadsheet - Google Spreadsheet 对象。
 * @param {number} gid - 工作表的唯一数字 ID。
 * @returns {Sheet|null} - 返回找到的 Sheet 对象，如果未找到则返回 null。
 */
function getSheetByGid(spreadsheet, gid) {
  const sheets = spreadsheet.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == gid) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * 读取表头行，并返回一个将表头名称映射到其列号（从1开始）的对象。
 * @param {Sheet} sheet - 需要读取表头的工作表对象。
 * @returns {Object} - 表头名称到列号的映射对象。
 */
function getHeadersMap(sheet) {
  const headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    if (headers[i]) {
      map[headers[i]] = i + 1; // 列号是从 1 开始的
    }
  }
  return map;
}

/**
 * 在指定列中查找特定值，并返回其所在的行号。
 * @param {Sheet} sheet - 需要搜索的工作表对象。
 * @param {number} col - 需要搜索的列号（从1开始）。
 * @param {*} value - 需要查找的值。
 * @returns {number} - 返回匹配行的行号（从1开始），如果未找到则返回 -1。
 */
function findRowByValue(sheet, col, value) {
  // 从表头下一行开始获取整列的数据
  const data = sheet.getRange(HEADER_ROW + 1, col, sheet.getLastRow() - HEADER_ROW, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] == value) {
      return i + HEADER_ROW + 1; // 返回在工作表中的实际行号
    }
  }
  return -1; // 未找到
}

/**
 * 创建一个用于 Web App 响应的 JSON 对象。
 * @param {Object} obj - 需要被字符串化的 JavaScript 对象。
 * @param {number} [statusCode=200] - HTTP 状态码（仅为语义清晰，Apps Script 本身不直接支持）。
 * @returns {ContentService.TextOutput} - 用于输出的 ContentService 对象。
 */
function createJsonResponse(obj, statusCode = 200) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
