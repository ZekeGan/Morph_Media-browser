// R-285: websites that need the user's own key. Keys are typed in the app settings, kept encrypted on this computer,
// and read only by main; the window only learns whether a site has one and whether the last test worked.
export interface KeyField {
  id: string
  // Shown as the input label (translated in the window).
  label: string
  // Optional fields may stay empty (TheTVDB's subscriber PIN, Danbooru's login with its key).
  optional?: boolean
}
export interface KeySite {
  id: string
  name: string
  // What the key is for, shown under the name.
  purpose: string
  fields: KeyField[]
  // 'required': the source does not work without it; 'optional': it works, the key lifts limits or opens more.
  need: 'required' | 'optional'
  // Where to get it: the anchor in the user guide.
  help: string
  // How to get the key, one or two sentences (translated in the window).
  steps: string
  // A work page used by the key test; the test passes when the site accepts the key, even if this work is gone.
  sample: string
}
export const keySites: KeySite[] = [
  {
    id: 'tmdb',
    name: 'TMDB',
    purpose: '電影與影集',
    fields: [{ id: 'token', label: 'API Key 或 Read Access Token' }],
    need: 'required',
    help: 'tmdb',
    steps:
      '在 themoviedb.org 註冊並登入，到「設定 → API」申請個人用途的金鑰，複製 API Key 或 API Read Access Token。',
    sample: 'https://www.themoviedb.org/movie/603',
  },
  {
    id: 'steamgriddb',
    name: 'SteamGridDB',
    purpose: '遊戲封面與橫幅',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'required',
    help: 'steamgriddb',
    steps: '在 steamgriddb.com 用 Steam 登入，到「Preferences → API」產生 API Key。',
    sample: 'https://www.steamgriddb.com/game/1254',
  },
  {
    id: 'bangumi',
    name: 'Bangumi',
    purpose: '成人（NSFW）條目需要權杖',
    fields: [{ id: 'token', label: '個人存取權杖' }],
    need: 'optional',
    help: 'bangumi',
    steps: '在 bgm.tv 登入，到 next.bgm.tv/demo/access-token 產生個人存取權杖。',
    sample: 'https://bgm.tv/subject/253',
  },
  {
    id: 'danbooru',
    name: 'Danbooru',
    purpose: '提高請求額度',
    fields: [
      { id: 'login', label: '帳號名稱' },
      { id: 'apiKey', label: 'API Key' },
    ],
    need: 'optional',
    help: 'danbooru',
    steps:
      '在 danbooru.donmai.us 登入，到個人資料頁的「API Key」建立金鑰，帳號名稱填你的使用者名稱。',
    sample: 'https://danbooru.donmai.us/posts/1',
  },
  {
    id: 'googlebooks',
    name: 'Google Books',
    purpose: '書籍（不填時共用匿名額度，常被拒絕）',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'optional',
    help: 'google-books',
    steps: '在 Google Cloud Console 建立專案、啟用 Books API，再到「憑證」建立 API 金鑰。',
    sample: 'https://books.google.com/books?id=zyTCAlFPjgYC',
  },
  {
    id: 'fanza',
    name: 'FANZA（DMM）',
    purpose: 'DMM／FANZA 的同人誌與其他商品；沒填時遊戲改經 VNDB 查',
    fields: [
      { id: 'apiId', label: 'API ID' },
      { id: 'affiliateId', label: 'Affiliate ID' },
    ],
    need: 'optional',
    help: 'fanza',
    steps:
      '在 affiliate.dmm.com 註冊 DMM アフィリエイト，到「Webサービス」取得 API ID 與 Affiliate ID（後綴 -990～-999）。',
    sample: 'https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_000001/',
  },
]
export const keySite = (id: string) => keySites.find((site) => site.id === id)
// The sentence main throws when a site needs a key that is missing; the window shows a "go to settings" button for it.
export const KEY_MISSING = '這個網站需要你自己的金鑰；請到「應用程式設定 → 網站金鑰」填入'
// Bangumi without a token answers 404 for NSFW entries as for missing ones.
export const KEY_MAYBE_NSFW =
  '找不到作品，或是需要權杖的成人作品；可到「應用程式設定 → 網站金鑰」填入權杖'
export const KEY_REJECTED = '網站拒絕了你的金鑰；請到「應用程式設定 → 網站金鑰」確認'
export interface KeyStatus {
  set: boolean
  // The result of the last test, if one was made since the key was saved.
  test?: 'ok' | 'failed'
}
