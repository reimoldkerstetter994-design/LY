import { useEffect, useRef } from 'react';
import { Engine } from '../engine/Engine';
import { CmbClient } from '../sim/cmbClient';
import { setEngine } from '../state/engineRef';
import { useApp } from '../state/store';

/** Owns the WebGL engine and keeps it in sync with the application state. */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const labelRoot = labelsRef.current!;
    const store = useApp.getState();
    let engine: Engine;
    try {
      engine = new Engine(canvas, labelRoot, {
        onHud: (h) => useApp.getState().setHud(h),
        onSelect: (id) => useApp.getState().select(id),
        onFocus: (id) => useApp.getState().setFocus(id),
      });
    } catch (err) {
      console.error(err);
      store.setWebglError();
      return;
    }
    setEngine(engine);
    if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = engine;
    engine.setLanguage(store.lang);
    engine.setSettings(store.settings);
    engine.jd = store.jd;
    engine.rate = store.rate;
    engine.playing = store.playing;

    const cmb = new CmbClient();
    let cmbTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshSky = () => {
      clearTimeout(cmbTimer);
      cmbTimer = setTimeout(async () => {
        const params = useApp.getState().params;
        const res = await cmb.request({
          params,
          width: 1024,
          height: 512,
          seed: 2026,
          lMin: 2,
          lMax: 2000,
          beam: 0,
          dipole: false,
          range: 300,
          specLmax: 1200,
        });
        engine.setCmbTexture(res.rgba, res.width, res.height);
      }, 700);
    };

    let disposed = false;
    engine
      .init(store.cosmo, store.settings.quality, (p, stage) => useApp.getState().setLoading(p, stage))
      .then(() => {
        if (disposed) return;
        const s = useApp.getState();
        engine.setCosmology(s.cosmo, s.hist.zStar);
        s.setReady();
        refreshSky();
      });

    let cosmoTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useApp.subscribe((s, prev) => {
      if (s.lang !== prev.lang) engine.setLanguage(s.lang);
      if (s.settings !== prev.settings) engine.setSettings(s.settings);
      if (s.selectedId !== prev.selectedId) engine.setSelected(s.selectedId);
      if (s.rate !== prev.rate) engine.rate = s.rate;
      if (s.playing !== prev.playing) engine.playing = s.playing;
      if (s.mode !== prev.mode) {
        engine.setMode(s.mode === 'explore' ? 'explore' : s.mode === 'evolution' ? 'evolution' : 'idle');
      }
      if (s.cosmo !== prev.cosmo || s.hist !== prev.hist) {
        clearTimeout(cosmoTimer);
        cosmoTimer = setTimeout(() => {
          const st = useApp.getState();
          engine.setCosmology(st.cosmo, st.hist.zStar);
        }, 250);
        if (s.cosmo !== prev.cosmo) refreshSky();
      }
    });

    return () => {
      disposed = true;
      unsub();
      clearTimeout(cmbTimer);
      clearTimeout(cosmoTimer);
      cmb.dispose();
      engine.dispose();
      setEngine(null);
    };
  }, []);

  return (
    <div className="viewport">
      <canvas ref={canvasRef} className="gl" tabIndex={0} />
      <div ref={labelsRef} className="labels" />
    </div>
  );
}
