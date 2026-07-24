'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

// 설정 시트: 백업 내보내기/가져오기 + 저장소 보호 상태·홈 화면 설치 안내.
export function SettingsSheet({ onExport, onImportFile }: {
  onExport: () => void | Promise<void>
  onImportFile: (f: File) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [open])

  return (
    <>
      <button type="button" className="hdr-settings" aria-label="설정" onClick={() => setOpen(true)}>
        <Icon name="settings" size={19} />
      </button>
      {open && (
        <div className="sheet-wrap" onClick={() => setOpen(false)}>
          <div className="sheet settings" onClick={(e) => e.stopPropagation()}>
            <div className="settings-title">설정</div>
            <div className="rowmenu-group">
              <button type="button" className="rowmenu-item" onClick={() => { setOpen(false); void onExport() }}>백업 파일 내보내기</button>
              <button type="button" className="rowmenu-item" onClick={() => fileRef.current?.click()}>백업 파일 가져오기</button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setOpen(false); void onImportFile(f) } }} />
            <div className="settings-note">
              데이터는 이 기기·브라우저에만 저장돼요.
              {persisted === true && ' 저장소 보호: 켜짐.'}
              {persisted === false && ' 저장소 보호: 꺼짐 — 브라우저가 오래 안 쓴 데이터를 정리할 수 있어요.'}
              <br />홈 화면에 추가하면 자동 정리를 막을 수 있어요 (사파리 공유 버튼 → &lsquo;홈 화면에 추가&rsquo;).
            </div>
            <button type="button" className="rowmenu-item cancel" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </>
  )
}
