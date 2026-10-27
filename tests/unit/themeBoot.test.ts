// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schemeOfBackground } from '@/domain/themes'
import { appSettingsKey } from '@/store/appSettings'

// public/theme-boot.js runs before the app, with its own copy of the light-or-dark rule.
const boot = readFileSync('public/theme-boot.js', 'utf8')

function bootWith(state: unknown): DOMStringMap {
  localStorage.setItem(appSettingsKey, JSON.stringify({ state, version: 1 }))
  const root = document.documentElement
  for (const key of Object.keys(root.dataset)) delete root.dataset[key]
  new Function(boot)()
  return root.dataset
}

describe('theme-boot.js', () => {
  it('pins a built-in theme', () => {
    expect(bootWith({ theme: 'dark' }).theme).toBe('dark')
    expect(bootWith({ theme: 'system' }).theme).toBeUndefined()
  })

  it('calls a custom theme light or dark as the app does', () => {
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    const greys = Array.from({ length: 256 }, (_, n) => `#${hex(n).repeat(3)}`)
    const colours = ['#ff0000', '#00ff00', '#0000ff', '#7a5c3e', '#3f6f8f', '#c0a060']
    for (const background of [...greys, ...colours]) {
      const custom = { id: 'mine', name: 'Mine', background, text: '#000000', link: '#000000' }
      const dataset = bootWith({ theme: 'custom:mine', customThemes: [custom] })
      expect([background, dataset.scheme]).toEqual([background, schemeOfBackground(background)])
    }
  })
})
