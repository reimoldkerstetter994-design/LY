import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { computeCmbSpectrum } from '../../physics/cmb';
import { planckColor } from '../../physics/cmbMap';
import { Cosmology, PLANCK18 } from '../../physics/cosmology';
import { computeIonizationHistory } from '../../physics/recombination';
import { CmbClient, type CmbResponse } from '../../sim/cmbClient';
import { useApp } from '../../state/store';
import { num } from '../../utils/format';
import { LineChart, type Series } from '../charts/LineChart';
import { Icon } from '../Icon';
import { Switch } from '../Panels';

let referenceDl: Float64Array | null = null;
function reference(): Float64Array {
  if (!referenceDl) {
    const c = new Cosmology(PLANCK18);
    referenceDl = computeCmbSpectrum(c, computeIonizationHistory(c, PLANCK18.tau), 2500).Dl;
  }
  return referenceDl;
}

const LUT = Array.from({ length: 256 }, (_, i) => planckColor(i / 255));

function drawMollweide(canvas: HTMLCanvasElement, res: CmbResponse, range: number) {
  const W = 1200;
  const H = 600;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const { data, width: mw, height: mh } = res;
  const s2 = Math.SQRT2;
  for (let y = 0; y < H; y++) {
    const Y = (1 - (2 * (y + 0.5)) / H) * s2;
    const th = Math.asin(Math.max(-1, Math.min(1, Y / s2)));
    const lat = Math.asin(Math.max(-1, Math.min(1, (2 * th + Math.sin(2 * th)) / Math.PI)));
    const row = Math.min(mh - 1, Math.max(0, Math.floor(((Math.PI / 2 - lat) / Math.PI) * mh)));
    const ct = Math.cos(th);
    for (let x = 0; x < W; x++) {
      const X = ((2 * (x + 0.5)) / W - 1) * 2 * s2;
      const lon = (Math.PI * X) / (2 * s2 * ct);
      const o = (y * W + x) * 4;
      if (Math.abs(lon) > Math.PI) {
        img.data[o + 3] = 0;
        continue;
      }
      let l = -lon;
      if (l < 0) l += 2 * Math.PI;
      const col = Math.min(mw - 1, Math.floor((l / (2 * Math.PI)) * mw));
      const v = data[row * mw + col];
      const c = LUT[Math.min(255, Math.max(0, Math.round((0.5 + v / (2 * range)) * 255)))];
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Galactic graticule: equator and meridians every 60°.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  const project = (lDeg: number, bDeg: number): [number, number] => {
    const lat = (bDeg * Math.PI) / 180;
    let lon = (-((lDeg + 180) % 360) + 180) * (Math.PI / 180);
    if (lon < -Math.PI) lon += 2 * Math.PI;
    let th = lat;
    for (let i = 0; i < 12; i++) {
      const f = 2 * th + Math.sin(2 * th) - Math.PI * Math.sin(lat);
      const d = 2 + 2 * Math.cos(2 * th);
      if (Math.abs(d) < 1e-9) break;
      th -= f / d;
    }
    const X = ((2 * s2) / Math.PI) * lon * Math.cos(th);
    const Yp = s2 * Math.sin(th);
    return [((X / (2 * s2) + 1) / 2) * W, ((1 - Yp / s2) / 2) * H];
  };
  for (const lDeg of [-120, -60, 0, 60, 120]) {
    ctx.beginPath();
    for (let b = -90; b <= 90; b += 3) {
      const [px, py] = project(lDeg, b);
      if (b === -90) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(project(179.9, 0)[0], H / 2);
  ctx.lineTo(project(-179.9, 0)[0], H / 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(160,190,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W / 2 - 1, H / 2 - 1, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function binned(dl: Float64Array, lmax: number): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (let l = 2; l < 30 && l <= lmax; l++) {
    x.push(l);
    y.push(dl[l]);
  }
  const w = 16;
  for (let l = 30; l + w <= lmax; l += w) {
    let s = 0;
    for (let k = l; k < l + w; k++) s += dl[k];
    x.push(l + w / 2);
    y.push(s / w);
  }
  return { x, y };
}

export default function CmbLab() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const params = useApp((s) => s.params);
  const opts = useApp((s) => s.cmbOpts);
  const setOpts = useApp((s) => s.setCmbOpts);
  const [res, setRes] = useState<CmbResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const client = useRef<CmbClient | null>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    client.current = new CmbClient();
    return () => client.current?.dispose();
  }, []);

  useEffect(() => {
    setBusy(true);
    const id = setTimeout(() => {
      client.current
        ?.request({
          params,
          width: opts.res * 2,
          height: opts.res,
          seed: opts.seed,
          lMin: opts.lMin,
          lMax: opts.lMax,
          beam: opts.beam,
          dipole: opts.dipole,
          range: 0,
          specLmax: 2500,
        })
        .then((r) => {
          setRes(r);
          setBusy(false);
        });
    }, 120);
    return () => clearTimeout(id);
  }, [params, opts.res, opts.seed, opts.lMin, opts.lMax, opts.beam, opts.dipole]);

  const range = opts.dipole ? 3400 : opts.range;
  useEffect(() => {
    if (res && mapRef.current) drawMollweide(mapRef.current, res, range);
  }, [res, range]);

  const series = useMemo(() => {
    const ref = reference();
    const ells = Array.from({ length: 2499 }, (_, i) => i + 2);
    const s: Series[] = [{ label: t('lab.reference'), color: 'rgba(255,255,255,0.45)', x: ells, y: ells.map((l) => ref[l]), dash: [6, 5] }];
    if (res) {
      s.push({ label: t('cmb.model'), color: '#ffb46b', x: ells, y: ells.map((l) => res.Dl[l]), width: 2.2 });
      const b = binned(res.realizedDl, opts.res - 1);
      s.push({ label: t('cmb.realized'), color: '#6ee7ff', x: b.x, y: b.y, scatter: true });
    }
    return s;
  }, [res, t, opts.res]);

  const d = res?.derived;
  return (
    <div className="page cmb-page">
      <section className="cmb-map panel">
        <div className="panel-title">
          {t('cmb.map')}
          <span className="chip">{t('semiAnalytic')}</span>
        </div>
        <div className="mollweide-wrap">
          <canvas ref={mapRef} />
          {busy && <div className="overlay-msg">{t('cmb.generating')}</div>}
        </div>
        <div className="colorbar">
          <span>−{range} μK</span>
          <div />
          <span>+{range} μK</span>
        </div>
        <div className="scroll" style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '6px 18px' }}>
          <div className="param" style={{ padding: '6px 0' }}>
            <div className="param-head">
              <span>{t('cmb.seed')}</span>
              <b>{opts.seed}</b>
            </div>
            <button className="btn small primary" style={{ marginTop: 6 }} onClick={() => setOpts({ seed: Math.floor(Math.random() * 1e6) })}>
              <Icon name="reset" size={13} /> {t('cmb.regenerate')}
            </button>
          </div>
          <div className="param" style={{ padding: '6px 0' }}>
            <div className="param-head">
              <span>{t('cmb.resolution')}</span>
              <b>ℓ ≤ {opts.res - 1}</b>
            </div>
            <div className="seg" style={{ marginTop: 6 }}>
              {([256, 512, 1024] as const).map((r) => (
                <button key={r} className={opts.res === r ? 'on' : ''} onClick={() => setOpts({ res: r })}>
                  {r * 2}×{r}
                </button>
              ))}
            </div>
          </div>
          <div className="param" style={{ padding: '6px 0' }}>
            <div className="param-head">
              <span>{t('cmb.band')}</span>
              <b>
                {opts.lMin} – {opts.lMax}
              </b>
            </div>
            <input type="range" min={2} max={600} step={1} value={opts.lMin} onChange={(e) => setOpts({ lMin: Math.min(Number(e.target.value), opts.lMax - 2) })} aria-label="lmin" />
            <input type="range" min={4} max={2000} step={1} value={opts.lMax} onChange={(e) => setOpts({ lMax: Math.max(Number(e.target.value), opts.lMin + 2) })} aria-label="lmax" />
          </div>
          <div className="param" style={{ padding: '6px 0' }}>
            <div className="param-head">
              <span>{t('cmb.beam')}</span>
              <b>{opts.beam}′</b>
            </div>
            <input type="range" min={0} max={120} step={1} value={opts.beam} onChange={(e) => setOpts({ beam: Number(e.target.value) })} aria-label="beam" />
            <div className="param-head" style={{ marginTop: 6 }}>
              <span>{t('cmb.range')}</span>
              <b>±{range} μK</b>
            </div>
            <input type="range" min={30} max={600} step={10} value={opts.range} disabled={opts.dipole} onChange={(e) => setOpts({ range: Number(e.target.value) })} aria-label="range" />
          </div>
          <div className="row" style={{ borderBottom: 'none' }}>
            <span>{t('cmb.dipole')}</span>
            <Switch on={opts.dipole} onChange={(v) => setOpts({ dipole: v })} />
          </div>
          {res && (
            <div style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
              rms {num(res.rms, 3)} μK · {lang === 'zh' ? '合成耗时' : 'synthesis'} {num(res.ms, 3)} ms
            </div>
          )}
        </div>
      </section>

      <section className="panel cmb-spec">
        <div className="panel-title">{t('cmb.spectrum')}</div>
        <div className="chart-body">
          <LineChart series={series} xDomain={[2, 2500]} yDomain={[0, 7000]} xLabel={lang === 'zh' ? '多极矩 ℓ' : 'multipole ℓ'} yLabel="D_ℓ = ℓ(ℓ+1)C_ℓ/2π  [μK²]" height={300} legend="tr" />
        </div>
      </section>

      <section className="panel cmb-side">
        <div className="panel-title">{t('cmb.peaks')}</div>
        {d && (
          <dl className="facts">
            <dt>z*</dt>
            <dd>{d.zStar.toFixed(1)}</dd>
            <dt>r_s(z*)</dt>
            <dd>{d.rsStar.toFixed(2)} Mpc</dd>
            <dt>D_M(z*)</dt>
            <dd>{num(d.dStar, 5)} Mpc</dd>
            <dt>100 θ*</dt>
            <dd>{(100 * d.thetaStar).toFixed(4)}</dd>
            <dt>ℓ_A = π/θ*</dt>
            <dd>{d.ellA.toFixed(1)}</dd>
            <dt>R* = 3ρ_b/4ρ_γ</dt>
            <dd>{d.Rstar.toFixed(3)}</dd>
            <dt>k_D (Silk)</dt>
            <dd>{d.kD.toFixed(4)} Mpc⁻¹</dd>
            {res?.peaks.slice(0, 5).map((p, i) => (
              <PeakRow key={i} i={i} ell={p.ell} dl={p.Dl} />
            ))}
          </dl>
        )}
        <p className="chart-note" style={{ padding: '0 16px 14px' }}>
          {t('cmb.explain')}
        </p>
      </section>
    </div>
  );
}

function PeakRow({ i, ell, dl }: { i: number; ell: number; dl: number }) {
  return (
    <>
      <dt>#{i + 1}</dt>
      <dd>
        ℓ = {ell} · {Math.round(dl)} μK²
      </dd>
    </>
  );
}
