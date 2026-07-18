import { useEffect, useRef, useState } from 'react'
import { readSharedState, writeSharedState } from './sharedState'

function readLocal(key, fallback) {
  if (!key) return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/**
 * Supabase shared_app_state tablosunda JSON veri saklar.
 * İlk çalışmada buluttaki kayıt yoksa mevcut localStorage verisini otomatik taşır.
 */
export function useSharedCloudState({ stateKey, localKey, fallback = [], readOnly = false, onError }) {
  const [value, setValue] = useState(() => readLocal(localKey, fallback))
  const [cloudReady, setCloudReady] = useState(false)
  const valueRef = useRef(value)
  const saveTimerRef = useRef(null)
  const skipNextSaveRef = useRef(false)

  useEffect(() => { valueRef.current = value }, [value])

  function setCloudValue(nextValue) {
    skipNextSaveRef.current = true
    setValue(nextValue)
  }

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      try {
        const localValue = readLocal(localKey, fallback)
        const result = await readSharedState(stateKey, fallback)
        if (cancelled) return

        if (result.updatedAt) {
          setValue(result.payload ?? fallback)
        } else if (!readOnly) {
          // İlk kurulum: aynı adresteki eski verileri bir defaya mahsus buluta taşı.
          setValue(localValue)
          await writeSharedState(stateKey, localValue)
        } else {
          setValue(result.payload ?? fallback)
        }
      } catch (error) {
        if (!cancelled) onError?.(error)
      } finally {
        if (!cancelled) setCloudReady(true)
      }
    }

    hydrate()
    return () => {
      cancelled = true
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [stateKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cloudReady) return
    if (localKey) {
      try { localStorage.setItem(localKey, JSON.stringify(value)) } catch {}
    }
    if (readOnly) return
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await writeSharedState(stateKey, valueRef.current)
      } catch (error) {
        onError?.(error)
      }
    }, 450)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [value, cloudReady, stateKey, localKey, readOnly, onError])

  return [value, setValue, cloudReady, setCloudValue]
}
