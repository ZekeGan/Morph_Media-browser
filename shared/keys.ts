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
    id: 'mal',
    name: 'MyAnimeList',
    purpose: '動畫與漫畫',
    fields: [{ id: 'clientId', label: 'Client ID' }],
    need: 'required',
    help: 'myanimelist',
    steps:
      '在 myanimelist.net 登入，到「帳號設定 → API」建立用戶端（App Type 選 other），複製 Client ID。',
    sample: 'https://myanimelist.net/anime/1',
  },
  {
    id: 'omdb',
    name: 'OMDb',
    purpose: '電影（也接受 IMDb 網址）',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'required',
    help: 'omdb',
    steps: '到 omdbapi.com 的 API Key 頁面填 Email 申請免費金鑰，收信點連結啟用後即可使用。',
    sample: 'https://www.imdb.com/title/tt0133093/',
  },
  {
    id: 'trakt',
    name: 'Trakt',
    purpose: '電影與影集',
    fields: [{ id: 'clientId', label: 'Client ID' }],
    need: 'required',
    help: 'trakt',
    steps: '在 trakt.tv 登入，到「設定 → Your API Apps」建立新應用程式，複製 Client ID。',
    sample: 'https://trakt.tv/movies/the-matrix-1999',
  },
  {
    id: 'rawg',
    name: 'RAWG',
    purpose: '遊戲',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'required',
    help: 'rawg',
    steps: '在 rawg.io 註冊後到 rawg.io/apidocs 取得 API Key；使用時保留回到 RAWG 的連結。',
    sample: 'https://rawg.io/games/portal-2',
  },
  {
    id: 'giantbomb',
    name: 'Giant Bomb',
    purpose: '遊戲',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'required',
    help: 'giant-bomb',
    steps: '在 giantbomb.com 註冊並登入，到 giantbomb.com/api 複製你的 API Key。',
    sample: 'https://www.giantbomb.com/portal-2/3030-27186/',
  },
  {
    id: 'comicvine',
    name: 'Comic Vine',
    purpose: '美式漫畫',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'required',
    help: 'comic-vine',
    steps: '在 comicvine.gamespot.com 註冊並登入，到 comicvine.gamespot.com/api 複製你的 API Key。',
    sample: 'https://comicvine.gamespot.com/batman/4050-796/',
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
    id: 'lastfm',
    name: 'Last.fm',
    purpose: '音樂',
    fields: [{ id: 'apiKey', label: 'API Key' }],
    need: 'required',
    help: 'lastfm',
    steps: '在 last.fm 登入，到 last.fm/api/account/create 建立 API 帳號，複製 API key。',
    sample: 'https://www.last.fm/music/Daft+Punk/Discovery',
  },
  {
    id: 'discogs',
    name: 'Discogs',
    purpose: '音樂（不填也能讀資料，填了才拿得到圖片）',
    fields: [{ id: 'token', label: '個人存取權杖' }],
    need: 'optional',
    help: 'discogs',
    steps:
      '在 discogs.com 登入，到「Settings → Developers」產生個人存取權杖（Personal access token）。',
    sample: 'https://www.discogs.com/release/1',
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
    id: 'igdb',
    name: 'IGDB',
    purpose: '遊戲（用 Twitch 開發者帳號）',
    fields: [
      { id: 'clientId', label: 'Twitch Client ID' },
      { id: 'clientSecret', label: 'Twitch Client Secret' },
    ],
    need: 'required',
    help: 'igdb',
    steps:
      '在 dev.twitch.tv 開啟帳號的兩步驟驗證，到 Console 註冊應用程式（OAuth Redirect 可填 http://localhost），複製 Client ID 並產生 Client Secret。',
    sample: 'https://www.igdb.com/games/portal-2',
  },
  {
    id: 'tvdb',
    name: 'TheTVDB',
    purpose: '影集',
    fields: [
      { id: 'apiKey', label: 'API Key' },
      { id: 'pin', label: '訂閱 PIN', optional: true },
    ],
    need: 'required',
    help: 'thetvdb',
    steps:
      '在 thetvdb.com 登入，到「API Information」申請 API Key；使用者訂閱制金鑰另需填訂閱 PIN。',
    sample: 'https://www.thetvdb.com/series/cowboy-bebop',
  },
  {
    id: 'fanza',
    name: 'FANZA（DMM）',
    purpose: 'DMM／FANZA 商品',
    fields: [
      { id: 'apiId', label: 'API ID' },
      { id: 'affiliateId', label: 'Affiliate ID' },
    ],
    need: 'required',
    help: 'fanza',
    steps:
      '在 affiliate.dmm.com 註冊 DMM アフィリエイト，到「Webサービス」取得 API ID 與 Affiliate ID（後綴 -990～-999）。',
    sample: 'https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_000001/',
  },
  {
    id: 'anidb',
    name: 'AniDB',
    purpose: '動畫（要登記的用戶端名稱與版本）',
    fields: [
      { id: 'client', label: '用戶端名稱' },
      { id: 'clientver', label: '用戶端版本' },
    ],
    need: 'required',
    help: 'anidb',
    steps:
      'AniDB 的 HTTP API 要先在 anidb.net 以帳號登記用戶端（Client），填入登記時的用戶端名稱與版本。',
    sample: 'https://anidb.net/anime/1',
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
