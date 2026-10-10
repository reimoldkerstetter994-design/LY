import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCatalog } from '../../data/catalog';
import { SCALE_PRESETS } from '../../data/presets';
import type { CatalogObject, ObjectKind, ScaleGroup } from '../../data/types';
import { useT, type Key } from '../../i18n';
import { C_M_S } from '../../physics/constants';
import { julianDate } from '../../physics/kepler';
import { bodyPosition } from '../../sim/ephemeris';
import { getEngine } from '../../state/engineRef';
import { useApp } from '../../state/store';
import { calendarDate, distance, duration, type Lang } from '../../utils/format';
import { Icon } from '../Icon';

const GROUPS: ScaleGroup[] = ['solar', 'stars', 'galaxy', 'local-group', 'local-universe', 'deep'];

export const KIND_NAMES: Record<ObjectKind, [string, string]> = {
  star: ['恒星', 'Star'],
  planet: ['行星', 'Planet'],
  'dwarf-planet': ['矮行星', 'Dwarf planet'],
  moon: ['卫星', 'Moon'],
  probe: ['探测器', 'Spacecraft'],
  region: ['区域', 'Region'],
  nebula: ['星云', 'Nebula'],
  'star-cluster': ['星团', 'Star cluster'],
  'black-hole': ['黑洞', 'Black hole'],
  galaxy: ['星系', 'Galaxy'],
  group: ['星系群', 'Galaxy group'],
  cluster: ['星系团', 'Galaxy cluster'],
  supercluster: ['超星系团', 'Supercluster'],
  void: ['宇宙空洞', 'Cosmic void'],
  structure: ['大尺度结构', 'Large-scale structure'],
  quasar: ['类星体', 'Quasar'],
  cmb: ['宇宙微波背景', 'Cosmic microwave background'],
  horizon: ['宇宙视界', 'Cosmic horizon'],
};

function useCatalog() {
  const cosmo = useApp((s) => s.cosmo);
  return useMemo(() => buildCatalog(cosmo), [cosmo]);
}

function objectDistance(o: CatalogObject, jd: number): number {
  if (o.dynamic) {
    const p = bodyPosition(o.id, jd);
    return Math.hypot(p[0], p[1], p[2]);
  }
  return o.distance;
}

function flyTo(id: string) {
  useApp.getState().select(id);
  getEngine()?.flyTo(id);
}

function CatalogPanel() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const selected = useApp((s) => s.selectedId);
  const open = useApp((s) => s.panels.catalog);
  const togglePanel = useApp((s) => s.togglePanel);
  const jd = useApp((s) => Math.floor(s.jd));
  const { objects } = useCatalog();
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Set<ScaleGroup>>(() => new Set(['local-group', 'local-universe']));
  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      objects.filter(
        (o) => !query || o.name.zh.toLowerCase().includes(query) || o.name.en.toLowerCase().includes(query) || o.id.includes(query),
      ),
    [objects, query],
  );

  return (
    <aside className={`catalog panel ${open ? '' : 'collapsed'}`}>
      <div className="panel-title">
        <span>{t('catalog')}</span>
        <button className="btn icon small" onClick={() => togglePanel('catalog')} aria-label={t('catalog')}>
          <Icon name={open ? 'minus' : 'list'} size={14} />
        </button>
      </div>
      {open && (
        <>
          <div className="search">
            <Icon name="search" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} spellCheck={false} />
          </div>
          <div className="cat-list scroll">
            {GROUPS.map((g) => {
              const items = filtered.filter((o) => o.group === g);
              if (!items.length) return null;
              const isClosed = closed.has(g) && !query;
              return (
                <div className="cat-group" key={g}>
                  <button
                    className="cat-group-head"
                    onClick={() => {
                      const n = new Set(closed);
                      if (n.has(g)) n.delete(g);
                      else n.add(g);
                      setClosed(n);
                    }}
                  >
                    <span>
                      {t(`group.${g}` as Key)} · {items.length}
                    </span>
                    <span style={{ transform: isClosed ? 'rotate(-90deg)' : 'none', display: 'inline-flex' }}>
                      <Icon name="chevron" size={14} />
                    </span>
                  </button>
                  {!isClosed &&
                    items.map((o) => (
                      <button key={o.id} className={`cat-item ${selected === o.id ? 'on' : ''}`} onClick={() => flyTo(o.id)} title={o.name[lang]}>
                        <span className="dot" style={{ background: o.color ?? '#9fc1ff', boxShadow: `0 0 6px ${o.color ?? '#9fc1ff'}` }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name[lang]}</span>
                        <span className="meta">{o.id === 'sun' ? '' : distance(objectDistance(o, jd), lang, 2)}</span>
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

function lightTime(m: number, lang: Lang): string {
  return duration(m / C_M_S, lang, 3);
}

function InfoPanel() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const id = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const jd = useApp((s) => s.jd);
  const hud = useApp((s) => s.hud);
  const { byId } = useCatalog();
  const o = id ? byId.get(id) : undefined;
  if (!o) return null;
  const engine = getEngine();
  const pos = o.dynamic ? bodyPosition(o.id, jd) : o.position;
  const dSun = Math.hypot(pos[0], pos[1], pos[2]);
  const cam = engine?.cam.camPos ?? [0, 0, 0];
  const dCam = Math.hypot(pos[0] - cam[0], pos[1] - cam[1], pos[2] - cam[2]);
  void hud;
  const showLight = o.z === undefined && o.kind !== 'horizon' && o.kind !== 'cmb' && dSun > 0;
  return (
    <aside className="info panel" key={o.id}>
      <div className="info-head">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div className="info-kind">{KIND_NAMES[o.kind][lang === 'zh' ? 0 : 1]}</div>
          <button className="btn icon small" onClick={() => select(null)} aria-label={t('close')}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <h2>{o.name[lang]}</h2>
        {lang === 'zh' && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{o.name.en}</div>}
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        <p className="info-desc">{o.desc[lang]}</p>
        <dl className="facts">
          {o.facts.map((f, i) => (
            <FactRow key={i} label={f.label[lang]} value={typeof f.value === 'string' ? f.value : f.value[lang]} />
          ))}
          {o.dynamic && o.id !== 'sun' && <FactRow label={t('distanceFromSun')} value={distance(dSun, lang)} />}
          {showLight && <FactRow label={t('lightTime')} value={lightTime(dSun, lang)} />}
          <FactRow label={t('distanceFromCamera')} value={distance(dCam, lang)} />
        </dl>
      </div>
      <div className="info-actions">
        <button className="btn primary" onClick={() => engine?.flyTo(o.id)}>
          <Icon name="rocket" size={15} /> {t('flyTo')}
        </button>
      </div>
    </aside>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

const LOG_MIN = 6.6;
const LOG_MAX = 27.8;

function ScaleNavigator() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const logView = useApp((s) => s.hud?.logView ?? 13);
  const trackRef = useRef<HTMLDivElement>(null);
  const toY = (log: number) => `${(1 - (log - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100}%`;
  const onTrack = (e: React.MouseEvent) => {
    if (e.target !== trackRef.current) return;
    const r = trackRef.current!.getBoundingClientRect();
    const f = 1 - (e.clientY - r.top) / r.height;
    getEngine()?.cam.setLogDistance(LOG_MIN + f * (LOG_MAX - LOG_MIN));
  };
  return (
    <nav className="scalenav panel" aria-label={t('scale')}>
      <button className="btn icon scalenav-btn" onClick={() => getEngine()?.zoomBy(0.5)} title="−">
        <Icon name="minus" size={14} />
      </button>
      <div className="scalenav-track" ref={trackRef} onClick={onTrack}>
        {SCALE_PRESETS.map((p) => (
          <button key={p.id} className="scalenav-stop" style={{ top: toY(p.log) }} onClick={() => getEngine()?.flyToPreset(p.id)}>
            <span className="tip">{p.name[lang]}</span>
          </button>
        ))}
        <div className="scalenav-cursor" style={{ top: toY(Math.min(LOG_MAX, Math.max(LOG_MIN, logView))) }} />
      </div>
      <button className="btn icon scalenav-btn" onClick={() => getEngine()?.zoomBy(-0.5)} title="+">
        <Icon name="plus" size={14} />
      </button>
    </nav>
  );
}

const RATES: [Key, number][] = [
  ['rate.real', 1 / 86400],
  ['rate.min', 60 / 86400],
  ['rate.hour', 1 / 24],
  ['rate.day', 1],
  ['rate.week', 7],
  ['rate.month', 30.44],
  ['rate.year', 365.25],
  ['rate.decade', 3652.5],
  ['rate.century', 36525],
];

function HudBar() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const hud = useApp((s) => s.hud);
  const rate = useApp((s) => s.rate);
  const playing = useApp((s) => s.playing);
  const setRate = useApp((s) => s.setRate);
  const setPlaying = useApp((s) => s.setPlaying);
  const focusId = useApp((s) => s.focusId);
  const tour = useApp((s) => s.tour);
  const setTour = useApp((s) => s.setTour);
  const { byId } = useCatalog();
  const view = hud ? hud.viewDist * 2 * Math.tan((50 * Math.PI) / 360) : 0;
  const focus = focusId ? byId.get(focusId)?.name[lang] : '—';
  const rateIdx = RATES.reduce((best, r, i) => (Math.abs(Math.log(r[1] / rate)) < Math.abs(Math.log(RATES[best][1] / rate)) ? i : best), 0);
  return (
    <footer className="hud panel">
      <div className="hud-block" style={{ minWidth: 150 }}>
        <span className="hud-label">{t('viewWidth')}</span>
        <span className="hud-value big">{hud ? distance(view, lang) : '—'}</span>
      </div>
      <div className="hud-sep" />
      <div className="hud-block" style={{ minWidth: 120, maxWidth: 220 }}>
        <span className="hud-label">{t('focusLabel')}</span>
        <span className="hud-value" style={{ fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {focus}
        </span>
      </div>
      <div className="hud-block" style={{ minWidth: 130 }}>
        <span className="hud-label">{t('fromSun')}</span>
        <span className="hud-value">{hud ? distance(hud.camFromSun, lang) : '—'}</span>
      </div>
      <div className="hud-block" style={{ minWidth: 70 }}>
        <span className="hud-label">10ⁿ m</span>
        <span className="hud-value">{hud ? hud.logView.toFixed(1) : '—'}</span>
      </div>
      <div className="time-ctrl">
        <div className="hud-block" style={{ alignItems: 'flex-end', marginRight: 6 }}>
          <span className="hud-label">{t('time')}</span>
          <span className="hud-value">{hud ? calendarDate(hud.jd) : '—'}</span>
        </div>
        <button className="btn icon" onClick={() => setPlaying(!playing)} title={playing ? t('pause') : t('play')}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <select className="sel" value={rateIdx} onChange={(e) => setRate(RATES[Number(e.target.value)][1])} aria-label={t('speed')}>
          {RATES.map(([k], i) => (
            <option key={k} value={i}>
              {t(k)}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            const jd = julianDate(new Date());
            const e = getEngine();
            if (e) e.jd = jd;
            setRate(1 / 86400);
          }}
        >
          {t('now')}
        </button>
        <button className={`btn primary ${tour.active ? 'active' : ''}`} onClick={() => setTour({ active: !tour.active, step: 0 })}>
          <Icon name="rocket" size={15} /> {tour.active ? t('tourStop') : t('tour')}
        </button>
      </div>
    </footer>
  );
}

function TourOverlay() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const tour = useApp((s) => s.tour);
  const setTour = useApp((s) => s.setTour);
  const flying = useApp((s) => s.hud?.flying ?? false);
  const step = SCALE_PRESETS[tour.step];
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (!tour.active || !step) return;
    setArrived(false);
    getEngine()?.flyToPreset(step.id);
    useApp.getState().select(step.focusId);
  }, [tour.active, tour.step, step]);

  useEffect(() => {
    if (!tour.active) return;
    if (!flying) {
      const id = setTimeout(() => setArrived(true), 400);
      return () => clearTimeout(id);
    }
  }, [flying, tour.active, tour.step]);

  useEffect(() => {
    if (!tour.active || !arrived) return;
    const id = setTimeout(() => {
      const s = useApp.getState().tour;
      if (s.step < SCALE_PRESETS.length - 1) setTour({ step: s.step + 1 });
    }, 6500);
    return () => clearTimeout(id);
  }, [arrived, tour.active, setTour]);

  if (!tour.active || !step) return null;
  return (
    <div className="tour panel">
      <div className="tour-dots">
        {SCALE_PRESETS.map((p, i) => (
          <span key={p.id} className={i === tour.step ? 'on' : ''} />
        ))}
      </div>
      <h3>{step.name[lang]}</h3>
      <p>{step.caption[lang]}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn small" disabled={tour.step === 0} onClick={() => setTour({ step: Math.max(0, tour.step - 1) })}>
          {t('tourPrev')}
        </button>
        <button className="btn small" onClick={() => setTour({ active: false })}>
          {t('tourStop')}
        </button>
        <button
          className="btn small primary"
          disabled={tour.step >= SCALE_PRESETS.length - 1}
          onClick={() => setTour({ step: Math.min(SCALE_PRESETS.length - 1, tour.step + 1) })}
        >
          {t('tourNext')}
        </button>
      </div>
    </div>
  );
}

export function ExploreUI() {
  return (
    <>
      <CatalogPanel />
      <InfoPanel />
      <ScaleNavigator />
      <HudBar />
      <TourOverlay />
    </>
  );
}
