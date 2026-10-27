/*
 * Design brief (refactoring-ui Workflow B), library settings.
 *
 * Feature: the settings that belong to the whole app rather than to reading one book.
 * Sections in the order people come for them: Theme, Fonts, Backup, Storage. Reading
 * settings themselves live in the reader, next to the page they change.
 * Tokens: section titles 12px semibold uppercase fg-muted, 32px above each section.
 */

import type { ReactNode } from 'react'
import { useAppSettings } from '@/store/appSettings'
import { FontManager } from '@/ui/fonts/FontManager'
import { BackupSection } from '@/ui/library/BackupSection'
import { StorageSection } from '@/ui/library/StorageSection'
import { Modal } from '@/ui/Modal'
import { ThemePicker } from '@/ui/ThemePicker'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 pt-8 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function LibrarySettings({ open, onClose }: { open: boolean; onClose(): void }) {
  const theme = useAppSettings((state) => state.theme)
  const setTheme = useAppSettings((state) => state.setTheme)
  return (
    <Modal open={open} title="Settings" onClose={onClose}>
      <Section title="Theme">
        <ThemePicker value={theme} onChange={setTheme} />
      </Section>
      <Section title="Fonts">
        <FontManager />
      </Section>
      {/* Stays mounted while closed, so a backup or restore carries on and reports back. */}
      <Section title="Backup">
        <BackupSection />
      </Section>
      <Section title="Storage">
        <StorageSection open={open} />
      </Section>
    </Modal>
  )
}
