// === Standalone Webhook Receiver ("总部脚本") ===
// This script lives independently at script.google.com and is deployed as a single Web App.
// Its only job is to receive notifications from Supabase and update the correct Google Sheet.

// --- 全局配置 ---
// 【重要】直接将你的 Secret Token 定义为常量。不要使用 SCRIPT_PROPS。
const SECRET_TOKEN = "D4AAs/jTiqG5APZM52cmrVgf+Y1txY/bfEILiMM7Uqk="; // 请务必替换成你自己的真实令牌

// 这些常量假设在你所有的表格中都是一致的。
const HEADER_ROW = 1;
const SHEET_NAME = "Project Management"; // 假设所有表格的主工作表都叫这个名字

/**
 * 这是 Google Apps Script 的 Web App 入口点，用于处理 POST 请求。
 */
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
    if (payload.secret !== SECRET_TOKEN) {
      return createJsonResponse({ success: false, error: "Invalid secret token." });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: "Invalid request data or token." });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // Wait up to 15 seconds for the lock

  try {
    const uid = payload.event_uid;
    const newStatus = payload.new_status;
    const spreadsheetId = payload.spreadsheet_id;

    if (!uid || !newStatus || !spreadsheetId) {
      return createJsonResponse({ success: false, error: "Missing 'event_uid', 'new_status', or 'spreadsheet_id' in payload." });
    }
    
    let spreadsheet;
    try {
      // 【核心】通过 ID 远程打开指定的 Google Sheet 文件
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } catch (openErr) {
      Logger.log(`Failed to open spreadsheet with ID: ${spreadsheetId}. Error: ${openErr.message}`);
      return createJsonResponse({ success: false, error: `Cannot open spreadsheet with ID: ${spreadsheetId}. Make sure the script has access.` });
    }
    
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return createJsonResponse({ success: false, error: `Sheet with name '${SHEET_NAME}' not found in spreadsheet ID ${spreadsheetId}.`});
    }

    const headers = getHeaders(sheet);
    const uidColIndex = headers.indexOf('event_uid');
    const statusColIndex = headers.indexOf('status'); // 假设状态列名为 'status'

    if (uidColIndex === -1 || statusColIndex === -1) {
      return createJsonResponse({ success: false, error: "Column 'event_uid' or 'status' not found in the target sheet." });
    }

    const rowNum = findRowByValue(sheet, uidColIndex + 1, uid);

    if (rowNum === -1) {
      return createJsonResponse({ success: false, error: `Event with UID ${uid} not found in sheet ${spreadsheetId}.` });
    }

    sheet.getRange(rowNum, statusColIndex + 1).setValue(newStatus);
    
    return createJsonResponse({ success: true, message: `Spreadsheet ${spreadsheetId}, Row ${rowNum} status updated to '${newStatus}'.` });

  } catch (error) {
    Logger.log(`An unexpected error occurred: ${error.message}`);
    return createJsonResponse({ success: false, error: "An unexpected error occurred: " + error.message });
  } finally {
    lock.releaseLock();
  }
}

// --- 辅助函数 ---

function getHeaders(sheet) {
  const row = sheet.getRange(HEADER_ROW, 1, 1, sheet.getMaxColumns()).getValues()[0];
  const headers = [];
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '') break;
    headers.push(row[i]);
  }
  return headers;
}

function findRowByValue(sheet, col, value) {
  const data = sheet.getRange(HEADER_ROW + 1, col, sheet.getLastRow() - HEADER_ROW, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] == value) {
      return i + HEADER_ROW + 1;
    }
  }
  return -1;
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
