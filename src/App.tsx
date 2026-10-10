import { lazy, Suspense, useEffect } from 'react';
import { useT } from './i18n';
import { getEngine } from './state/engineRef';
import { useApp } from './state/store';
import { ExploreUI } from './ui/explore/ExploreUI';
import { HelpPanel, SettingsPanel } from './ui/Panels';
import { TopBar } from './ui/TopBar';
import { Viewport } from './ui/Viewport';

const EvolutionUI = lazy(() => import('./ui/evolution/EvolutionUI'));
const CosmologyLab = lazy(() => import('./ui/lab/CosmologyLab'));
const CmbLab = lazy(() => import('./ui/cmb/CmbLab'));
const Calculator = lazy(() => import('./ui/calc/Calculator'));

function LoadingScreen() {
  const t = useT();
  const { progress, stage } = useApp((s) => s.loading);
  const key = `loading.${stage}` as Parameters<typeof t>[0];
  return (
    <div className="loading">
      <div className="loading-card">
        <div className="orbit-anim">
          <span />
          <span />
        </div>
        <h1>{t('appName')}</h1>
        <p>{t(key)}</p>
        <div className="progress">
          <div style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function WebglError() {
  const t = useT();
  return (
    <div className="loading">
      <div className="loading-card panel" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22 }}>{t('appName')}</h1>
        <p className="warn">{t('webgl.error')}</p>
      </div>
    </div>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      const s = useApp.getState();
      if (e.key === 'Escape') {
        s.togglePanel('settings', false);
        s.togglePanel('help', false);
        s.select(null);
        if (s.tour.active) s.setTour({ active: false });
      }
      if (s.mode !== 'explore') return;
      if (e.key === '+' || e.key === '=') getEngine()?.zoomBy(-0.25);
      if (e.key === '-' || e.key === '_') getEngine()?.zoomBy(0.25);
      if (e.key === ' ') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const mode = useApp((s) => s.mode);
  const ready = useApp((s) => s.ready);
  const webglError = useApp((s) => s.webglError);
  const panels = useApp((s) => s.panels);
  const lang = useApp((s) => s.lang);
  useKeyboard();

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '寰宇 · 可观测宇宙模拟系统' : 'Huanyu · Observable Universe Simulator';
  }, [lang]);

  const fullPage = mode === 'lab' || mode === 'cmb' || mode === 'calc';
  return (
    <div className="app" data-mode={mode}>
      {fullPage && <div className="starfield-bg" />}
      <Viewport />
      <TopBar />
      {webglError && <WebglError />}
      {!ready && !webglError && <LoadingScreen />}
      {ready && mode === 'explore' && <ExploreUI />}
      <Suspense fallback={null}>
        {ready && mode === 'evolution' && <EvolutionUI />}
        {mode === 'lab' && <CosmologyLab />}
        {mode === 'cmb' && <CmbLab />}
        {mode === 'calc' && <Calculator />}
      </Suspense>
      {panels.settings && <SettingsPanel />}
      {panels.help && <HelpPanel />}
    </div>
  );
}
