'use client'

import type { DecItem, Room, Storage } from '@/lib/types'
import { SearchBar } from './SearchBar'
import { SettingsSheet } from './SettingsSheet'

type Props = {
  decItems: DecItem[]
  storages: Storage[]
  rooms: Room[]
  onSearchPick: (storageId: string) => void
  onExport: () => void | Promise<void>
  onImportFile: (f: File) => void | Promise<void>
}

export function Header({ decItems, storages, rooms, onSearchPick, onExport, onImportFile }: Props) {
  return (
    <header>
      <div className="logo">
        <h1>그거거기</h1>
      </div>
      <SearchBar decItems={decItems} storages={storages} rooms={rooms} onPick={onSearchPick} />
      <SettingsSheet onExport={onExport} onImportFile={onImportFile} />
    </header>
  )
}
