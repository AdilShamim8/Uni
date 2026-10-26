/**
 * Read a text file in a way that works in browsers (Blob.text) and in
 * jsdom-based tests (FileReader fallback — jsdom does not implement
 * Blob.prototype.text).
 */
export async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsText(file)
  })
}
