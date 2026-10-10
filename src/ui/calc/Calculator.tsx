import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { GLY_M, MPC_GLY, MPC_M } from '../../physics/constants';
import { useApp } from '../../state/store';
import { distance, gyr, num, temperature } from '../../utils/format';

type InputMode = 'z' | 't' | 'd' | 'lb';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const EXAMPLES: [string, string, number][] = [
  ['仙女座星系', 'Andromeda', 0.00018],
  ['室女座星系团', 'Virgo Cluster', 0.0038],
  ['后发座星系团', 'Coma Cluster', 0.0231],
  ['3C 273', '3C 273', 0.158],
  ['宇宙正午', 'Cosmic noon', 1.86],
  ['GN-z11', 'GN-z11', 10.6],
  ['JADES-GS-z14-0', 'JADES-GS-z14-0', 14.32],
  ['宇宙微波背景', 'CMB', 1090],
];

export default function Calculator() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const cosmo = useApp((s) => s.cosmo);
  const [mode, setMode] = useState<InputMode>('z');
  const [value, setValue] = useState(1);

  // Chinese inputs are in 亿年 / 亿光年 (10⁸), English inputs in Gyr / Gly (10⁹).
  const unit = lang === 'zh' ? 0.1 : 1;
  const z = useMemo(() => {
    const v = value * (mode === 'z' ? 1 : unit);
    if (!Number.isFinite(v)) return NaN;
    switch (mode) {
      case 'z':
        return Math.max(0, v);
      case 't':
        return v >= cosmo.age0 ? 0 : cosmo.zAtAge(Math.max(1e-9, v));
      case 'd':
        return cosmo.zAtComovingDistance(Math.max(0, v / MPC_GLY));
      case 'lb':
        return v >= cosmo.age0 ? Infinity : cosmo.zAtAge(cosmo.age0 - v);
    }
  }, [mode, value, cosmo, unit]);

  const r = useMemo(() => {
    if (!Number.isFinite(z) || z < 0) return null;
    const a = 1 / (1 + z);
    const dc = cosmo.comovingDistance(z);
    const dl = cosmo.luminosityDistance(z);
    const da = cosmo.angularDiameterDistance(z);
    const lb = cosmo.lookbackTime(z);
    const age = cosmo.ageAtZ(z);
    const om = cosmo.omegas(a);
    const eh = cosmo.eventHorizon(1);
    const vRec = (cosmo.p.H0 * dc) / 299792.458;
    return { a, dc, dl, da, lb, age, om, eh, vRec };
  }, [z, cosmo]);

  const L = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  const m = (mpc: number) => distance(mpc * MPC_M, lang, 4);
  const modes: [InputMode, Parameters<typeof t>[0]][] = [
    ['z', 'calc.byZ'],
    ['t', 'calc.byT'],
    ['d', 'calc.byD'],
    ['lb', 'calc.byLookback'],
  ];

  return (
    <div className="page calc">
      <aside className="panel calc-input">
        <div className="panel-title" style={{ padding: '0 0 10px' }}>
          {t('calc.input')}
        </div>
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {modes.map(([k, key]) => (
            <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              {t(key)}
            </button>
          ))}
        </div>
        <input type="number" value={Number.isFinite(value) ? value : ''} step="any" min={0} onChange={(e) => setValue(Number(e.target.value))} aria-label={t('calc.input')} />
        <div className="presets" style={{ padding: '12px 0 0' }}>
          {EXAMPLES.map(([zh, en, zz]) => (
            <button
              key={en}
              className="btn small"
              onClick={() => {
                setMode('z');
                setValue(zz);
              }}
            >
              {lang === 'zh' ? zh : en}
            </button>
          ))}
        </div>
        <p className="chart-note" style={{ padding: '14px 0 0' }}>
          {L(
            `使用当前宇宙学参数：H₀ = ${cosmo.p.H0}，Ωm = ${num(cosmo.Om, 4)}，ΩΛ = ${num(cosmo.Ode, 4)}。可在“宇宙学实验室”中修改。`,
            `Using the current parameters: H₀ = ${cosmo.p.H0}, Ωm = ${num(cosmo.Om, 4)}, ΩΛ = ${num(cosmo.Ode, 4)}. Change them in the Cosmology Lab.`,
          )}
        </p>
      </aside>
      <main className="page-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <section className="panel">
          <div className="panel-title">{t('calc.results')}</div>
          {r ? (
            <div className="derived">
              <Stat label={L('红移 z', 'Redshift z')} value={num(z, 6)} sub={`a = 1/(1+z) = ${num(r.a, 5)}`} />
              <Stat label={L('光发出时的宇宙年龄', 'Age when the light left')} value={gyr(r.age, lang, 4)} />
              <Stat label={L('回溯时间', 'Lookback time')} value={gyr(r.lb, lang, 4)} />
              <Stat label={L('共动距离（今天的距离）', 'Comoving distance (today)')} value={m(r.dc)} sub={`${num(r.dc, 5)} Mpc`} />
              <Stat label={L('光行距离', 'Light-travel distance')} value={distance(r.lb * GLY_M, lang, 4)} />
              <Stat label={L('发光时的固有距离', 'Proper distance at emission')} value={m(r.dc * r.a)} />
              <Stat label={L('光度距离 D_L', 'Luminosity distance D_L')} value={m(r.dl)} sub={`μ = ${num(cosmo.distanceModulus(Math.max(z, 1e-8)), 4)} mag`} />
              <Stat label={L('角直径距离 D_A', 'Angular-diameter distance D_A')} value={m(r.da)} sub={L(`1″ 对应 ${num(cosmo.kpcPerArcsec(z), 4)} kpc`, `1″ = ${num(cosmo.kpcPerArcsec(z), 4)} kpc`)} />
              <Stat label={L('共动体积（z 以内）', 'Comoving volume within z')} value={`${num(cosmo.comovingVolume(z), 4)} Gpc³`} />
              <Stat label={L('当时的哈勃参数', 'Hubble rate then')} value={`${num(cosmo.Hz(z), 5)} km/s/Mpc`} />
              <Stat label={L('当时的 CMB 温度', 'CMB temperature then')} value={temperature(cosmo.p.Tcmb * (1 + z))} />
              <Stat label={L('今天的退行速度', 'Recession speed today')} value={`${num(r.vRec, 4)} c`} />
              <Stat label={L('当时的能量组分', 'Energy budget then')} value={`Ωm ${num(r.om.m, 3)} · ΩΛ ${num(r.om.de, 3)}`} sub={`Ωr ${num(r.om.r, 3)}`} />
              <Stat label={L('线性增长因子 D(z)', 'Linear growth D(z)')} value={num(cosmo.growth(r.a), 4)} />
            </div>
          ) : (
            <p className="chart-note" style={{ padding: '0 16px 16px' }}>
              {L('输入超出可观测范围。', 'Input is outside the observable range.')}
            </p>
          )}
        </section>
        {r && (
          <section className="panel">
            <div className="panel-title">{t('calc.story')}</div>
            <div className="story">
              {lang === 'zh' ? (
                <>
                  这束光离开天体时，宇宙只有 <b>{gyr(r.age, lang)}</b>。它在膨胀的空间中旅行了 <b>{gyr(r.lb, lang)}</b>，
                  走过的路程是 <b>{distance(r.lb * GLY_M, lang)}</b>。出发时，天体离我们只有 <b>{m(r.dc * r.a)}</b>；
                  由于空间膨胀，它今天离我们已有 <b>{m(r.dc)}</b>，并以 <b>{num(r.vRec, 3)} 倍光速</b>
                  远离。光的波长被拉长了 <b>{num(1 + z, 4)}</b> 倍。
                  {Number.isFinite(r.eh) &&
                    (r.dc > r.eh
                      ? ' 它已经在我们的宇宙事件视界之外：我们今天发出的任何信号都永远无法到达它。'
                      : ' 它仍在事件视界之内：我们今天发出的光终将到达那里。')}
                </>
              ) : (
                <>
                  When this light set out, the universe was only <b>{gyr(r.age, lang)}</b> old. It travelled through expanding space for{' '}
                  <b>{gyr(r.lb, lang)}</b>, covering <b>{distance(r.lb * GLY_M, lang)}</b>. At departure the source was just <b>{m(r.dc * r.a)}</b> away;
                  today it is <b>{m(r.dc)}</b> away, receding at <b>{num(r.vRec, 3)} c</b>. Its wavelength has been stretched by a factor of{' '}
                  <b>{num(1 + z, 4)}</b>.
                  {Number.isFinite(r.eh) &&
                    (r.dc > r.eh
                      ? ' It already lies beyond our cosmic event horizon: no signal we send today can ever reach it.'
                      : ' It is still inside our event horizon: light we send today will eventually get there.')}
                </>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
