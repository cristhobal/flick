"use client"

import HomePage from "@/components/HomePage"
import { I18nProvider } from "@/i18n/I18nProvider"

export default function App() {
  return (
    <I18nProvider>
      <HomePage />
    </I18nProvider>
  )
}