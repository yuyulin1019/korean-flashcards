# 韓文手寫字卡

以「看到中文、手寫韓文、翻開答案自我核對」為核心的單字複習網站。翻開字卡後可使用裝置內建的韓文語音朗讀，或連到 Naver 韓語詞典播放詞典發音。

## 使用方式

直接開啟 `index.html`。在「單字管理」中選擇「匯入筆記 PDF」，可逐頁辨識 PDF，也支援選擇照片。校對辨識結果，整理成每行「韓文, 中文」後加入字卡；也可直接在「單字管理」中維護清單。

PDF 由 PDF.js 在瀏覽器中逐頁轉成影像，再由 Tesseract.js 辨識；照片也由 Tesseract.js 辨識。首次使用需要網路下載 PDF/OCR 程式與韓文、繁體中文辨識資料。手寫 OCR 可能辨識不準，加入字卡前請校對。裝置內建語音使用 Web Speech API 的韓文語音；Naver 發音按鈕會開啟詞典搜尋結果，使用者在 Naver 頁面點發音圖示播放，目前沒有直接嵌入 Naver 詞典音檔。單字目前存在瀏覽器的 `localStorage`，只在同一個瀏覽器設定檔可見。

## 連線私人 Google Sheet

網站支援以 Google 登入並透過 Google Picker 選擇一份試算表。第一列的 A、B 欄必須分別為「韓文」、「中文」；每一列放一組單字。連線後，編輯單字和匯入筆記的結果會寫入該表。登入權杖只存在頁面記憶體中，重新整理後需重新連線。原有的本機單字會保留，可在連線設定中選擇「將本機單字加入 Sheet」。

首次使用需要自行建立 Google Cloud 設定：

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立或選擇專案，記下專案編號（不是專案 ID）。
2. 在「API 和服務 → 程式庫」啟用 Google Sheets API、Google Drive API 和 Google Picker API。
3. 在 Google Auth Platform 設定應用程式資訊與目標對象；若使用外部測試模式，在「測試使用者」加入擁有試算表的 Google 帳戶。在資料存取權限中加入 `https://www.googleapis.com/auth/drive.file`。
4. 建立 OAuth 用戶端，類型選「網頁應用程式」，在「已授權的 JavaScript 來源」加入 `https://yuyulin1019.github.io`，記下產生的用戶端 ID。不要將用戶端密鑰貼入網站。
5. 在「API 和服務 → 憑證」建立 API 金鑰，限制 API 為 Google Picker API；網站限制加入 `https://yuyulin1019.github.io/*` 和 `https://docs.google.com/*`。
6. 透過 [GitHub Pages](https://yuyulin1019.github.io/korean-flashcards/) 開啟網站，點「連線 Google Sheet」，在本機瀏覽器輸入用戶端 ID、API 金鑰和專案編號，登入後選擇「韓文單字」。OAuth 不支援直接從 `file://` 網址登入。

設定值儲存在目前瀏覽器；試算表資料不會寫入 repo。Google OAuth 測試模式可能顯示未驗證提示，授權七天後需要再次同意。若 Sheet 在其他地方被修改，請先按「重新讀取 Sheet」再編輯，以免覆蓋他人的變更。
