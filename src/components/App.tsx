"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import HomePage from "@/components/HomePage"
import { I18nProvider } from "@/i18n/I18nProvider"

class AppErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null }

  static getDerivedStateFromError(error: unknown) {
    return {
      message: error instanceof Error ? error.message : "La aplicacion no pudo cargar.",
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Flick app error", error, info)
  }

  render() {
    if (this.state.message) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 text-center text-white">
          <div className="flex size-16 items-center justify-center rounded-full bg-neutral-900">
            <span className="text-2xl text-neutral-500">!</span>
          </div>
          <p className="max-w-xl text-sm text-neutral-400">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <I18nProvider>
        <HomePage />
      </I18nProvider>
    </AppErrorBoundary>
  )
}
