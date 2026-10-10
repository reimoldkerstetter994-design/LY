import { useT } from '../i18n';
import { useApp } from '../state/store';
import { Icon } from './Icon';

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function SettingsPanel() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const togglePanel = useApp((s) => s.togglePanel);
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const toggles: [keyof typeof settings, Parameters<typeof t>[0]][] = [
    ['labels', 'settings.labels'],
    ['orbits', 'settings.orbits'],
    ['shells', 'settings.shells'],
    ['bloom', 'settings.bloom'],
    ['cmbSky', 'settings.cmbSky'],
    ['autoRotate', 'settings.autoRotate'],
  ];
  return (
    <aside className="modal panel">
      <div className="panel-title">
        {t('settings')}
        <button className="btn icon small" onClick={() => togglePanel('settings', false)} aria-label={t('close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="modal-body scroll">
        {toggles.map(([k, label]) => (
          <div className="row" key={k}>
            <span>{t(label)}</span>
            <Switch on={settings[k] as boolean} onChange={(v) => setSettings({ [k]: v })} label={t(label)} />
          </div>
        ))}
        <div className="row">
          <span>{t('language')}</span>
          <div className="seg">
            <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>
              中文
            </button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
              English
            </button>
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span>{t('settings.quality')}</span>
          <div className="seg">
            {(['low', 'medium', 'high'] as const).map((q) => (
              <button key={q} className={settings.quality === q ? 'on' : ''} onClick={() => setSettings({ quality: q })}>
                {t(`quality.${q}`)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ paddingTop: 12 }}>
          <button className="btn" onClick={() => window.location.reload()}>
            <Icon name="reset" size={14} /> {t('reload')}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function HelpPanel() {
  const t = useT();
  const togglePanel = useApp((s) => s.togglePanel);
  return (
    <aside className="modal panel" style={{ width: 420 }}>
      <div className="panel-title">
        {t('help.title')}
        <button className="btn icon small" onClick={() => togglePanel('help', false)} aria-label={t('close')}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="modal-body scroll">
        <ul className="help-list">
          <li>{t('help.mouse')}</li>
          <li>{t('help.click')}</li>
          <li>{t('help.keys')}</li>
          <li>{t('help.scale')}</li>
          <li>{t('help.modes')}</li>
          <li style={{ color: 'var(--muted)' }}>{t('help.physics')}</li>
        </ul>
      </div>
    </aside>
  );
}
