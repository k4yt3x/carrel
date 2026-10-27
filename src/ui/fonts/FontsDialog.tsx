import { FontManager } from '@/ui/fonts/FontManager'
import { Modal } from '@/ui/Modal'

/** Font management on its own, for the reader to reach from a book's settings. */
export function FontsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Modal open={open} title="Fonts" onClose={onClose}>
      <FontManager />
    </Modal>
  )
}
