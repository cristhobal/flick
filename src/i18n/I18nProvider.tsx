/* eslint-disable react-refresh/only-export-components */
"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { detectLanguage, t as translate, type Lang } from "@/i18n/translations"

interface I18nContextValue {
  lang: Lang
  t: (key: string, vars?: Record<string, string | number>) => string
  ready: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

function applyLanguage(lang: Lang) {
  if (typeof window === "undefined") return
  try { localStorage.setItem("flick-lang", lang) } catch { /* Storage can be disabled. */ }
  document.cookie = `flick-lang=${lang}; path=/; max-age=31536000; samesite=lax`
  document.documentElement.lang = lang
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const syncWithBrowser = () => {
      const detected = detectLanguage()
      setLang(detected)
      applyLanguage(detected)
      setReady(true)
    }

    syncWithBrowser()
    window.addEventListener("languagechange", syncWithBrowser)
    return () => window.removeEventListener("languagechange", syncWithBrowser)
  }, [])

  useEffect(() => {
    if (!ready) return
    document.documentElement.removeAttribute("data-i18n-loading")
    document.title = translate("site.title", lang)
    const description = translate("site.description", lang)
    document.querySelector('meta[name="description"]')?.setAttribute("content", description)
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", document.title)
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description)
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", document.title)
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description)
  }, [ready, lang])

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    ready,
    t(key, vars) {
      return translate(key, lang, vars)
    },
  }), [lang, ready])

  return <I18nContext.Provider value={value}>{ready ? children : null}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error("useI18n must be used within I18nProvider")
  return context
}