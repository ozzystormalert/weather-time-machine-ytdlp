
// GREEN LINE 1 — HISTORICAL VIDEO VERIFICATION SERVER
// Engines 3A and 4A
// Node.js 22+
// Store YOUTUBE_API_KEY in Render environment variables.
// Do not put the API key inside this JavaScript file.

const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const KEY = process.env.YOUTUBE_API_KEY || "";

const MAX_PER_IP = 24;
const requests = new Map();

function allowedOrigin(origin) {
  if (!origin) return "*";

  try {
    const u = new URL(origin);

    return u.protocol === "https:" &&
      (
        u.hostname === "1-newupdates.blogspot.com" ||
        u.hostname === "localhost"
      )
      ? origin
      : "";
  } catch {
    return "";
  }
}

function response(res, code, data, origin) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin(origin) || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

// Convert YouTube ISO 8601 duration to seconds.
function seconds(iso) {
  const m =
    /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/
      .exec(iso || "");

  if (!m) return null;

  return (
    Number(m[1] || 0) * 86400 +
    Number(m[2] || 0) * 3600 +
    Number(m[3] || 0) * 60 +
    Number(m[4] || 0)
  );
}

// Request YouTube Data API metadata.
async function youtube(endpoint, params) {
  const u = new URL(
    "https://www.googleapis.com/youtube/v3/" + endpoint
  );

  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, String(v));
  }

  u.searchParams.set("key", KEY);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 16000);

  try {
    const r = await fetch(u, {
      signal: ctl.signal
    });

    const j = await r.json();

    if (!r.ok) {
      throw Object.assign(
        new Error(
          j.error?.message || "YouTube API error"
        ),
        { code: r.status }
      );
    }

    return j;
  } finally {
    clearTimeout(timer);
  }
}

// Check historical-site relevance.
function relevant(video, name, state) {
  const raw =
    (video.title + " " + video.description).toLowerCase();

  const terms = name.toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(
      t =>
        t.length >= 4 &&
        ![
          "national",
          "historic",
          "historical",
          "memorial",
          "monument",
          "house",
          "park",
          "site"
        ].includes(t)
    ) || [];

  const n = terms.filter(t => raw.includes(t)).length;

  const st = state.toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 4);

  return {
    match: n >= Math.min(2, terms.length) && n > 0,
    matched: n,
    total: terms.length,
    stateMentioned: st.some(t => raw.includes(t))
  };
}

// Run independent Engine 3A or 4A audit.
async function audit(query) {
  const kind = query.engine === "4" ? "4" : "3";

  const name = (query.site || "").trim();
  const state = (query.state || "").trim();

  if (
    name.length < 3 ||
    name.length > 180 ||
    state.length < 2 ||
    state.length > 80
  ) {
    throw Object.assign(
      new Error(
        "A historical site name and state are required."
      ),
      { code: 400 }
    );
  }

  if (!KEY) {
    throw Object.assign(
      new Error(
        "YOUTUBE_API_KEY is not configured on the Render server."
      ),
      { code: 503 }
    );
  }

  const term = kind === "4"
    ? " history documentary"
    : " history historic";

  // Discover candidate videos.
  const search = await youtube("search", {
    part: "snippet",
    q: name + " " + state + term,
    type: "video",
    maxResults: 25,
    safeSearch: "moderate"
  });

  const ids = [
    ...new Set(
      (search.items || [])
        .map(x => x.id?.videoId)
        .filter(Boolean)
    )
  ];

  if (!ids.length) {
    return {
      ok: true,
      complete: false,
      reason:
        "No results returned in limited YouTube search",
      videos: [],
      engine: Number(kind)
    };
  }

  // Obtain actual reported video durations.
  const detail = await youtube("videos", {
    part: "snippet,contentDetails,status",
    id: ids.join(",")
  });

  const videos = (detail.items || []).map(x => {
    const dur = seconds(x.contentDetails?.duration);

    const title = x.snippet?.title || "";
    const description = x.snippet?.description || "";

    const r = relevant(
      { title, description },
      name,
      state
    );

    const status =
      x.status?.privacyStatus || "unknown";

    // Engine 3A: short videos below 20 minutes.
    // Engine 4A: documentaries 20 minutes or longer.
    const qualifyingDuration =
      dur !== null &&
      (
        kind === "4"
          ? dur >= 1200
          : dur > 0 && dur < 1200
      );

    const educational =
      kind === "3" ||
      /\b(documentary|historical|history|museum|heritage|educational|historian|archives?|lecture)\b/i
        .test(title + " " + description);

    const checks = {
      identity: Boolean(
        x.id &&
        x.snippet?.channelTitle &&
        x.snippet?.publishedAt
      ),
      public: status === "public",
      duration: qualifyingDuration,
      relevance: r.match,
      educational
    };

    return {
      id: x.id,
      url: "https://www.youtube.com/watch?v=" + x.id,
      title,
      description,
      channel: x.snippet?.channelTitle || "",
      published: x.snippet?.publishedAt || "",
      privacy: status,
      durationISO: x.contentDetails?.duration || "",
      durationSeconds: dur,
      relevance: r,
      checks,
      qualified: Object.values(checks).every(Boolean)
    };
  });

  return {
    ok: true,
    engine: Number(kind),
    site: name,
    state,
    complete: false,
    reason:
      "Sampled at most 25 search candidates. " +
      "This cannot prove that no qualifying videos exist.",
    videos,
    qualifiedCount:
      videos.filter(v => v.qualified).length,
    checkedCount: videos.length,
    verifiedScope:
      "YouTube metadata eligibility only, " +
      "not historical authenticity"
  };
}

// HTTP server for Render.
http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    return response(res, 204, {}, origin);
  }

  let u;

  try {
    u = new URL(req.url, "http://localhost");
  } catch {
    return response(
      res,
      400,
      { ok: false, error: "Invalid URL" },
      origin
    );
  }

  // Health endpoint.
  if (u.pathname === "/health") {
    return response(
      res,
      200,
      {
        ok: true,
        service: "green-line-landmark-video",
        hasKey: Boolean(KEY)
      },
      origin
    );
  }

  // Historical landmark video audit endpoint.
  if (
    u.pathname !== "/audit-video" ||
    req.method !== "GET"
  ) {
    return response(
      res,
      404,
      { ok: false, error: "Not found" },
      origin
    );
  }

  if (origin && !allowedOrigin(origin)) {
    return response(
      res,
      403,
      {
        ok: false,
        error: "Browser origin not allowed"
      },
      origin
    );
  }

  // Basic request rate limiting.
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();

  const recent = (requests.get(ip) || [])
    .filter(t => now - t < 60000);

  if (recent.length >= MAX_PER_IP) {
    return response(
      res,
      429,
      {
        ok: false,
        error: "Rate limit exceeded"
      },
      origin
    );
  }

  recent.push(now);
  requests.set(ip, recent);

  try {
    const data = await audit({
      site: u.searchParams.get("site") || "",
      state: u.searchParams.get("state") || "",
      engine: u.searchParams.get("engine") || "3"
    });

    response(res, 200, data, origin);

  } catch (e) {
    response(
      res,
      e.code >= 400 && e.code < 600
        ? e.code
        : 502,
      {
        ok: false,
        error: String(e.message || e)
      },
      origin
    );
  }

}).listen(PORT, () => {
  console.log(
    "Green Line video service listening on " + PORT
  );
});
