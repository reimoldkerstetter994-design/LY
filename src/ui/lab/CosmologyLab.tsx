import { useMemo, useState } from 'react';
import { useT, type Key } from '../../i18n';
import { soundHorizon } from '../../physics/cmb';
import { GYR_S, MPC_GLY, MPC_M } from '../../physics/constants';
import { Cosmology, PLANCK18, type CosmoParams } from '../../physics/cosmology';
import { sigma8 } from '../../physics/powerSpectrum';
import { useApp } from '../../state/store';
import { gyr, num, sci, type Lang } from '../../utils/format';
import { LineChart } from '../charts/LineChart';
import { Switch } from '../Panels';
import {
  distanceChart,
  expansionChart,
  growthChart,
  hubbleChart,
  ionizationChart,
  omegaChart,
  powerChart,
  sfrChart,
  spacetimeChart,
  temperatureChart,
  type ChartId,
  type SpacetimeView,
} from './charts';

interface ParamDef {
  key: keyof CosmoParams;
  sym: string;
  name: [string, string];
  min: number;
  max: number;
  step: number;
  unit?: string;
  show?: (v: number) => string;
}

const PARAMS: ParamDef[] = [
  { key: 'H0', sym: 'H₀', name: ['哈勃常数', 'Hubble constant'], min: 40, max: 100, step: 0.01, unit: 'km/s/Mpc' },
  { key: 'Om', sym: 'Ωm', name: ['物质密度（含暗物质）', 'Matter density (incl. dark matter)'], min: 0.01, max: 2.5, step: 0.0005 },
  { key: 'Ob', sym: 'Ωb', name: ['重子（普通物质）密度', 'Baryon density'], min: 0.005, max: 0.2, step: 0.0001 },
  { key: 'Ode', sym: 'ΩΛ', name: ['暗能量密度', 'Dark-energy density'], min: -0.5, max: 2.6, step: 0.0005 },
  { key: 'w0', sym: 'w₀', name: ['暗能量状态方程', 'Dark-energy equation of state'], min: -2, max: 0, step: 0.005 },
  { key: 'wa', sym: 'wₐ', name: ['状态方程演化 w(a)=w₀+wₐ(1−a)', 'EoS evolution w(a)=w₀+wₐ(1−a)'], min: -2, max: 1, step: 0.005 },
  { key: 'Tcmb', sym: 'T_CMB', name: ['今天的 CMB 温度', 'CMB temperature today'], min: 1, max: 5, step: 0.0005, unit: 'K' },
  { key: 'Neff', sym: 'N_eff', name: ['有效中微子种类数', 'Effective neutrino species'], min: 0, max: 6, step: 0.001 },
  { key: 'ns', sym: 'nₛ', name: ['原初功率谱指数', 'Scalar spectral index'], min: 0.85, max: 1.1, step: 0.0005 },
  { key: 'As', sym: '10⁹Aₛ', name: ['原初扰动振幅', 'Primordial amplitude'], min: 1e-9, max: 4e-9, step: 1e-12, show: (v) => (v * 1e9).toFixed(3) },
  { key: 'tau', sym: 'τ', name: ['再电离光深', 'Reionization optical depth'], min: 0.01, max: 0.15, step: 0.0005 },
];

interface Preset {
  id: string;
  name: [string, string];
  p: Partial<CosmoParams>;
}

const PRESETS: Preset[] = [
  { id: 'planck', name: ['Planck 2018', 'Planck 2018'], p: { ...PLANCK18 } },
  { id: 'wmap', name: ['WMAP 9 年', 'WMAP 9-year'], p: { ...PLANCK18, H0: 69.32, Om: 0.2862, Ob: 0.04626, ns: 0.9608, As: 2.464e-9, tau: 0.081 } },
  { id: 'shoes', name: ['SH0ES 高 H₀', 'SH0ES high H₀'], p: { ...PLANCK18, H0: 73.04 } },
  { id: 'desi', name: ['DESI 2025 动态暗能量', 'DESI 2025 dynamical DE'], p: { ...PLANCK18, H0: 66.7, Om: 0.317, Ob: 0.0503, w0: -0.75, wa: -0.86 } },
  { id: 'eds', name: ['爱因斯坦—德西特', 'Einstein–de Sitter'], p: { ...PLANCK18, Om: 1, Ob: 0.05, flat: true } },
  { id: 'open', name: ['开放宇宙', 'Open universe'], p: { ...PLANCK18, Om: 0.3, Ob: 0.05, Ode: 0, flat: false } },
  { id: 'closed', name: ['闭合宇宙（大挤压）', 'Closed (Big Crunch)'], p: { ...PLANCK18, Om: 2.5, Ob: 0.1, Ode: 0, flat: false } },
  { id: 'rip', name: ['幻影能量（大撕裂）', 'Phantom (Big Rip)'], p: { ...PLANCK18, w0: -1.5, wa: 0 } },
  { id: 'desitter', name: ['近德西特宇宙', 'Near de Sitter'], p: { ...PLANCK18, Om: 0.03, Ob: 0.005, flat: true } },
  { id: 'bounce', name: ['反弹宇宙（无大爆炸）', 'Bounce (no Big Bang)'], p: { ...PLANCK18, Om: 0.3, Ob: 0.05, Ode: 2.5, flat: false } },
];

const CHARTS: [ChartId, Key][] = [
  ['expansion', 'chart.expansion'],
  ['hubble', 'chart.hubble'],
  ['omega', 'chart.omega'],
  ['distance', 'chart.distance'],
  ['spacetime', 'chart.spacetime'],
  ['growth', 'chart.growth'],
  ['power', 'chart.power'],
  ['ionization', 'chart.ionization'],
  ['temperature', 'chart.temperature'],
  ['sfr', 'chart.sfr'],
];

const REF = new Cosmology(PLANCK18);

export function fateText(c: Cosmology, lang: Lang): { title: string; body: string } {
  const f = c.fate;
  const zh = lang === 'zh';
  switch (f.kind) {
    case 'crunch':
      return zh
        ? { title: '大挤压', body: `引力最终战胜膨胀：宇宙将在大爆炸后 ${gyr(f.tMaxGyr, lang)} 达到最大尺度（a = ${num(f.aMax, 3)}），随后收缩，在 ${gyr(f.tCrunchGyr, lang)} 时坍缩为奇点。` }
        : { title: 'Big Crunch', body: `Gravity wins: the universe reaches its maximum size (a = ${num(f.aMax, 3)}) at ${gyr(f.tMaxGyr, lang)} and recollapses into a singularity at ${gyr(f.tCrunchGyr, lang)}.` };
    case 'rip':
      return zh
        ? { title: '大撕裂', body: `w < −1 的幻影能量密度随膨胀不断增大：大约在 ${gyr(f.tRipGyr - c.age0, lang)} 之后，星系、行星系统乃至原子都将被撕碎。` }
        : { title: 'Big Rip', body: `Phantom energy (w < −1) grows denser as space expands: in about ${gyr(f.tRipGyr - c.age0, lang)} galaxies, planetary systems and finally atoms are torn apart.` };
    case 'bounce':
      return zh
        ? { title: '无大爆炸（反弹）', body: `暗能量过强，使宇宙在过去尺度因子 a ≈ ${num(f.aMin, 3)} 处由收缩转为膨胀——不存在热大爆炸，这与 CMB 和元素丰度等观测矛盾。` }
        : { title: 'No Big Bang (bounce)', body: `Dark energy is so strong that the universe turned from contraction to expansion at a ≈ ${num(f.aMin, 3)} — no hot Big Bang, contradicting the CMB and element abundances.` };
    default:
      return f.accelerating
        ? zh
          ? { title: '热寂（大冻结）', body: '宇宙将永远加速膨胀。本星系群以外的星系会逐渐越过事件视界，恒星最终熄灭，宇宙趋于寒冷、黑暗和稀薄。' }
          : { title: 'Heat death (Big Freeze)', body: 'The universe expands forever at an accelerating rate. Galaxies beyond the Local Group cross the event horizon, stars burn out, and the cosmos grows cold, dark and dilute.' }
        : zh
          ? { title: '永恒膨胀（减速）', body: '宇宙将永远膨胀，但膨胀速度不断减慢，没有事件视界——足够耐心的话，原则上可以看到所有星系。' }
          : { title: 'Eternal decelerating expansion', body: 'The universe expands forever but ever more slowly, with no event horizon — in principle every galaxy eventually comes into view.' };
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function CosmologyLab() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const params = useApp((s) => s.params);
  const cosmo = useApp((s) => s.cosmo);
  const hist = useApp((s) => s.hist);
  const setParams = useApp((s) => s.setParams);
  const resetParams = useApp((s) => s.resetParams);
  const [chart, setChart] = useState<ChartId>('expansion');
  const [stView, setStView] = useState<SpacetimeView>('proper');

  const spec = useMemo(() => {
    switch (chart) {
      case 'expansion':
        return expansionChart(cosmo, REF, lang);
      case 'hubble':
        return hubbleChart(cosmo, REF, lang);
      case 'omega':
        return omegaChart(cosmo, lang);
      case 'distance':
        return distanceChart(cosmo, lang);
      case 'spacetime':
        return spacetimeChart(cosmo, stView, lang);
      case 'growth':
        return growthChart(cosmo, REF, lang);
      case 'power':
        return powerChart(cosmo, REF, lang);
      case 'ionization':
        return ionizationChart(cosmo, hist, lang);
      case 'temperature':
        return temperatureChart(cosmo, lang);
      case 'sfr':
        return sfrChart(cosmo, lang);
    }
  }, [chart, cosmo, hist, lang, stView]);

  const derived = useMemo(() => {
    const c = cosmo;
    const zStar = hist.zStar;
    const rs = soundHorizon(c, zStar);
    const dm = c.transverseComovingDistance(zStar);
    const zAcc = c.aAcceleration ? 1 / c.aAcceleration - 1 : NaN;
    const zDE = c.aMatterDE ? 1 / c.aMatterDE - 1 : NaN;
    const rhoCrit = c.rhoCrit(1);
    const L = (zh: string, en: string) => (lang === 'zh' ? zh : en);
    const gly = (mpc: number) => (Number.isFinite(mpc) ? `${num(mpc * MPC_GLY, 4)} ${L('×10亿光年', 'Gly')}` : '∞');
    return [
      { label: L('宇宙年龄', 'Age of the universe'), value: gyr(c.age0, lang, 4), sub: c.bounce ? L('自反弹起算', 'since the bounce') : undefined },
      { label: L('哈勃时间 1/H₀', 'Hubble time 1/H₀'), value: gyr(c.tH, lang, 4) },
      { label: 'Ωm / Ωb / Ωc', value: `${num(c.Om, 4)} / ${num(c.Ob, 3)} / ${num(c.Oc, 3)}` },
      { label: 'ΩΛ / Ωr / Ωk', value: `${num(c.Ode, 4)} / ${sci(c.Or, 3)} / ${num(c.Ok, 3)}` },
      { label: L('临界密度 ρ_c', 'Critical density ρ_c'), value: `${sci(rhoCrit, 3)} kg/m³`, sub: L(`约每立方米 ${num(rhoCrit / 1.6726e-27, 3)} 个质子`, `≈ ${num(rhoCrit / 1.6726e-27, 3)} protons per m³`) },
      { label: L('物质—辐射相等', 'Matter–radiation equality'), value: `z = ${num(c.zEq, 4)}`, sub: L(`宇宙年龄 ${num(c.ageAtZ(c.zEq) * 1e9, 3)} 年`, `t = ${num(c.ageAtZ(c.zEq) * 1e9, 3)} yr`) },
      { label: L('最后散射面（CMB）', 'Last scattering (CMB)'), value: `z* = ${zStar.toFixed(1)}`, sub: L(`宇宙年龄 ${num(c.ageAtZ(zStar) * 1e9, 3)} 年`, `t = ${num(c.ageAtZ(zStar) * 1e9, 3)} yr`) },
      { label: L('声学视界 r_s(z*)', 'Sound horizon r_s(z*)'), value: `${rs.toFixed(2)} Mpc`, sub: `100θ* = ${((100 * rs) / dm).toFixed(4)} · ℓ_A = ${(Math.PI / (rs / dm)).toFixed(1)}` },
      { label: L('重子拖曳（BAO 标尺）', 'Baryon drag (BAO ruler)'), value: `z_d = ${hist.zDrag.toFixed(1)}`, sub: `r_d = ${soundHorizon(c, hist.zDrag).toFixed(2)} Mpc` },
      { label: L('再电离中点', 'Reionization midpoint'), value: `z_re = ${hist.zReion.toFixed(2)}`, sub: L(`宇宙年龄 ${gyr(c.ageAtZ(hist.zReion), lang)}`, `t = ${gyr(c.ageAtZ(hist.zReion), lang)}`) },
      { label: L('减速参数 q₀', 'Deceleration q₀'), value: num(c.q(1), 4), sub: Number.isFinite(zAcc) ? L(`z = ${zAcc.toFixed(3)} 时开始加速`, `accelerating since z = ${zAcc.toFixed(3)}`) : L('从未加速', 'never accelerates') },
      { label: L('暗能量开始主导', 'Dark energy takes over'), value: Number.isFinite(zDE) ? `z = ${zDE.toFixed(3)}` : '—', sub: Number.isFinite(zDE) && zDE > 0 ? gyr(c.lookbackTime(zDE), lang) + L('前', ' ago') : undefined },
      { label: L('粒子视界（可观测宇宙半径）', 'Particle horizon (observable radius)'), value: gly(c.particleHorizon(1)) },
      { label: L('事件视界', 'Event horizon'), value: gly(c.eventHorizon(1)) },
      { label: L('哈勃半径 c/H₀', 'Hubble radius c/H₀'), value: gly(c.hubbleRadius(1)) },
      { label: L('到最后散射面的共动距离', 'Comoving distance to the CMB'), value: gly(c.comovingDistance(zStar)) },
      { label: 'σ₈', value: num(sigma8(c), 4), sub: L('8 h⁻¹Mpc 球内的物质涨落', 'matter fluctuation in 8 h⁻¹Mpc spheres') },
      { label: L('共形年龄 η₀', 'Conformal age η₀'), value: gyr(c.conformalAge0, lang, 4), sub: `${num((c.conformalAge0 * GYR_S * 299792458) / MPC_M, 4)} Mpc` },
    ];
  }, [cosmo, hist, lang]);

  const fate = fateText(cosmo, lang);
  const flat = params.flat;

  return (
    <div className="page lab">
      <aside className="lab-side panel">
        <div className="panel-title">{t('lab.presets')}</div>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} className="btn small" onClick={() => setParams({ ...PLANCK18, ...p.p })}>
              {p.name[lang === 'zh' ? 0 : 1]}
            </button>
          ))}
        </div>
        <div className="panel-title" style={{ paddingTop: 2 }}>
          {t('lab.params')}
          <button className="btn small" onClick={resetParams}>
            {t('lab.reset')}
          </button>
        </div>
        <div className="row" style={{ padding: '6px 14px', borderBottom: 'none' }}>
          <span style={{ fontSize: 13 }}>{t('lab.flat')}</span>
          <Switch on={flat} onChange={(v) => setParams(v ? { flat: true } : { flat: false, Ode: cosmo.Ode })} />
        </div>
        <div className="scroll" style={{ flex: 1, paddingBottom: 10 }}>
          {PARAMS.map((d) => {
            const disabled = d.key === 'Ode' && flat;
            const raw = d.key === 'Ode' && flat ? cosmo.Ode : (params[d.key] as number);
            const shown = d.show ? d.show(raw) : num(raw, 5);
            return (
              <div className="param" key={d.key} style={{ opacity: disabled ? 0.55 : 1 }}>
                <div className="param-head">
                  <span>
                    {d.sym} · {d.name[lang === 'zh' ? 0 : 1]}
                  </span>
                  <b>
                    {shown}
                    {d.unit ? ` ${d.unit}` : ''}
                  </b>
                </div>
                <input
                  type="range"
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  value={Math.min(d.max, Math.max(d.min, raw))}
                  disabled={disabled}
                  aria-label={d.sym}
                  onChange={(e) => setParams({ [d.key]: Number(e.target.value) } as Partial<CosmoParams>)}
                />
              </div>
            );
          })}
        </div>
      </aside>

      <main className="lab-main page-scroll">
        <section className="panel">
          <div className="chart-tabs">
            {CHARTS.map(([id, key]) => (
              <button key={id} className={`btn small ${chart === id ? 'active' : ''}`} onClick={() => setChart(id)}>
                {t(key)}
              </button>
            ))}
          </div>
          {chart === 'spacetime' && (
            <div style={{ padding: '10px 12px 0' }}>
              <div className="seg">
                {(['proper', 'comoving', 'conformal'] as SpacetimeView[]).map((v) => (
                  <button key={v} className={stView === v ? 'on' : ''} onClick={() => setStView(v)}>
                    {t(`st.${v}` as Key)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="chart-body">
            <LineChart {...spec} height={chart === 'spacetime' ? 420 : 340} />
            {spec.note && <p className="chart-note">{spec.note}</p>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">{t('lab.fate')}</div>
          <div className="fate">
            <h4 className={cosmo.fate.kind === 'bounce' ? 'warn' : ''}>{fate.title}</h4>
            <p>{fate.body}</p>
          </div>
          <div className="panel-title" style={{ paddingTop: 0 }}>
            {t('lab.derived')}
          </div>
          <div className="derived">
            {derived.map((d) => (
              <Stat key={d.label} {...d} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
