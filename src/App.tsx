import { useMemo, useState, useCallback, useEffect } from "react";
import { album } from "./data/album";
import {
  AESTHETIC_LEVELS,
  type AestheticLevel,
  type AlbumEntry,
} from "./types";
import "./App.css";

type LevelFilter = AestheticLevel | "all";

function LevelBar({ level }: { level: AestheticLevel }) {
  const info = AESTHETIC_LEVELS[level];
  return (
    <span className="level-bar" title={info.subtitle}>
      <span className="level-bar__track">
        {([1, 2, 3, 4, 5] as AestheticLevel[]).map((n) => (
          <span
            key={n}
            className={`level-bar__seg${n <= level ? " level-bar__seg--on" : ""}`}
          />
        ))}
      </span>
      <span className="level-bar__label">{info.label}</span>
    </span>
  );
}

function AlbumCard({
  entry,
  onOpen,
}: {
  entry: AlbumEntry;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const grad = `linear-gradient(135deg, ${entry.palette[0]} 0%, ${entry.palette[1]} 50%, ${entry.palette[2]} 100%)`;

  return (
    <article className="card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="card__frame" style={{ background: grad }}>
        {!loaded && <div className="card__placeholder" aria-hidden />}
        <img
          src={entry.imageUrl}
          alt=""
          loading="lazy"
          className={`card__img${loaded ? " card__img--visible" : ""}`}
          onLoad={() => setLoaded(true)}
        />
        <div className="card__shade" />
        <span className="card__num">{String(entry.id).padStart(2, "0")}</span>
      </div>
      <div className="card__body">
        <h3 className="card__title">{entry.title}</h3>
        <p className="card__meta">
          {entry.countryZh} · {entry.region}
        </p>
        <LevelBar level={entry.aestheticLevel} />
        <ul className="card__tags">
          {entry.styleTags.slice(0, 3).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Lightbox({
  entry,
  onClose,
  onPrev,
  onNext,
}: {
  entry: AlbumEntry;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  const info = AESTHETIC_LEVELS[entry.aestheticLevel];

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={entry.title}>
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="关闭">
        ×
      </button>
      <button type="button" className="lightbox__nav lightbox__nav--prev" onClick={onPrev} aria-label="上一张">
        ‹
      </button>
      <button type="button" className="lightbox__nav lightbox__nav--next" onClick={onNext} aria-label="下一张">
        ›
      </button>
      <div className="lightbox__layout">
        <div className="lightbox__visual">
          <img src={entry.imageUrl.replace("/640/800", "/960/1200")} alt="" />
        </div>
        <aside className="lightbox__panel">
          <p className="lightbox__index">第 {entry.id} 册 / 50</p>
          <h2 className="lightbox__title">{entry.title}</h2>
          <p className="lightbox__country">
            {entry.countryZh}（{entry.country}）· {entry.region}
          </p>
          <div className="lightbox__level">
            <span className="lightbox__level-name">美感层次 {entry.aestheticLevel} — {info.label}</span>
            <p className="lightbox__level-desc">{info.subtitle}</p>
          </div>
          <p className="lightbox__mood">情绪：{entry.mood}</p>
          <div className="lightbox__swatches" aria-hidden>
            {entry.palette.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </div>
          <ul className="lightbox__tags">
            {entry.styleTags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="lightbox__note">{entry.photographerNote}</p>
          <p className="lightbox__disclaimer">
            本企划为艺术摄影概念设计，影像为随机占位图，国别指视觉文化灵感而非人物身份认定。
          </p>
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  const [level, setLevel] = useState<LevelFilter>("all");
  const [region, setRegion] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const regions = useMemo(
    () => [...new Set(album.map((e) => e.region))].sort(),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return album.filter((e) => {
      if (level !== "all" && e.aestheticLevel !== level) return false;
      if (region !== "all" && e.region !== region) return false;
      if (!q) return true;
      const hay = [
        e.title,
        e.country,
        e.countryZh,
        e.region,
        e.mood,
        ...e.styleTags,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [level, region, query]);

  const openEntry = openId != null ? album.find((e) => e.id === openId) : null;

  const go = useCallback(
    (delta: number) => {
      if (openId == null) return;
      const idx = album.findIndex((e) => e.id === openId);
      const next = album[(idx + delta + album.length) % album.length];
      setOpenId(next.id);
    },
    [openId],
  );

  const levelCounts = useMemo(() => {
    const m = new Map<AestheticLevel, number>();
    for (const e of album) {
      m.set(e.aestheticLevel, (m.get(e.aestheticLevel) ?? 0) + 1);
    }
    return m;
  }, []);

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__inner">
          <p className="hero__kicker">摄影企划 · 2026</p>
          <h1 className="hero__title">五十国之美</h1>
          <p className="hero__subtitle">女性肖像相册集</p>
          <p className="hero__lead">
            五十册独立篇章，以各国视觉文化与摄影语言为灵感，从素真纪实到诗境超现实，铺展五种美感层次。每一册含国别、风格标签、色板与摄影师手记，构成可检索、可沉浸浏览的数字相册。
          </p>
        </div>
      </header>

      <section className="legend" aria-labelledby="legend-heading">
        <h2 id="legend-heading" className="legend__heading">美感层次体系</h2>
        <ul className="legend__grid">
          {([1, 2, 3, 4, 5] as AestheticLevel[]).map((lv) => (
            <li key={lv} className="legend__item">
              <span className="legend__lv">L{lv}</span>
              <span className="legend__name">{AESTHETIC_LEVELS[lv].label}</span>
              <span className="legend__desc">{AESTHETIC_LEVELS[lv].subtitle}</span>
              <span className="legend__count">{levelCounts.get(lv) ?? 0} 册</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="toolbar" aria-label="筛选">
        <div className="toolbar__row">
          <label className="toolbar__field">
            <span className="toolbar__label">层次</span>
            <select
              value={level === "all" ? "all" : String(level)}
              onChange={(e) => {
                const v = e.target.value;
                setLevel(v === "all" ? "all" : Number(v) as AestheticLevel);
              }}
            >
              <option value="all">全部层次</option>
              {([1, 2, 3, 4, 5] as AestheticLevel[]).map((lv) => (
                <option key={lv} value={lv}>
                  L{lv} {AESTHETIC_LEVELS[lv].label}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbar__field">
            <span className="toolbar__label">区域</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="all">全部区域</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="toolbar__field toolbar__field--grow">
            <span className="toolbar__label">搜索</span>
            <input
              type="search"
              placeholder="标题、国家、标签…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <p className="toolbar__count">
          显示 <strong>{filtered.length}</strong> / 50 册
        </p>
      </section>

      <main className="grid">
        {filtered.map((entry) => (
          <AlbumCard
            key={entry.id}
            entry={entry}
            onOpen={() => setOpenId(entry.id)}
          />
        ))}
      </main>

      {openEntry && (
        <Lightbox
          entry={openEntry}
          onClose={() => setOpenId(null)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
        />
      )}

      <footer className="footer">
        <p>《五十国之美》数字相册企划 · 共 50 册 · 仅供艺术设计与教学参考</p>
      </footer>
    </div>
  );
}
