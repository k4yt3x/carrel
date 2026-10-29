/*
 * Design brief (refactoring-ui Workflow B), library settings.
 *
 * Feature: the settings that belong to the whole app rather than to reading one book.
 * Sections in the order people come for them: Theme, Fonts, Backup, Storage, then About, which
 * is for looking up rather than changing: the version, and where the source code is. Reading
 * settings themselves live in the reader, next to the page they change.
 * Tokens: section titles 12px semibold uppercase fg-muted, 32px above each section.
 */

import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAppSettings } from '@/store/appSettings'
import { FontManager } from '@/ui/fonts/FontManager'
import { InfoTip } from '@/ui/InfoTip'
import { BackupSection } from '@/ui/library/BackupSection'
import { StorageSection } from '@/ui/library/StorageSection'
import { Modal } from '@/ui/Modal'
import { ThemePicker } from '@/ui/ThemePicker'

function Section({
  title,
  info,
  children,
}: {
  title: string
  info?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-4 pt-8 first:pt-0">
      <div className="flex items-center gap-1">
        <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
        {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
      </div>
      {children}
    </section>
  )
}

const sourceUrl = 'https://github.com/k4yt3x/carrel'

interface LibrarySettingsProps {
  open: boolean
  /** Opens at the backup, choosing a backup to restore: the empty library offers that. */
  restore?: boolean
  onClose(): void
}

export function LibrarySettings({ open, restore = false, onClose }: LibrarySettingsProps) {
  const theme = useAppSettings((state) => state.theme)
  const setTheme = useAppSettings((state) => state.setTheme)
  const startRestoring = (dialog: HTMLDialogElement) => {
    if (!restore) return
    const button = dialog.querySelector<HTMLButtonElement>('[data-restore]')
    button?.scrollIntoView({ block: 'nearest' })
    button?.focus()
    button?.click()
  }
  return (
    <Modal open={open} title="Settings" onClose={onClose} onOpened={startRestoring}>
      <Section title="Theme">
        <ThemePicker value={theme} onChange={setTheme} />
      </Section>
      <Section title="Fonts">
        <FontManager />
      </Section>
      {/* Stays mounted while closed, so a backup or restore carries on and reports back. */}
      <Section
        title="Backup"
        info="Your books are kept only in this browser, which may clear them to free space. A backup keeps them, your place in each and your settings in one file."
      >
        <BackupSection open={open} />
      </Section>
      <Section title="Storage">
        <StorageSection open={open} />
      </Section>
      <Section title="About">
        <div className="space-y-2 text-sm leading-normal">
          <div>
            <p className="text-fg-secondary">Carrel {__CARREL_VERSION__}</p>
            {__CARREL_BUILD__ && (
              <p className="text-fg-muted">
                Build <span className="font-mono">{__CARREL_BUILD__.commit}</span>
                {__CARREL_BUILD__.dirty && ' (dirty)'}
              </p>
            )}
          </div>
          {/* Out of the app, so an installed one stays where it was. */}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-action-fg underline decoration-border-strong underline-offset-4 hover:decoration-current"
          >
            Source code on GitHub
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </Section>
    </Modal>
  )
}
