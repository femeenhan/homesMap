import { describe, it, expect } from 'vitest'
import { generateFDK, encryptField, decryptField, wrapFDK, unwrapFDK, exportFDKCode, importFDKCode } from './crypto'

describe('crypto', () => {
  it('필드 암복호 왕복', async () => {
    const fdk = await generateFDK()
    const blob = await encryptField(fdk, '손톱깎이')
    expect(blob).not.toContain('손톱깎이')
    expect(await decryptField(fdk, blob)).toBe('손톱깎이')
  })
  it('다른 키로는 복호 실패', async () => {
    const a = await generateFDK(), b = await generateFDK()
    const blob = await encryptField(a, '여권')
    await expect(decryptField(b, blob)).rejects.toBeTruthy()
  })
  it('패스프레이즈 래핑 왕복 + 틀린 암호 실패', async () => {
    const fdk = await generateFDK()
    const wrapped = await wrapFDK(fdk, 'hunter2')
    const restored = await unwrapFDK(wrapped, 'hunter2')
    expect(await decryptField(restored, await encryptField(fdk, 'x'))).toBe('x')
    await expect(unwrapFDK(wrapped, 'wrong')).rejects.toBeTruthy()
  })
  it('초대 코드 export/import 왕복', async () => {
    const fdk = await generateFDK()
    const code = await exportFDKCode(fdk)
    const imported = await importFDKCode(code)
    expect(await decryptField(imported, await encryptField(fdk, 'y'))).toBe('y')
  })
})
