import { useState, useEffect } from 'react'
import { SettingCard, SettingGroup } from '@/components/ui/SettingCard'
import { SonaSwitch } from '@/components/ui/SonaSwitch'
import { SonaSelect } from '@/components/ui/SonaSelect'
import { store } from '@/lib/store'
import { useI18n, type SonaLocaleSetting } from '@/i18n'
import '@/styles/SettingsPage.css'
import { lcu } from '@/lib/lcu'
import { SonaButton } from '@/components/ui/SonaButton'
import { SonaInput } from '@/components/ui/SonaInput'

function BackupManager() {
  const [backupName, setBackupName] = useState('')
  const [backups, setBackups] = useState<{ name: string; timestamp: number }[]>([])
  const [status, setStatus] = useState('')

  const refreshList = async () => {
    const list = await lcu.listBackups()
    setBackups(list)
  }

  useEffect(() => { refreshList() }, [])

  const handleBackup = async () => {
    const name = backupName.trim()
    if (!name) { setStatus('❌ 请输入备份名称'); return }
    setStatus('⏳ 备份中...')
    const ok = await lcu.backupSettings(name)
    setStatus(ok ? '✅ 备份成功' : '❌ 备份失败')
    if (ok) { setBackupName(''); refreshList() }
  }

  const handleRestore = async (name: string) => {
    setStatus(`⏳ 恢复 "${name}" 中...`)
    const ok = await lcu.restoreSettings(name)
    setStatus(ok ? `✅ "${name}" 已恢复` : '❌ 恢复失败')
  }

  const handleDelete = async (name: string) => {
    const ok = await lcu.deleteBackup(name)
    if (ok) {
      setStatus(`已删除 "${name}"`)
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
      <div className="sona-debug-actions" style={{ alignItems: 'flex-end', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <SonaInput
            value={backupName}
            onChange={(v) => { setBackupName(v); setStatus('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleBackup() }}
            placeholder="输入备份名称 (如: 排位设置)"
          />
        </div>
        <SonaButton variant="primary" onClick={handleBackup}>
          保存备份
        </SonaButton>
      </div>
      {status && <p className="sona-subtitle" style={{ marginTop: 6 }}>{status}</p>}
      {backups.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {backups.map((b) => (
            <div key={b.name} className="sona-backup-item">
              <div className="sona-backup-info">
                <span className="sona-backup-name">{b.name}</span>
                <span className="sona-backup-time">{formatTime(b.timestamp)}</span>
              </div>
              <div className="sona-backup-actions">
                <SonaButton onClick={() => handleRestore(b.name)}>恢复</SonaButton>
                <SonaButton onClick={() => handleDelete(b.name)}>删除</SonaButton>
              </div>
            </div>
          ))}
        </div>
      )}
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
  const { localeSetting, setLocaleSetting, t } = useI18n()
  const [developerMode, setDeveloperMode] = useState(store.get('developerMode'))
  const [hotkey, setHotkey] = useState(store.get('hotkey'))
  const [globalParticle, setGlobalParticle] = useState(store.get('globalParticle'))
  const localeOptions = [
    { value: 'auto', label: t('settings.language.auto') },
    { value: 'zh-CN', label: t('settings.language.zhCN') },
    { value: 'en-US', label: t('settings.language.enUS') },
  ]

  useEffect(() => {
    const unsubs = [
      store.onChange('developerMode', setDeveloperMode),
      store.onChange('hotkey', setHotkey),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  return (
    <div className="sona-settings">
      <h2 className="sona-settings-title">{t('settings.title')}</h2>

      <SettingGroup title={t('settings.group.general')}>
        <SettingCard
          title={t('settings.language.title')}
          description={t('settings.language.description')}
        >
          <SonaSelect
            options={localeOptions}
            value={localeSetting}
            onChange={(v) => setLocaleSetting(v as SonaLocaleSetting)}
          />
        </SettingCard>
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
      </SettingGroup>

      <SettingGroup title={t('tools.group.backup')}>
        <p className="sona-subtitle" style={{ marginBottom: 10 }}>{t('tools.backup.placeholder')}</p>
        <BackupManager />
      </SettingGroup>

      <SettingGroup title={t('settings.group.advanced')}>
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
