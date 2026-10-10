import { useEffect, useMemo, useRef } from 'react';
import { useT } from '../../i18n';
import { C_M_S, MPC_M, YEAR_S } from '../../physics/constants';
import { buildTimeline, epochAt, type Timeline } from '../../physics/timeline';
import { evolutionVisual } from '../../sim/evolution';
import { getEngine } from '../../state/engineRef';
import { useApp } from '../../state/store';
import { distance, duration, num, sci, temperature, type Lang } from '../../utils/format';
import { Icon } from '../Icon';
import { Switch } from '../Panels';

const LOG_START = -44;
const SPLIT = 18.5;
const SPLIT_X = 0.78;

function makeMapping(end: number) {
  const toX = (l: number) => {
    if (l <= SPLIT || end <= SPLIT) return (SPLIT_X * (l - LOG_START)) / (Math.min(SPLIT, end) - LOG_START);
    return SPLIT_X + ((1 - SPLIT_X) * (l - SPLIT)) / (end - SPLIT);
  };
  const fromX = (x: number) => {
    if (end <= SPLIT) return LOG_START + (x / SPLIT_X) * (end - LOG_START);
    if (x <= SPLIT_X) return LOG_START + (x / SPLIT_X) * (SPLIT - LOG_START);
    return SPLIT + ((x - SPLIT_X) / (1 - SPLIT_X)) * (end - SPLIT);
  };
  return { toX, fromX };
}

const TICKS: [number, string, string][] = [
  [-40, '10⁻⁴⁰ s', '10⁻⁴⁰ s'],
  [-30, '10⁻³⁰ s', '10⁻³⁰ s'],
  [-20, '10⁻²⁰ s', '10⁻²⁰ s'],
  [-10, '10⁻¹⁰ s', '10⁻¹⁰ s'],
  [0, '1 秒', '1 s'],
  [Math.log10(YEAR_S), '1 年', '1 yr'],
  [Math.log10(1e6 * YEAR_S), '100 万年', '1 Myr'],
  [Math.log10(1e9 * YEAR_S), '10 亿年', '1 Gyr'],
  [Math.log10(1e14 * YEAR_S), '10¹⁴ 年', '10¹⁴ yr'],
  [Math.log10(1e40 * YEAR_S), '10⁴⁰ 年', '10⁴⁰ yr'],
  [Math.log10(1e100 * YEAR_S), '10¹⁰⁰ 年', '10¹⁰⁰ yr'],
];

function Timeline({ timeline, logT, onSeek }: { timeline: Timeline; logT: number; onSeek: (l: number) => void }) {
  const lang = useApp((s) => s.lang);
  const ref = useRef<HTMLDivElement>(null);
  const { toX, fromX } = useMemo(() => makeMapping(timeline.end), [timeline.end]);
  const seek = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onSeek(Math.min(timeline.end, fromX(x)));
  };
  return (
    <div
      className="timeline-track"
      ref={ref}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
    >
      <div className="timeline-epochs">
        {timeline.epochs.map((ep) => {
          const a = Math.max(0, toX(Math.max(ep.start, LOG_START)));
          const b = Math.min(1, toX(Math.min(ep.end, timeline.end)));
          return <div key={ep.id} title={ep.name[lang]} style={{ width: `${(b - a) * 100}%`, background: ep.color }} />;
        })}
      </div>
      {timeline.events.map((ev) => (
        <div key={ev.id} className="timeline-event" style={{ left: `${toX(ev.logT) * 100}%` }} title={ev.name[lang]} />
      ))}
      <div className="timeline-thumb" style={{ left: `${toX(logT) * 100}%` }} />
      <div className="timeline-ticks">
        {TICKS.filter(([l]) => l < timeline.end).map(([l, zh, en]) => (
          <span key={l} style={{ left: `${toX(l) * 100}%` }}>
            {lang === 'zh' ? zh : en}
          </span>
        ))}
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bar-row">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <div className="bar">
        <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{value >= 0.001 ? `${(value * 100).toFixed(1)}%` : value > 0 ? '<0.1%' : '0'}</span>
    </div>
  );
}

function timeText(logT: number, lang: Lang): string {
  return duration(Math.pow(10, logT), lang, 3);
}

export default function EvolutionUI() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const cosmo = useApp((s) => s.cosmo);
  const hist = useApp((s) => s.hist);
  const evo = useApp((s) => s.evo);
  const setEvo = useApp((s) => s.setEvo);
  const timeline = useMemo(() => buildTimeline(cosmo, hist), [cosmo, hist]);
  const logT = Math.min(evo.logT, timeline.end);
  const visual = useMemo(() => evolutionVisual(cosmo, hist, logT, evo.physical), [cosmo, hist, logT, evo.physical]);

  useEffect(() => {
    getEngine()?.applyEvolution(visual, evo.showDM);
  }, [visual, evo.showDM]);

  useEffect(() => {
    if (!evo.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = useApp.getState();
      const l = s.evo.logT;
      // Slow down through the eventful last 10^12 seconds (recombination → today).
      const k = l > 11.5 && l < 18 ? 0.28 : l > 18 ? 2.2 : 1;
      const next = l + s.evo.speed * k * dt;
      if (next >= timeline.end) {
        s.setEvo({ logT: timeline.end, playing: false });
        return;
      }
      s.setEvo({ logT: next });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [evo.playing, timeline.end]);

  const epoch = epochAt(timeline, logT);
  const st = visual.state;
  const om = st.omegas;
  const tSec = Math.pow(10, logT);
  const horizon = tSec < 1e4 ? 2 * C_M_S * tSec : st.a * cosmo.particleHorizon(st.a) * MPC_M;
  const boxComoving = 300 * MPC_M;
  const dominant = st.inflating
    ? t('evo.inflaton')
    : om.r >= om.m && om.r >= om.de
      ? t('evo.radiation')
      : om.m >= om.de
        ? t('evo.matter')
        : t('evo.darkEnergy');
  const zText = Number.isFinite(st.z) ? (st.z > 1e5 ? sci(st.z, 3) : num(st.z, st.z < 10 ? 3 : 4)) : '∞';

  return (
    <>
      <aside className="evo-left panel">
        <div className="panel-title">{t('evo.title')}</div>
        <div style={{ padding: '0 16px 10px' }}>
          <div className="epoch-time">{timeText(logT, lang)}</div>
          <div className="epoch-name" style={{ color: epoch.color === '#ffffff' ? '#fff' : epoch.color }}>
            {epoch.name[lang]}
          </div>
          <p style={{ margin: 0, lineHeight: 1.7, color: '#cfd8f2', fontSize: 13.5 }}>{epoch.summary[lang]}</p>
        </div>
        <div className="panel-title" style={{ paddingTop: 4 }}>
          {t('evo.events')}
        </div>
        <ul className="event-list scroll" style={{ flex: 1 }}>
          {timeline.events.map((ev) => (
            <li key={ev.id}>
              <button className={ev.logT < logT ? 'past' : ''} onClick={() => setEvo({ logT: ev.logT, playing: false })} title={ev.desc[lang]}>
                <span>{ev.name[lang]}</span>
                <span className="t">{timeText(ev.logT, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <aside className="evo-right panel scroll">
        <div className="panel-title">{t('evo.components')}</div>
        <div style={{ padding: '0 16px 12px' }}>
          <dl className="facts" style={{ margin: '0 0 12px', gridTemplateColumns: 'auto 1fr' }}>
            <dt>{t('evo.time')}</dt>
            <dd>{timeText(logT, lang)}</dd>
            <dt>{t('evo.redshift')}</dt>
            <dd>{zText}</dd>
            <dt>{t('evo.scale')}</dt>
            <dd>{Number.isFinite(st.a) ? sci(st.a, 3) : '∞'}</dd>
            <dt>{t('evo.temp')}</dt>
            <dd>{temperature(st.T)}</dd>
            <dt>{t('evo.hubble')}</dt>
            <dd>{tSec > 1e15 ? `${num((st.H * MPC_M) / 1e3, 3)} km/s/Mpc` : `${sci(st.H, 3)} s⁻¹`}</dd>
            <dt>{t('evo.density')}</dt>
            <dd>{sci(st.rho, 3)} kg/m³</dd>
            <dt>{t('evo.horizon')}</dt>
            <dd>{distance(horizon, lang)}</dd>
            <dt>{t('evo.box')}</dt>
            <dd>
              {distance(boxComoving * (Number.isFinite(st.a) ? st.a : 0), lang, 2)} <span style={{ color: 'var(--faint)' }}>({t('evo.physical')})</span>
            </dd>
            <dt>{t('evo.dominant')}</dt>
            <dd style={{ fontFamily: 'var(--font)' }}>{dominant}</dd>
          </dl>
          <div className="bars">
            <Bar label={t('evo.radiation')} value={om.r} color="#ff9f68" />
            <Bar label={t('evo.matter')} value={om.m} color="#6ee7ff" />
            <Bar label={st.inflating ? t('evo.inflaton') : t('evo.darkEnergy')} value={om.de} color="#a78bfa" />
            {Math.abs(om.k) > 0.001 && <Bar label={t('evo.curvature')} value={Math.abs(om.k)} color="#ffcf7d" />}
          </div>
          <div className="bars" style={{ marginTop: 14 }}>
            <Bar label={t('evo.ionized')} value={Math.min(1, visual.plasma > 0 ? Math.max(visual.plasma, visual.ionized) : visual.ionized)} color="#4ea8de" />
            <Bar label={t('evo.structure')} value={visual.growth} color="#7dffb0" />
            <Bar label={t('evo.stars')} value={visual.lum} color="#ffd27a" />
          </div>
        </div>
      </aside>

      <footer className="timeline panel">
        <div className="timeline-top">
          <button className="btn icon" onClick={() => setEvo({ logT: LOG_START, playing: false })} title="⏮">
            <Icon name="skipBack" size={14} />
          </button>
          <button
            className="btn primary"
            onClick={() => setEvo({ playing: !evo.playing, logT: logT >= timeline.end - 0.01 ? LOG_START : logT })}
          >
            <Icon name={evo.playing ? 'pause' : 'play'} size={15} /> {evo.playing ? t('pause') : t('play')}
          </button>
          <button className="btn icon" onClick={() => setEvo({ logT: timeline.now, playing: false })} title={t('now')}>
            <Icon name="skipFwd" size={14} />
          </button>
          <div className="seg" title={t('speed')}>
            {[0.6, 1.2, 2.4, 4.8].map((sp) => (
              <button key={sp} className={Math.abs(evo.speed - sp) < 0.01 ? 'on' : ''} onClick={() => setEvo({ speed: sp })}>
                {sp / 1.2}×
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Switch on={evo.showDM} onChange={(v) => setEvo({ showDM: v })} label={t('evo.showDM')} />
              {t('evo.showDM')}
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Switch on={evo.physical} onChange={(v) => setEvo({ physical: v })} label={t('evo.physicalSize')} />
              {t('evo.physicalSize')}
            </label>
          </div>
        </div>
        <Timeline timeline={timeline} logT={logT} onSeek={(l) => setEvo({ logT: l, playing: false })} />
      </footer>
    </>
  );
}
