export const uint8ArrayToBase64 = (bytes) => {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < buffer.length; index += chunkSize) {
    const chunk = buffer.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export const base64ToUint8Array = (base64Text = '') => {
  const text = String(base64Text ?? '').trim()
  if (!text) return new Uint8Array()
  const binary = atob(text)
  const result = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index)
  }
  return result
}
