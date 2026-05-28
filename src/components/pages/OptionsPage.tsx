import { useState, useEffect } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { store } from '@/lib/store'
import { useI18n } from '@/i18n'
import '@/styles/SettingsPage.css'
import '@/styles/ConfigLockPage.css'
import { lcu } from '@/lib/lcu'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'

function BackupManager() {
  const { t } = useI18n()
  const [backupName, setBackupName] = useState('')
  const [backups, setBackups] = useState<{ name: string; timestamp: number }[]>([])
  const [status, setStatus] = useState('')
  const [settingsPath, setSettingsPath] = useState('')
  const [loadingConfigPath, setLoadingConfigPath] = useState(false)
  const [configPathError, setConfigPathError] = useState('')
  const [configActionError, setConfigActionError] = useState('')
  const [updatingConfigLock, setUpdatingConfigLock] = useState(false)
  const [locked, setLocked] = useState(store.get('gameConfigLocked'))
  const [configDetailsOpen, setConfigDetailsOpen] = useState(false)

  const refreshList = async () => {
    const list = await lcu.listBackups()
    setBackups(list)
  }

  useEffect(() => { refreshList() }, [])
  useEffect(() => store.onChange('gameConfigLocked', setLocked), [])

  const refreshConfigPath = async () => {
    setLoadingConfigPath(true)
    setConfigPathError('')
    try {
      setSettingsPath(await lcu.getGameSettingsFilePath())
    } catch (err) {
      setSettingsPath('')
      setConfigPathError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingConfigPath(false)
    }
  }

  const toggleConfigDetails = () => {
    setConfigDetailsOpen((open) => {
      const next = !open
      if (next && !settingsPath && !configPathError && !loadingConfigPath) {
        void refreshConfigPath()
      }
      return next
    })
  }

  const toggleConfigLocked = async () => {
    if (!Pengu.gameConfig) {
      setConfigActionError(t('tools.configLock.unsupported'))
      return
    }

    const next = !locked
    setUpdatingConfigLock(true)
    setConfigActionError('')

    try {
      if (next) {
        await Pengu.gameConfig.lock()
      } else {
        await Pengu.gameConfig.unlock()
      }
      setLocked(next)
      store.set('gameConfigLocked', next)
    } catch (err) {
      setConfigActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingConfigLock(false)
    }
  }

  const handleBackup = async () => {
    const name = backupName.trim()
    if (!name) { setStatus(t('tools.backup.nameRequired')); return }
    setStatus(t('tools.backup.saving'))
    const ok = await lcu.backupSettings(name)
    setStatus(ok ? t('tools.backup.success') : t('tools.backup.failed'))
    if (ok) { setBackupName(''); refreshList() }
  }

  const handleRestore = async (name: string) => {
    setStatus(t('tools.backup.restoring', { name }))
    const shouldRelock = Boolean(Pengu.gameConfig && store.get('gameConfigLocked'))

    if (shouldRelock) {
      try {
        await Pengu.gameConfig!.unlock()
        store.set('gameConfigLocked', false)
        setLocked(false)
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err))
        return
      }
    }

    const ok = await lcu.restoreSettings(name)

    if (shouldRelock) {
      try {
        await Pengu.gameConfig!.lock()
        store.set('gameConfigLocked', true)
        setLocked(true)
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err))
        return
      }
    }

    setStatus(ok ? t('tools.backup.restored', { name }) : t('tools.backup.restoreFailed'))
  }

  const handleDelete = async (name: string) => {
    const ok = await lcu.deleteBackup(name)
    if (ok) {
      setStatus(t('tools.backup.deleted', { name }))
      refreshList()
    }
  }

  const formatTime = (ts: number) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  }

  return (
    <>
      <div className="sona-config-lock-card">
        <SettingCard
          title={t('tools.group.configLock')}
          description={t('tools.group.configLock.description')}
        >
          <SonaButton variant="secondary" onClick={toggleConfigDetails}>
            {configDetailsOpen ? t('tools.configLock.collapse') : t('tools.configLock.details')}
          </SonaButton>
          <SonaButton variant={locked ? 'secondary' : 'primary'} onClick={toggleConfigLocked} disabled={updatingConfigLock}>
            {updatingConfigLock ? t('tools.configLock.processing') : locked ? t('tools.configLock.unlock') : t('tools.configLock.lock')}
          </SonaButton>
        </SettingCard>

        {configDetailsOpen && (
          <div className="sona-config-path-panel sona-config-path-panel--nested">
            <div className="sona-config-path-header">
              <div>
                <div className="sona-config-path-label">{t('tools.configLock.filePath.title')}</div>
                <p>{t('tools.configLock.filePath.description')}</p>
              </div>
              <SonaButton variant="secondary" onClick={refreshConfigPath} disabled={loadingConfigPath}>
                {t('tools.configLock.filePath.refresh')}
              </SonaButton>
            </div>
            <div className={`sona-config-path-value${configPathError ? ' sona-config-path-value--error' : ''}`}>
              {loadingConfigPath ? t('tools.configLock.filePath.loading') : configPathError || settingsPath || t('tools.configLock.filePath.empty')}
            </div>
          </div>
        )}

        {configActionError && (
          <div className="sona-config-action-error">
            {configActionError}
          </div>
        )}

        <SettingCard
          title={t('tools.group.backup')}
          description={t('tools.backup.description')}
        >
          <div className="sona-backup-card-action">
            <div className="sona-backup-card-input">
              <SonaInput
                value={backupName}
                onChange={(v) => { setBackupName(v); setStatus('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBackup() }}
                placeholder={t('tools.backup.placeholder')}
              />
            </div>
            <SonaButton variant="primary" onClick={handleBackup}>
              {t('tools.backup.save')}
            </SonaButton>
          </div>
          {status && <p className="sona-subtitle sona-backup-card-status">{status}</p>}
        </SettingCard>

        {backups.length > 0 && (
          <div className="sona-backup-list">
            {backups.map((b) => (
              <div key={b.name} className="sona-backup-item">
                <div className="sona-backup-info">
                  <span className="sona-backup-name">{b.name}</span>
                  <span className="sona-backup-time">{formatTime(b.timestamp)}</span>
                </div>
                <div className="sona-backup-actions">
                  <SonaButton onClick={() => handleRestore(b.name)}>{t('common.restore')}</SonaButton>
                  <SonaButton onClick={() => handleDelete(b.name)}>{t('common.delete')}</SonaButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const hotkeyOptions = [
  { value: 'F1', label: 'F1' },
  { value: 'F2', label: 'F2' },
  { value: 'F3', label: 'F3' },
  { value: 'F4', label: 'F4' },
  { value: 'F5', label: 'F5' },
]

export function OptionsPage() {
  const { t } = useI18n()
  const [developerMode, setDeveloperMode] = useState(store.get('developerMode'))
  const [hotkey, setHotkey] = useState(store.get('hotkey'))
  const [globalParticle, setGlobalParticle] = useState(store.get('globalParticle'))

  useEffect(() => {
    const unsubs = [
      store.onChange('developerMode', setDeveloperMode),
      store.onChange('hotkey', setHotkey),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div className="sona-settings">
      <SettingGroup title={t('tools.group.backup')}>
        <BackupManager />
      </SettingGroup>

      <SettingGroup title={t('settings.group.advanced')}>
        <SettingCard
          title={t('settings.hotkey.title')}
          description={t('settings.hotkey.description')}
        >
          <SonaSelect
            options={hotkeyOptions}
            value={hotkey}
            onChange={(v) => { setHotkey(v); store.set('hotkey', v) }}
          />
        </SettingCard>
        <SettingCard
          title={t('settings.developerMode.title')}
          description={t('settings.developerMode.description')}
        >
          <SonaSwitch
            checked={developerMode}
            onChange={(v) => { setDeveloperMode(v); store.set('developerMode', v) }}
          />
        </SettingCard>
      </SettingGroup>
    </div>
  )
}
