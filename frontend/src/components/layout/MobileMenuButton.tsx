import { Menu as MenuIcon } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { IconButton } from '@/components/ui/IconButton'

/**
 * Mobile navigation trigger — opens the history/context drawer. Destinations
 * themselves live in the bottom bar, so the drawer carries recents and
 * account tools instead of duplicate primary navigation.
 */
export function MobileMenuButton() {
  const setUi = useAppStore((state) => state.setUi)
  return (
    <IconButton label="Open history and tools" onClick={() => setUi({ mobileSidebarOpen: true })}>
      <MenuIcon size={18} />
    </IconButton>
  )
}
