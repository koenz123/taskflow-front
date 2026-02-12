const DB_NAME = 'ui-create-works.files.v1'
const STORE = 'blobs'
const VERSION = 1

type BlobRecord = {
  id: string
  blob: Blob
  createdAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const rec: BlobRecord = { id, blob, createdAt: new Date().toISOString() }
  store.put(rec)
  await txDone(tx)
  db.close()
}

export async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  const req = store.get(id)
  const result = await new Promise<BlobRecord | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as BlobRecord | undefined)
    req.onerror = () => reject(req.error ?? new Error('Failed to read blob'))
  })
  await txDone(tx)
  db.close()
  return result?.blob ?? null
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
  db.close()
}

