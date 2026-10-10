import { useT } from '../i18n';
import { useApp, type Mode } from '../state/store';
import { Icon } from './Icon';

const MODES: Mode[] = ['explore', 'evolution', 'lab', 'cmb', 'calc'];

export function TopBar() {
  const t = useT();
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const togglePanel = useApp((s) => s.togglePanel);
  const panels = useApp((s) => s.panels);

  return (
    <header className="topbar panel">
      <div className="brand">
        <div className="brand-logo" />
        <div>
          <div className="brand-name">{t('appName')}</div>
          <div className="brand-sub">{t('appSubtitle')}</div>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>
            {t(`mode.${m}`)}
          </button>
        ))}
      </nav>
      <div className="top-actions">
        <button className="btn small" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} title={t('language')}>
          {lang === 'zh' ? 'EN' : '中文'}
        </button>
        <button className={`btn icon ${panels.help ? 'active' : ''}`} title={t('help')} onClick={() => togglePanel('help')}>
          <Icon name="help" />
        </button>
        <button className={`btn icon ${panels.settings ? 'active' : ''}`} title={t('settings')} onClick={() => togglePanel('settings')}>
          <Icon name="settings" />
        </button>
        <button
          className="btn icon"
          title="Fullscreen"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
        >
          <Icon name="fullscreen" />
        </button>
      </div>
    </header>
  );
}
