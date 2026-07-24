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
  const [env, setEnv] = useState<'standalone' | 'ios' | 'android' | 'desktop'>('desktop')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [open])

  // 설치 안내 분기 — 정밀 탐지가 아니라 안내 문구 선택용이라 UA 휴리스틱으로 충분. 열 때 1회 판별.
  function openSheet() {
    if (window.matchMedia('(display-mode: standalone)').matches) setEnv('standalone')
    else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setEnv('ios')
    else if (/Android/.test(navigator.userAgent)) setEnv('android')
    else setEnv('desktop')
    setOpen(true)
  }

  const guide = {
    standalone: '홈 화면 앱으로 실행 중이에요 — 브라우저 자동 정리로부터 안전해요.',
    ios: '홈 화면에 추가하면 자동 정리를 막을 수 있어요. 사파리·크롬 모두 공유 버튼 → ‘홈 화면에 추가’.',
    android: '크롬 메뉴(⋮) → ‘홈 화면에 추가’(또는 ‘앱 설치’)로 설치하면 안전해요.',
    desktop: 'PC는 브라우저를 계속 쓰는 한 유지돼요. 크롬·엣지는 주소창 설치 아이콘으로 앱 설치, 맥 사파리는 파일 → ‘Dock에 추가’. 백업 파일을 가끔 내보내 두면 가장 확실해요.',
  }[env]

  return (
    <>
      <button type="button" className="hdr-settings" aria-label="설정" onClick={openSheet}>
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
              <br />{guide}
            </div>
            <button type="button" className="rowmenu-item cancel" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </>
  )
}
