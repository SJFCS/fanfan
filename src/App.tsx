import { useState, useEffect, useMemo } from 'react'
import '@/styles/App.css'
import { logger } from '.'
import { Modal } from '@/components/ui/Modal'
import { Sidebar, type SidebarItem } from '@/components/ui/Sidebar'
import { HomePage } from '@/components/pages/HomePage'
// import { ToolsPage } from '@/components/pages/ToolsPage'
// import { BeautifyPage } from '@/components/pages/BeautifyPage'
// import { SettingsPage } from '@/components/pages/SettingsPage'
import { EnhancePage } from '@/components/pages/EnhancePage'
import { AutomationPage } from '@/components/pages/AutomationPage'
import { NexusPage } from '@/components/pages/NexusPage'
import { CustomPage } from '@/components/pages/CustomPage'
import { ToolkitPage } from '@/components/pages/ToolkitPage'
import { OptionsPage } from '@/components/pages/OptionsPage'
import { AboutPage } from '@/components/pages/AboutPage'
import { DebugPage } from '@/components/pages/DebugPage'
import { UpdatePage } from '@/components/pages/UpdatePage'
import { AutoClaimPage } from '@/components/pages/AutoClaimPage'
import { GamepadIcon, PaletteIcon, SettingsIcon, InfoIcon, BugIcon, ZapIcon, EnhanceIcon, AutomationIcon, NexusIcon, UpdateIcon, RewardIcon } from '@/components/ui/icons'
import { onModalVisibilityChange, isModalVisible, closeModal } from '@/lib/modal'
import { store } from '@/lib/store'
import { getUpdateState, onUpdateStateChange, type UpdateState } from '@/lib/update-checker'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'

const baseSidebarItemConfigs: Array<Omit<SidebarItem, 'label'> & { labelKey: TranslationKey }> = [
  { id: 'enhance', icon: <EnhanceIcon />, labelKey: 'nav.enhance' },
  { id: 'automation', icon: <AutomationIcon />, labelKey: 'nav.automation' },
  { id: 'nexus', icon: <NexusIcon />, labelKey: 'nav.nexus' },  
  { id: 'custom', icon: <PaletteIcon />, labelKey: 'nav.custom' },
  { id: 'toolkit', icon: <GamepadIcon />, labelKey: 'nav.toolkit' },
  { id: 'auto-claim', icon: <RewardIcon />, labelKey: 'nav.autoClaim' },
  { id: 'options', icon: <SettingsIcon />, labelKey: 'nav.options' },
  // { id: 'tools', icon: <GamepadIcon />, labelKey: 'nav.tools' },
  // { id: 'beautify', icon: <PaletteIcon />, labelKey: 'nav.beautify' },
  // { id: 'settings', icon: <SettingsIcon />, labelKey: 'nav.settings' },
  { id: 'about', icon: <InfoIcon />, labelKey: 'nav.about' },
]

const debugSidebarItemConfig: Omit<SidebarItem, 'label'> & { labelKey: TranslationKey } = {
  id: 'debug', icon: <BugIcon />, labelKey: 'nav.debug',
}

const updateSidebarItemConfig: Omit<SidebarItem, 'label'> & { labelKey: TranslationKey } = {
  id: 'update', icon: <UpdateIcon />, labelKey: 'nav.updateAvailable',
}

function PageContent({ pageId }: { pageId: string }) {
  switch (pageId) {
    case 'update':
      return <UpdatePage />
    case 'home':
      return <HomePage /> 
    case 'enhance':
      return <EnhancePage />
    case 'automation':
      return <AutomationPage />
    case 'auto-claim':
      return <AutoClaimPage />
    case 'nexus':
      return <NexusPage />
    case 'toolkit':
      return <ToolkitPage />         
    case 'custom':
      return <CustomPage />
    case 'options':
      return <OptionsPage />
    case 'tools':
    //   return <ToolsPage />
    // case 'beautify':
    //   return <BeautifyPage />
    // case 'settings':
    //   return <SettingsPage />
    case 'about':
      return <AboutPage />
    case 'debug':
      return <DebugPage />
    default:
      return <HomePage />
  }
}

export function App() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(isModalVisible())
  const [activePageId, setActivePageId] = useState(() => (getUpdateState().status === 'available' ? 'update' : 'home'))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(store.get('sidebarCollapsed'))
  const [devMode, setDevMode] = useState(store.get('developerMode'))
  const [updateState, setUpdateState] = useState<UpdateState>(() => getUpdateState())

  useEffect(() => {
    return onModalVisibilityChange((v) => {
      const rootConnected = Boolean(document.getElementById('sona-root')?.isConnected)
      logger.debug('Modal visibility changed: %s (root in DOM: %s)', String(v), String(rootConnected))
      setVisible(v)
      if (v && getUpdateState().status === 'available') {
        setActivePageId('update')
      }
    })
  }, [])

  // 监听开发者模式变化
  useEffect(() => {
    return store.onChange('developerMode', (v) => {
      setDevMode(v)
      // 如果关闭开发者模式时正在调试页，切回主页
      if (!v && activePageId === 'debug') {
        setActivePageId('home')
      }
    })
  }, [activePageId])

  useEffect(() => {
    return onUpdateStateChange((state) => {
      setUpdateState(state)
      if (state.status !== 'available' && activePageId === 'update') {
        setActivePageId('home')
      }
    })
  }, [activePageId])

  // 动态构建侧边栏项目
  const sidebarItems = useMemo(() => {
    const makeItem = (item: Omit<SidebarItem, 'label'> & { labelKey: TranslationKey }): SidebarItem => ({
      id: item.id,
      icon: item.icon,
      label: t(item.labelKey),
    })
    const baseItems = baseSidebarItemConfigs.map(makeItem)
    const items = updateState.status === 'available'
      ? [makeItem(updateSidebarItemConfig), ...baseItems]
      : baseItems
    return devMode ? [...items, makeItem(debugSidebarItemConfig)] : items
  }, [devMode, t, updateState.status])

  const handleClose = () => {
    closeModal()
    logger.info('Modal closed')
  }

  const handleToggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v
      store.set('sidebarCollapsed', next)
      return next
    })
  }

  return (
    <Modal
      open={visible}
      onClose={handleClose}
      width={900}
      height={560}
    >
      <div className="sona-layout">
        <Sidebar
          items={sidebarItems}
          activeId={activePageId}
          onSelect={setActivePageId}
          collapsed={sidebarCollapsed}
          onToggle={handleToggleSidebar}
          onHomeClick={() => setActivePageId('home')}
        />
        <div className="sona-content">
          <PageContent pageId={activePageId} />
        </div>
      </div>
    </Modal>
  )
}
