import { type ReactNode } from 'react'
import { MusicIcon, ChevronLeftIcon, ChevronRightIcon, TranslateIcon } from '@/components/ui/icons'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { useI18n, type SonaLocaleSetting } from '@/i18n'
import '@/styles/Sidebar.css'

declare const __PLUGIN_VERSION__: string

export interface SidebarItem {
  id: string
  icon: ReactNode
  label: string
}

export interface SidebarProps {
  items: SidebarItem[]
  activeId: string
  onSelect: (id: string) => void
  collapsed: boolean
  onToggle: () => void
  onHomeClick?: () => void
}

export function Sidebar({ items, activeId, onSelect, collapsed, onToggle, onHomeClick }: SidebarProps) {
  const { localeSetting, setLocaleSetting, t } = useI18n()
  const languageOptions = [
    { value: 'auto', label: t('settings.language.auto') },
    { value: 'zh-CN', label: t('settings.language.zhCN') },
    { value: 'en-US', label: t('settings.language.enUS') },
  ]

  return (
    <div className={`sona-sidebar${collapsed ? ' sona-sidebar--collapsed' : ''}`}>
      <div className="sona-sidebar-logo">
        <button
          type="button"
          className={`sona-sidebar-logo-home${activeId === 'home' ? ' sona-sidebar-logo-home--active' : ''}`}
          onClick={onHomeClick}
          title={t('nav.home')}
          aria-label={t('nav.home')}
        >
          <span className="sona-sidebar-logo-icon"><MusicIcon /></span>
          {!collapsed && (
            <>
              <span className="sona-sidebar-logo-text">FanFan</span>
              <span className="sona-sidebar-logo-version">v{__PLUGIN_VERSION__}</span>
            </>
          )}
        </button>
        <SonaSelect
          className="sona-sidebar-lang-select"
          options={languageOptions}
          value={localeSetting}
          onChange={(value) => setLocaleSetting(value as SonaLocaleSetting)}
          ariaLabel={t('sidebar.languageToggle')}
          leadingIcon={<TranslateIcon />}
          iconOnly
        />
      </div>

      <nav className="sona-sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sona-sidebar-item${activeId === item.id ? ' sona-sidebar-item--active' : ''}`}
            onClick={() => onSelect(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sona-sidebar-item-icon">{item.icon}</span>
            {!collapsed && <span className="sona-sidebar-item-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sona-sidebar-footer">
        <button className="sona-sidebar-toggle" onClick={onToggle} title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>
    </div>
  )
}
