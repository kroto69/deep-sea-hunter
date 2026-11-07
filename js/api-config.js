// Single source of truth for the backend API base URL.
//
// Both pages import this — the game (js/online.js) and the collectibles
// page (js/collectibles.js) — so the URL lives in exactly one file. Do
// not hardcode the API URL anywhere else.
//
// Local dev: point this at http://127.0.0.1:3000 while testing against a
// local API, and do not commit that change.
export const API_BASE = 'https://deep-sea-hunter-api.onrender.com';
