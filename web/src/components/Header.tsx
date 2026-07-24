'use client'

import type { DecItem, Room, Storage } from '@/lib/types'
import { SearchBar } from './SearchBar'

type Props = {
  decItems: DecItem[]
  storages: Storage[]
  rooms: Room[]
  onSearchPick: (storageId: string) => void
}

export function Header({ decItems, storages, rooms, onSearchPick }: Props) {
  return (
    <header>
      <div className="logo">
        <h1>홈즈맵</h1>
        <span className="en">HOMES MAP</span>
      </div>
      <SearchBar decItems={decItems} storages={storages} rooms={rooms} onPick={onSearchPick} />
    </header>
  )
}
