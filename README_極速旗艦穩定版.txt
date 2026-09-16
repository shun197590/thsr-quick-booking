台灣高鐵｜一鍵快速訂票 PWA
極速旗艦穩定版 v1

【核心檔案】
- index.html
- styles.css
- app.js
- manifest.json
- service-worker.js
- icon-192.png
- icon-512.png

【官方入口】
網路訂票：
https://irs.thsrc.com.tw/IMINT/

時刻表與票價：
https://www.thsrc.com.tw/ArticleContent/a3b630bb-1066-4352-a1ef-58c7b4e8ef7c

對號座訂位開放時程：
https://www.thsrc.com.tw/ArticleContent/d4b49835-e43b-4be8-bc4d-0a1fe74143ff

網路訂票規定：
https://www.thsrc.com.tw/ArticleContent/dea241a9-fe69-4e9d-b9a5-6caed6e486d6

【旗艦功能】
1. iPhone / Android 共用 PWA。
2. 12 個高鐵車站完整選單。
3. 單程 / 去回程。
4. 快速起訖站預設。
5. 去程 / 回程日期時間。
6. 車廂偏好。
7. 全票、孩童票、敬老票、愛心票、大學生票人數。
8. 基本張數檢查：單程最多 10 張；去回程每方向最多 5 張。
9. 多行程管理。
10. 目前「主攻行程」。
11. 開賣時間秒級倒數。
12. 開賣前 30 / 10 / 5 / 1 分鐘提醒。
13. 系統通知（瀏覽器支援時）。
14. Android 震動提醒。
15. 提示音。
16. Screen Wake Lock 保持螢幕喚醒。
17. 一鍵複製行程摘要＋直達高鐵官方網路訂票。
18. 主攻行程單欄快速複製。
19. 一鍵產生「開賣提醒」.ics 行事曆。
20. 一鍵產生「乘車行程」.ics 行事曆。
21. 狀態：計畫中 / 待開賣 / 待訂票 / 已訂位 / 已付款 / 已取票 / 已取消。
22. 訂位代號紀錄。
23. 付款期限紀錄。
24. 依開賣時間排序。
25. 依乘車日期排序。
26. JSON 完整備份與還原。
27. 離線開啟 PWA 介面。
28. 官方訂票、時刻票價、開放時程、規定快捷入口。
29. 不保存身分證、護照、信用卡等高敏感交易資料。

【一般 29 日規則參考】
PWA 內「一般29日規則參考」只把乘車日往前 28 天、00:00 填入提醒欄，並非保證的官方開賣時間。
週五／週六延伸訂位、疏運或特殊公告可能不同，務必以高鐵官方公告為準。

【GitHub Pages 安裝】
1. 建立 GitHub repository，例如 thsr-quick-booking。
2. 解壓縮本 ZIP。
3. 將所有檔案上傳至 repository 根目錄。
4. GitHub → Settings → Pages。
5. Branch 選 main，Folder 選 /(root)。
6. Save。
7. 等 GitHub Pages 網址產生後，用手機開啟。

Android：Chrome → ⋮ → 安裝應用程式／加到主畫面。
iPhone：Safari → 分享 → 加入主畫面。

【穩定版設計原則】
高鐵官方訂票系統位於 irs.thsrc.com.tw，與 GitHub Pages PWA 不同網域。
本版不使用容易因官網 DOM 改版而失效的自動填表／自動送出，也不嘗試破解驗證或自動付款。

極速流程：
行程預存 → 開賣倒數 → 一鍵複製摘要 → 開官方訂票 → 在官方系統完成車次選擇與交易。

【資料安全】
資料只存在目前裝置 localStorage。
不要在公用手機保存訂位代號。
本 PWA 刻意不提供身分證號、護照號碼、信用卡號、安全碼儲存欄位。
