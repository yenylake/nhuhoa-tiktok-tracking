// Đọc Sheet "2. Tracking TikTok" + lấy chỉ số kênh TikTok → docs/data/latest.json & history.json
// Chạy: node scripts/update.mjs   (GitHub Actions chạy tự động 10:00 giờ VN mỗi ngày)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'docs', 'data');
const SHEET_ID = '18G5TxrblvjeK_Fd3E-yHlj4aGoinSMCpl8e2yKiPhD0';
const GID = '688465122';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const readJson = async (f, fallback) => {
  try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; }
};

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const norm = (s) => fold(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function readSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const rows = parseCsv(await res.text());

  const titleRow = rows.find((r) => /thời gian theo dõi/i.test(r[0] || ''));
  const headIdx = rows.findIndex((r) => (r[0] || '').trim() === 'STT');
  const dateRow = rows[headIdx + 1] || [];
  const dates = [];
  for (let c = 4; c < dateRow.length; c++) {
    const m = (dateRow[c] || '').match(/(\d{1,2})\/(\d{1,2})(?:\s*\(([^)]+)\))?/);
    if (m) dates.push({ col: c, key: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`, dow: m[3] || '' });
  }

  const links = await readHyperlinks();
  const channels = [];
  for (const r of rows.slice(headIdx + 2)) {
    if (!/^\d+$/.test((r[0] || '').trim())) continue;
    const raw = (r[2] || '').trim();
    const urls = [...(links[r[0].trim()] || []), ...(raw.match(/https?:\/\/\S+/g) || [])];
    const name = raw.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
    const posts = {};
    for (const d of dates) posts[d.key] = /✓|✔|x|v/i.test((r[d.col] || '').trim());
    channels.push({
      stt: Number(r[0]), dept: (r[1] || '').trim(), name, urls,
      plan: (r[3] || '').replace(/\s+/g, ' ').trim(), posts,
    });
  }
  return { period: (titleRow?.[0] || '').split(':').slice(1).join(':').trim(), dates: dates.map(({ key, dow }) => ({ key, dow })), channels };
}

// Link gắn vào chữ (hyperlink) không có trong CSV → đọc bản HTML của Sheet, gom link TikTok theo STT
async function readHyperlinks() {
  const out = {};
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview/sheet?headers=true&gid=${GID}`;
    const html = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
    for (const tr of html.split(/<tr[\s>]/).slice(1)) {
      const cells = tr.split(/<td[\s>]/).slice(1);
      const stt = (cells[0] || '').replace(/<[^>]*>/g, '').replace(/^[^>]*>/, '').trim();
      if (!/^\d+$/.test(stt)) continue;
      const hrefs = [...(cells[2] || '').matchAll(/href="([^"]+)"/g)].map((m) => {
        const h = m[1].replace(/&amp;/g, '&');
        const q = h.match(/[?&]q=([^&]+)/);
        return q ? decodeURIComponent(q[1]) : h;
      }).filter((h) => /tiktok\.com/i.test(h));
      if (hrefs.length) out[stt] = hrefs;
    }
  } catch (e) { console.warn('Không đọc được hyperlink:', e.message); }
  return out;
}

async function handleFromUrl(u) {
  let m = u.match(/tiktok\.com\/@([\w.]+)/i);
  if (m) return m[1];
  if (/tiktok\.com/i.test(u)) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'manual' });
      const loc = res.headers.get('location') || '';
      m = loc.match(/tiktok\.com\/@([\w.]+)/i);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

async function fetchProfile(handle) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://www.tiktok.com/@${handle}?lang=vi-VN`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'vi-VN,vi;q=0.9' },
      });
      const html = await res.text();
      const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (m) {
        const info = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
        if (info?.user?.uniqueId) {
          const s = info.stats || {};
          return {
            handle: info.user.uniqueId,
            nickname: info.user.nickname,
            avatar: info.user.avatarMedium || info.user.avatarThumb || '',
            bio: info.user.signature || '',
            verified: !!info.user.verified,
            stats: {
              followers: s.followerCount ?? 0,
              following: s.followingCount ?? 0,
              hearts: s.heartCount ?? s.heart ?? 0,
              videos: s.videoCount ?? 0,
            },
          };
        }
        if (/statusCode":10221|statusCode":10202/.test(m[1])) return null; // không tồn tại
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`Không đọc được @${handle}`);
}

async function resolveChannel(ch, overrides) {
  if (overrides[ch.dept]) return { handle: overrides[ch.dept], source: 'override' };
  for (const u of ch.urls) {
    const h = await handleFromUrl(u);
    if (h) return { handle: h, source: 'link' };
  }
  if (!ch.name) return null;
  const at = ch.name.match(/@([\w.]+)/);
  if (at) return { handle: at[1], source: 'handle' };
  if (/^[\w.]+$/.test(ch.name)) return { handle: ch.name, source: 'handle' };
  // Đoán theo tên kênh, chỉ nhận khi nickname khớp tên
  return { handle: norm(ch.name), source: 'guess' };
}

async function main() {
  const overrides = await readJson(path.join(ROOT, 'scripts', 'handles.json'), {});
  const prev = await readJson(path.join(DATA_DIR, 'latest.json'), { channels: [] });
  const history = await readJson(path.join(DATA_DIR, 'history.json'), {});
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600e3);
  const today = vn.toISOString().slice(0, 10);
  // Lịch dự phòng chạy nhiều lần trong sáng: nếu hôm nay đã cập nhật sau 10:00 thì bỏ qua
  if (process.env.SKIP_IF_FRESH && prev.updatedAt) {
    const last = new Date(new Date(prev.updatedAt).getTime() + 7 * 3600e3);
    if (last.toISOString().slice(0, 10) === today && last.getUTCHours() >= 10) {
      console.log('Hôm nay đã cập nhật lúc', last.toISOString().slice(11, 16), '→ bỏ qua');
      return;
    }
  }
  const sheet = await readSheet();

  const out = [];
  for (const ch of sheet.channels) {
    const item = { ...ch, handle: null, url: null, status: 'no-channel', profile: null };
    delete item.urls;
    const r = await resolveChannel(ch, overrides);
    if (r) {
      try {
        const p = await fetchProfile(r.handle);
        if (p && (r.source !== 'guess' || norm(p.nickname) === norm(ch.name))) {
          Object.assign(item, { handle: p.handle, url: `https://www.tiktok.com/@${p.handle}`, status: 'ok', profile: p });
        } else {
          item.status = 'not-found';
        }
      } catch (e) {
        const old = prev.channels.find((c) => c.dept === ch.dept && c.profile);
        if (old) Object.assign(item, { handle: old.handle, url: old.url, profile: old.profile, status: 'stale' });
        else item.status = 'error';
        console.warn(ch.dept, e.message);
      }
    }
    if (!ch.name && !ch.urls.length) item.status = 'no-channel';
    out.push(item);
    console.log(`${item.dept.padEnd(18)} ${item.status.padEnd(10)} ${item.handle || ''} ${item.profile ? JSON.stringify(item.profile.stats) : ''}`);
    await new Promise((r) => setTimeout(r, 800));
  }

  history[today] = Object.fromEntries(out.filter((c) => c.profile).map((c) => [c.dept, c.profile.stats]));
  const latest = { updatedAt: now.toISOString(), period: sheet.period, dates: sheet.dates, channels: out };
  await writeFile(path.join(DATA_DIR, 'latest.json'), JSON.stringify(latest, null, 1));
  await writeFile(path.join(DATA_DIR, 'history.json'), JSON.stringify(history, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
