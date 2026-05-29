import { useEffect, useState } from 'react'
import { PinIcon } from '@/components/ui/icons'
import { useI18n } from '@/i18n'
import {
  getSidebarQuickActionPinned,
  onSidebarQuickActionPinnedChange,
  setSidebarQuickActionPinned,
  type SidebarQuickActionId,
} from '@/lib/sidebar-quick-actions'
import '@/styles/SidebarPinButton.css'

interface SidebarPinButtonProps {
  action: SidebarQuickActionId
  label: string
}

export function SidebarPinButton({ action, label }: SidebarPinButtonProps) {
  const { t } = useI18n()
  const [pinned, setPinned] = useState(() => getSidebarQuickActionPinned(action))
  const title = t(pinned ? 'sidebar.quickActions.unpin' : 'sidebar.quickActions.pin', { label })

  useEffect(() => {
    return onSidebarQuickActionPinnedChange(action, setPinned)
  }, [action])

  return (
    <button
      type="button"
      className={`sona-sidebar-pin-button${pinned ? ' sona-sidebar-pin-button--active' : ''}`}
      onClick={() => setSidebarQuickActionPinned(action, !pinned)}
      title={title}
      aria-label={title}
    >
      <PinIcon />
    </button>
  )
}
