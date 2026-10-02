import { getStore } from "@netlify/blobs";

const MODES = ["classic", "blitz", "rocks"];
const SIZES = [3, 4, 5, 6];
const KEEP = 100;
const NAME_RE = /^[\p{L}\p{N} _.\-]{1,16}$/u;
const ID_RE = /^e\d{10,16}[a-z0-9]{0,8}$/;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });

function sameOrigin(req) {
  const o = req.headers.get("origin");
  if (!o) return false;
  try { return new URL(o).host === new URL(req.url).host; } catch { return false; }
}

export default async (req) => {
  const store = getStore("leaderboard");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("mode");
    const size = Number(url.searchParams.get("size"));
    if (!MODES.includes(mode) || !SIZES.includes(size)) return json({ error: "bad board" }, 400);
    const list = (await store.get(`${mode}-${size}`, { type: "json" })) || [];
    return json(list.map(({ id, name, score, tile, mode, size, t }) => ({ id, name, score, tile, mode, size, t })));
  }

  if (req.method === "POST") {
    if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
    const text = await req.text();
    if (text.length > 600) return json({ error: "too large" }, 413);
    let b; try { b = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
    const name = typeof b?.name === "string" ? b.name.trim() : "";
    const score = Number(b?.score), tile = Number(b?.tile), size = Number(b?.size);
    const ok = NAME_RE.test(name) && MODES.includes(b?.mode) && SIZES.includes(size)
      && Number.isInteger(tile) && tile >= 2 && tile <= 131072 && (tile & (tile - 1)) === 0
      && Number.isInteger(score) && score > 0 && score <= size * size * tile * Math.log2(tile)
      && typeof b?.id === "string" && ID_RE.test(b.id);
    if (!ok) return json({ error: "bad score" }, 400);

    const key = `${b.mode}-${size}`;
    const list = (await store.get(key, { type: "json" })) || [];
    if (!list.some((e) => e.id === b.id)) list.push({ id: b.id, name, score, tile, mode: b.mode, size, t: Date.now() });
    list.sort((a, c) => c.score - a.score);
    const total = list.length;
    const rank = list.findIndex((e) => e.id === b.id) + 1;
    await store.setJSON(key, list.slice(0, KEEP));
    return json({ ok: true, rank, total });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
};

export const config = { path: "/api/scores" };
