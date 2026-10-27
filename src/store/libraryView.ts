import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isSortOrder, type SortOrder } from '@/domain/arrange'

export type LibraryLayout = 'grid' | 'list'

interface LibraryViewState {
  sort: SortOrder
  layout: LibraryLayout
  setSort(sort: SortOrder): void
  setLayout(layout: LibraryLayout): void
}

/** How the library is arranged. Kept across visits, since nobody wants to re-pick it. */
export const useLibraryView = create<LibraryViewState>()(
  persist(
    (set) => ({
      sort: 'recent',
      layout: 'grid',
      setSort: (sort) => set({ sort }),
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: 'carrel.library-view',
      version: 1,
      partialize: ({ sort, layout }) => ({ sort, layout }),
      // localStorage is outside the app's control; a value it doesn't recognise is dropped.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as { sort?: unknown; layout?: unknown }
        return {
          ...current,
          ...(isSortOrder(stored.sort) && { sort: stored.sort }),
          ...((stored.layout === 'grid' || stored.layout === 'list') && {
            layout: stored.layout,
          }),
        }
      },
    },
  ),
)
