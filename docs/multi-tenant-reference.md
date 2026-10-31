# 多租戶架構參考筆記 — 摘自 supastarter（2026-11-01）

> 來源：`docs/supastarter-nextjs-docs/organizations/*`（nextjs 版）＋ `E-共用工具與開發底座/supastarter-upstream-test`（實際 codebase）。
> 用途：agent-aiver 的多租戶（tenant）功能升級參考。已採用的標 ✅，待評估的標 ⬜。

## 核心模式

### 1. 活躍租戶（active tenant）的判定 — URL path 優先於 session ✅ 已參考

supastarter 刻意用 **path parameter**（`/app/my-organization/...`）而不是 session 存活躍組織，理由：

1. 從 URL 就能看懂現在在哪個租戶
2. 連結可以直接分享（貼給同租戶成員就能開）
3. 換租戶＝改網址，直覺
4. **同一瀏覽器不同分頁可以用不同租戶**（session 全域會互相覆蓋，path 不會）

→ 我們目前用 session 存 slug，未來若支援「一人多店」要改 path 或接受限制。

### 2. Session 結構（better-auth）⬜ 部分採用

supastarter 的 session 有兩個關鍵欄位（upstream `packages/database/prisma/zod/index.ts`）：

```
Session: id, expiresAt, ipAddress, userAgent, userId,
         impersonatedBy        ← 管理員假冒身分（2026-11-01 我們已加）✅
         activeOrganizationId  ← 活躍租戶
         token, createdAt, updatedAt
```

- `impersonatedBy`：平台管理員一鍵進入任租戶，session 記錄「是誰假冒的」，方便稽核＋隨時收回。✅ 已照做（`POST /api/console/tenants/:slug/impersonate`）
- `activeOrganizationId`：登入時從 `user.lastActiveOrganizationId` 帶入（`packages/auth/auth.ts:63`），使用者上次在哪個租戶就回哪個。

### 3. 資料表設計：所有租戶資料帶 organizationId ⬜

```prisma
model Post {
  authorId        String   // 誰建的（個人）
  organizationId  String   // 屬於哪個租戶（必填）← 我們的 faqs/conversations 已有 tenant_id ✅
  organization    Organization @relation(...)
}
```

原則：**個人歸個人（authorId）、租戶歸租戶（organizationId）都記**，刪成員不會丟租戶資料。

### 4. 權限矩陣用 Permix，不要字串比對角色 ⬜

supastarter 用 `check("organization.manage")` 這種能力檢查取代 `role === 'admin'`。角色層級：`owner / admin / member`（對應我們的：店主 / 員工 / —，我們目前只有店主一層）。

### 5. 租戶成員管理 ⬜ 待做

- 邀請制：輸入 email → 寄邀請信 → 對方接受成 member
- 我們目前的對應物：`PATCH /api/console/tenants/:slug/admin`（平台管理員直接填 userId 開通），還沒有「店主自己邀請員工」

## 套用到 agent-aiver 的待辦（同步記在 debug SR）

| 項目 | 我們現況 | 參考後下一步 |
|---|---|---|
| 活躍租戶判定 | session 存 slug | 一人多店時改 URL path 或文件化限制 |
| impersonate | ✅ 已有（2026-11-01） | 補「假冒操作寫 audit_events」稽核 |
| 員工身分 | 無 | 加 tenants_members 表（owner/member 兩級） |
| 權限檢查 | role 字串比對 | 功能變多後引進能力矩陣 |
| 邀請流程 | 平台管理員手開 | 店主自助邀請（LINE 分享連結綁 userId） |
