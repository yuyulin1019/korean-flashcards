(function (root) {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';
  let libraryPromise;

  function addScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('無法載入 Google 連線程式，請確認網路連線。'));
      document.head.appendChild(script);
    });
  }

  function loadLibraries() {
    if (!libraryPromise) {
      libraryPromise = Promise.all([
        root.google?.accounts?.oauth2 ? Promise.resolve() : addScript('https://accounts.google.com/gsi/client'),
        root.gapi?.load ? Promise.resolve() : addScript('https://apis.google.com/js/api.js')
      ]).then(() => new Promise((resolve, reject) => {
        root.gapi.load('picker', {callback: resolve, onerror: () => reject(new Error('Google 檔案選擇器載入失敗。')), timeout: 15000, ontimeout: () => reject(new Error('Google 檔案選擇器載入逾時。'))});
      })).catch(error => { libraryPromise = null; throw error; });
    }
    return libraryPromise;
  }

  function authorize(clientId) {
    return new Promise((resolve, reject) => {
      const client = root.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: response => {
          if (response.error || !response.access_token) return reject(new Error('Google 授權未完成，請重新連線。'));
          resolve({token: response.access_token, expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000});
        },
        error_callback: () => reject(new Error('Google 登入視窗未完成，請重新連線。'))
      });
      client.requestAccessToken({prompt: 'consent'});
    });
  }

  function chooseFile(auth, apiKey, projectNumber) {
    return new Promise((resolve, reject) => {
      try {
        const view = new root.google.picker.DocsView(root.google.picker.ViewId.SPREADSHEETS)
          .setMimeTypes('application/vnd.google-apps.spreadsheet')
          .setMode(root.google.picker.DocsViewMode.LIST);
        const picker = new root.google.picker.PickerBuilder()
          .addView(view).setOAuthToken(auth.token).setDeveloperKey(apiKey)
          .setAppId(projectNumber).setOrigin(root.location.origin)
          .setCallback(result => {
            if (result.action === root.google.picker.Action.PICKED) resolve(result.docs?.[0] || null);
            else if (result.action === root.google.picker.Action.CANCEL) resolve(null);
          }).build();
        picker.setVisible(true);
      } catch (error) { reject(error); }
    });
  }

  function ensureAuth(session) {
    if (!session?.token || Date.now() >= session.expiresAt - 5000) throw new Error('Google 授權已過期，請重新連線。');
  }

  async function request(session, suffix, options = {}) {
    ensureAuth(session);
    let response;
    try {
      response = await fetch(BASE + encodeURIComponent(session.id) + suffix, {
        ...options,
        headers: {Authorization: `Bearer ${session.token}`, ...(options.body ? {'Content-Type': 'application/json'} : {})}
      });
    } catch (_) { throw new Error('無法連線 Google Sheet，請確認網路後再試。'); }
    if (!response.ok) {
      if (response.status === 401) throw new Error('Google 授權已過期，請重新連線。');
      if (response.status === 403) throw new Error('無法存取這份試算表。請確認已啟用 Google Sheets API，並在選檔視窗選擇自己的「韓文單字」。');
      throw new Error(`Google Sheet 讀寫失敗（${response.status}），請稍後再試。`);
    }
    return response.json();
  }

  function rangeFor(tab, end) {
    return `'${tab.replace(/'/g, "''")}'!A1:B${end || ''}`;
  }

  function parseRows(values) {
    const header = values[0] || [];
    if (String(header[0] || '').trim() !== '韓文' || String(header[1] || '').trim() !== '中文') {
      throw new Error('試算表第一列必須是「韓文」和「中文」；請選擇正確的試算表。');
    }
    const rows = values.slice(1).map(row => [String(row[0] ?? ''), String(row[1] ?? '')]);
    while (rows.length && !rows[rows.length - 1][0] && !rows[rows.length - 1][1]) rows.pop();
    for (const row of rows) {
      if (!row[0].trim() || !row[1].trim()) throw new Error('試算表的單字列有空白或缺少韓文、中文，請先在 Sheet 補齊或移除空白列。');
      if (row.some(cell => cell.startsWith('='))) throw new Error('試算表的單字欄含有公式；為避免覆蓋公式，請先改為一般文字。');
    }
    return rows;
  }

  async function readRows(session) {
    const range = encodeURIComponent(rangeFor(session.tab));
    const result = await request(session, `/values/${range}?valueRenderOption=FORMULA`);
    return parseRows(result.values || []);
  }

  async function open(auth, file) {
    if (!file?.id) throw new Error('未取得試算表資料，請重新選擇檔案。');
    const session = {token: auth.token, expiresAt: auth.expiresAt, id: file.id, name: file.name || 'Google Sheet'};
    const metadata = await request(session, '?fields=sheets(properties(title,sheetId))');
    const tabs = metadata.sheets || [];
    const tab = tabs.find(sheet => sheet.properties?.title === '工作表1') || tabs[0];
    if (!tab?.properties?.title) throw new Error('找不到試算表分頁。');
    session.tab = tab.properties.title;
    session.snapshot = await readRows(session);
    return session;
  }

  async function refresh(session) {
    session.snapshot = await readRows(session);
    return session.snapshot.map(row => [...row]);
  }

  async function save(session, words) {
    const current = await readRows(session);
    if (JSON.stringify(current) !== JSON.stringify(session.snapshot)) {
      throw new Error('試算表已在其他地方更新。為避免覆蓋，請先重新讀取 Sheet，再重新編輯。');
    }
    const next = words.map(row => [String(row[0]), String(row[1])]);
    if (next.some(row => !row[0].trim() || !row[1].trim())) throw new Error('每列都需要韓文和中文。');
    if (next.some(row => row.some(cell => cell.startsWith('=')))) throw new Error('單字不能以 = 開頭，請確認內容後再儲存。');
    const count = Math.max(current.length, next.length);
    if (!count) return [];
    const values = [...next, ...Array.from({length: count - next.length}, () => ['', ''])];
    const range = `'${session.tab.replace(/'/g, "''")}'!A2:B${count + 1}`;
    try {
      await request(session, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        method: 'PUT', body: JSON.stringify({range, majorDimension: 'ROWS', values})
      });
    } catch (error) {
      throw new Error(`無法確認儲存是否完成，請先重新讀取 Sheet 再操作。（${error.message}）`);
    }
    let saved;
    try { saved = await readRows(session); }
    catch (_) { throw new Error('儲存要求已送出，但無法確認結果；請重新讀取 Sheet 後再操作。'); }
    if (JSON.stringify(saved) !== JSON.stringify(next)) throw new Error('儲存後的內容與預期不同；請重新讀取 Sheet 後再操作。');
    session.snapshot = saved;
    return saved.map(row => [...row]);
  }

  function revoke(session) {
    if (session?.token && root.google?.accounts?.oauth2) root.google.accounts.oauth2.revoke(session.token, () => {});
  }

  const api = {loadLibraries, authorize, chooseFile, open, refresh, save, revoke, parseRows};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoreanSheets = api;
})(typeof window === 'undefined' ? globalThis : window);
