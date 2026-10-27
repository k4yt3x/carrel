import { CircleCheck, Download, Ellipsis, Info, Trash2 } from 'lucide-react'
import { Menu } from '@/ui/Menu'

interface BookMenuProps {
  title: string
  onDetails(): void
  /** Starts choosing books, with this one chosen. */
  onSelect(): void
  onDownload(): void
  onRemove(): void
}

/** The actions on one book, kept behind a button so the shelf shows books rather than controls. */
export function BookMenu({ title, onDetails, onSelect, onDownload, onRemove }: BookMenuProps) {
  return (
    <Menu
      label={`More actions for ${title}`}
      tooltip="More actions"
      buttonClassName="btn btn-ghost btn-sm btn-square text-fg-muted hover:text-fg"
      align="end"
      items={[
        { label: 'Details', icon: Info, onSelect: onDetails },
        { label: 'Select', icon: CircleCheck, onSelect },
        { label: 'Download file', icon: Download, onSelect: onDownload },
        { label: 'Remove from library…', icon: Trash2, danger: true, onSelect: onRemove },
      ]}
    >
      <Ellipsis aria-hidden className="size-4" />
    </Menu>
  )
}
