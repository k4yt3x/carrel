import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isSortOrder, type SortOrder } from '@/domain/arrange'

interface LibraryViewState {
  sort: SortOrder
  setSort(sort: SortOrder): void
}

/** How the library is arranged. Kept across visits, since nobody wants to re-pick it. */
export const useLibraryView = create<LibraryViewState>()(
  persist(
    (set) => ({
      sort: 'recent',
      setSort: (sort) => set({ sort }),
    }),
    {
      name: 'carrel.library-view',
      version: 1,
      // localStorage is outside the app's control; a value it doesn't recognise is dropped.
      merge: (persisted, current) => {
        const sort = (persisted as { sort?: unknown } | undefined)?.sort
        return isSortOrder(sort) ? { ...current, sort } : current
      },
    },
  ),
)
