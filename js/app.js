(() => {
  "use strict";

  const API_BASE = "https://itunes.apple.com/search";
  const PAGE_SIZE = 30;

  const HOT_KEYWORDS = [
    "周杰伦", "邓紫棋", "林俊杰", "Taylor Swift", "五月天", "薛之谦", "Beyond", "Ed Sheeran",
  ];

  const ENTITY_CONFIG = {
    song: { label: "歌曲", attribute: "" },
    album: { label: "专辑", attribute: "" },
    musicArtist: { label: "歌手", attribute: "" },
    musicVideo: { label: "MV", attribute: "" },
  };

  const els = {
    form: document.getElementById("search-form"),
    input: document.getElementById("search-input"),
    tabs: document.getElementById("type-tabs"),
    country: document.getElementById("country-select"),
    hot: document.getElementById("hot-keywords"),
    status: document.getElementById("status"),
    results: document.getElementById("results"),
    loadMore: document.getElementById("load-more"),
    playerBar: document.getElementById("player-bar"),
    playerArt: document.getElementById("player-art"),
    playerTitle: document.getElementById("player-title"),
    playerArtist: document.getElementById("player-artist"),
    playerToggle: document.getElementById("player-toggle"),
    playerProgress: document.getElementById("player-progress"),
    playerProgressInner: document.getElementById("player-progress-inner"),
    playerTime: document.getElementById("player-time"),
    playerClose: document.getElementById("player-close"),
  };

  const state = {
    term: "",
    entity: "song",
    country: "CN",
    offset: 0,
    loading: false,
    lastRequestId: 0,
  };

  const audio = new Audio();
  audio.preload = "none";
  let currentPlayBtn = null;

  /* ---------- 工具函数 ---------- */

  function formatDuration(ms) {
    if (!ms) return "";
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function formatTime(sec) {
    if (!isFinite(sec)) sec = 0;
    const m = Math.floor(sec / 60);
    const s = String(Math.floor(sec % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  function hiResArtwork(url) {
    return url ? url.replace(/100x100bb/, "400x400bb") : "";
  }

  function setStatus(html) {
    els.status.innerHTML = html || "";
  }

  /* ---------- 搜索 ---------- */

  async function search({ append = false } = {}) {
    const term = state.term.trim();
    if (!term) return;

    state.loading = true;
    const requestId = ++state.lastRequestId;

    if (!append) {
      els.results.innerHTML = "";
      els.loadMore.classList.add("hidden");
      setStatus('<span class="spinner"></span>正在搜索…');
    } else {
      els.loadMore.textContent = "加载中…";
      els.loadMore.disabled = true;
    }

    const params = new URLSearchParams({
      term,
      media: "music",
      entity: state.entity,
      country: state.country,
      limit: String(PAGE_SIZE),
      offset: String(state.offset),
    });

    try {
      const res = await fetch(`${API_BASE}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // 用户在等待期间发起了新搜索,丢弃过期结果
      if (requestId !== state.lastRequestId) return;

      const items = data.results || [];

      if (!append && items.length === 0) {
        setStatus(`没有找到与「${escapeHtml(term)}」相关的${ENTITY_CONFIG[state.entity].label},换个关键词或地区试试`);
        return;
      }

      if (!append) {
        setStatus(`为你找到 ${items.length}${items.length >= PAGE_SIZE ? "+" : ""} 条「${escapeHtml(term)}」的结果`);
      }

      renderResults(items, { append });

      state.offset += items.length;
      if (items.length >= PAGE_SIZE) {
        els.loadMore.classList.remove("hidden");
      } else {
        els.loadMore.classList.add("hidden");
      }
    } catch (err) {
      if (requestId !== state.lastRequestId) return;
      setStatus(`<span class="error">搜索失败:${escapeHtml(err.message)},请检查网络后重试</span>`);
    } finally {
      state.loading = false;
      els.loadMore.textContent = "加载更多";
      els.loadMore.disabled = false;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------- 渲染 ---------- */

  function renderResults(items, { append }) {
    const frag = document.createDocumentFragment();
    for (const item of items) {
      frag.appendChild(createCard(item));
    }
    if (!append) els.results.innerHTML = "";
    els.results.appendChild(frag);
  }

  function createCard(item) {
    const card = document.createElement("article");
    card.className = "card";

    const kind = item.wrapperType === "artist" ? "artist"
      : item.wrapperType === "collection" ? "album"
      : item.kind === "music-video" ? "mv"
      : "song";

    const title = item.trackName || item.collectionName || item.artistName || "未知";
    const artist = item.artistName || "";
    const album = item.collectionName || "";
    const artwork = hiResArtwork(item.artworkUrl100);
    const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : "";
    const genre = item.primaryGenreName || "";
    const duration = formatDuration(item.trackTimeMillis);
    const link = item.trackViewUrl || item.collectionViewUrl || item.artistLinkUrl || "";
    const preview = item.previewUrl || "";

    const artWrap = document.createElement("div");
    artWrap.className = "card-art-wrap";
    if (artwork) {
      const img = document.createElement("img");
      img.className = "card-art";
      img.loading = "lazy";
      img.src = artwork;
      img.alt = title;
      artWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "card-art-placeholder";
      ph.textContent = kind === "artist" ? "🎤" : "🎵";
      artWrap.appendChild(ph);
    }

    if (preview) {
      const playBtn = document.createElement("button");
      playBtn.className = "play-btn";
      playBtn.textContent = "▶";
      playBtn.title = "试听 30 秒";
      playBtn.addEventListener("click", () => togglePreview(playBtn, item));
      artWrap.appendChild(playBtn);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const titleEl = document.createElement("div");
    titleEl.className = "card-title";
    titleEl.textContent = title;
    body.appendChild(titleEl);

    if (kind !== "artist" && artist) {
      const sub = document.createElement("div");
      sub.className = "card-sub";
      sub.textContent = artist + (kind === "song" && album ? ` · ${album}` : "");
      sub.title = sub.textContent;
      body.appendChild(sub);
    }

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = kind === "artist" ? "歌手" : kind === "album" ? "专辑" : kind === "mv" ? "MV" : "歌曲";
    meta.appendChild(badge);

    const metaBits = [genre, year, duration].filter(Boolean).join(" · ");
    if (metaBits) {
      const span = document.createElement("span");
      span.textContent = metaBits;
      meta.appendChild(span);
    }

    if (link) {
      const a = document.createElement("a");
      a.className = "card-link";
      a.href = link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "详情 ↗";
      meta.appendChild(a);
    }

    body.appendChild(meta);
    card.appendChild(artWrap);
    card.appendChild(body);
    return card;
  }

  /* ---------- 试听播放器 ---------- */

  function togglePreview(btn, item) {
    const url = item.previewUrl;
    if (audio.src === url && !audio.paused) {
      audio.pause();
      return;
    }

    if (audio.src !== url) {
      audio.src = url;
      els.playerArt.src = hiResArtwork(item.artworkUrl100) || "";
      els.playerTitle.textContent = item.trackName || item.collectionName || "";
      els.playerArtist.textContent = item.artistName || "";
      els.playerProgressInner.style.width = "0%";
    }

    setActivePlayBtn(btn);
    els.playerBar.classList.remove("hidden");
    audio.play().catch(() => {
      setStatus('<span class="error">试听播放失败,请稍后重试</span>');
    });
  }

  function setActivePlayBtn(btn) {
    if (currentPlayBtn && currentPlayBtn !== btn) {
      currentPlayBtn.textContent = "▶";
      currentPlayBtn.classList.remove("playing");
    }
    currentPlayBtn = btn;
  }

  function syncPlayState(playing) {
    els.playerToggle.textContent = playing ? "❚❚" : "▶";
    if (currentPlayBtn) {
      currentPlayBtn.textContent = playing ? "❚❚" : "▶";
      currentPlayBtn.classList.toggle("playing", playing);
    }
  }

  audio.addEventListener("play", () => syncPlayState(true));
  audio.addEventListener("pause", () => syncPlayState(false));
  audio.addEventListener("ended", () => {
    syncPlayState(false);
    els.playerProgressInner.style.width = "0%";
  });
  audio.addEventListener("timeupdate", () => {
    const dur = audio.duration || 30;
    const pct = (audio.currentTime / dur) * 100;
    els.playerProgressInner.style.width = `${pct}%`;
    els.playerTime.textContent = `${formatTime(audio.currentTime)} / ${formatTime(dur)}`;
  });

  els.playerToggle.addEventListener("click", () => {
    if (!audio.src) return;
    if (audio.paused) audio.play();
    else audio.pause();
  });

  els.playerProgress.addEventListener("click", (e) => {
    if (!audio.duration) return;
    const rect = els.playerProgress.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  });

  els.playerClose.addEventListener("click", () => {
    audio.pause();
    audio.removeAttribute("src");
    els.playerBar.classList.add("hidden");
    if (currentPlayBtn) {
      currentPlayBtn.textContent = "▶";
      currentPlayBtn.classList.remove("playing");
      currentPlayBtn = null;
    }
  });

  /* ---------- 事件绑定 ---------- */

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.term = els.input.value;
    state.offset = 0;
    search();
  });

  els.tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    for (const t of els.tabs.querySelectorAll(".tab")) {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    }
    state.entity = tab.dataset.entity;
    if (state.term.trim()) {
      state.offset = 0;
      search();
    }
  });

  els.country.addEventListener("change", () => {
    state.country = els.country.value;
    if (state.term.trim()) {
      state.offset = 0;
      search();
    }
  });

  els.loadMore.addEventListener("click", () => {
    if (!state.loading) search({ append: true });
  });

  for (const kw of HOT_KEYWORDS) {
    const btn = document.createElement("button");
    btn.className = "hot-tag";
    btn.textContent = kw;
    btn.addEventListener("click", () => {
      els.input.value = kw;
      state.term = kw;
      state.offset = 0;
      search();
    });
    els.hot.appendChild(btn);
  }
})();
