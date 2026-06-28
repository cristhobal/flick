"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer"
import {
  Search,
  Menu,
  Home,
  Film,
  Tv,
  Clapperboard,
  Library,
  X,
} from "lucide-react"
import { useI18n } from "@/i18n/I18nProvider"

interface HeaderProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onNavigate?: (page: string) => void
  currentPage?: string
  hasSeries?: boolean
  hasAnime?: boolean
}

export default function Header({
  searchQuery,
  onSearchChange,
  onNavigate,
  currentPage = "home",
  hasSeries = true,
  hasAnime = true,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { t } = useI18n()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const isMobile = window.matchMedia("(max-width: 639px)").matches
    if (isMobile) {
      mobileSearchInputRef.current?.focus()
    } else {
      searchInputRef.current?.focus()
    }
  }, [searchOpen])

  const navLinks = [
    { label: t("nav.home"), icon: Home, id: "home", disabled: false },
    { label: t("nav.movies"), icon: Film, id: "movies", disabled: false },
    ...(hasSeries ? [{ label: t("nav.series"), icon: Tv, id: "series" as const, disabled: false }] : []),
    ...(hasAnime ? [{ label: t("nav.anime"), icon: Clapperboard, id: "anime" as const, disabled: false }] : []),
    { label: t("nav.library"), icon: Library, id: "library", disabled: false },
  ]

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-40 transition-all duration-500 ${
        isScrolled
          ? "border-b border-white/5 bg-black/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="content-container flex h-14 items-center gap-2 sm:h-16 sm:gap-4">
        {/* Logo */}
        <button
          onClick={() => onNavigate?.("home")}
          className="flex min-w-0 shrink-0 items-center gap-1.5"
        >
          <img
            src="/flick-logo.svg"
            alt="flick"
            className="h-7 w-auto sm:h-8"
            decoding="async"
          />
          <span className="hidden h-5 w-px bg-white/20 sm:block" />
        </button>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-0.5 lg:flex xl:gap-1">
          {navLinks.map((link) => (
            <button
              key={link.id}
              disabled={link.disabled}
              title={link.disabled ? t("common.availableSoon") : undefined}
              onClick={() => onNavigate?.(link.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors xl:px-3 ${
                link.disabled
                  ? "cursor-not-allowed text-neutral-600"
                  : currentPage === link.id
                    ? "text-white"
                    : "text-neutral-400 hover:text-white"
              }`}
            >
              <link.icon className="size-4 shrink-0" />
              <span className="hidden xl:inline">{link.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
          {/* Mobile animated search */}
          <div className="relative flex min-w-0 items-center sm:hidden">
            <div
              className={`flex cursor-pointer items-center overflow-hidden rounded-lg transition-all duration-300 ease-in-out ${
                searchOpen
                  ? "w-[min(11rem,calc(100vw-8rem))] border border-neutral-800 bg-neutral-900/70"
                  : "w-9"
              }`}
              onClick={() => {
                if (!searchOpen) setSearchOpen(true)
              }}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10">
                <Search className="size-4 text-neutral-500" />
              </div>
              <input
                ref={mobileSearchInputRef}
                type="text"
                placeholder={t("common.searchShort")}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className={`h-9 min-w-0 bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none transition-all duration-300 ${
                  searchOpen ? "w-full pr-2 opacity-100" : "w-0 p-0 opacity-0"
                }`}
              />
              {searchOpen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (searchQuery) {
                      onSearchChange("")
                    } else {
                      setSearchOpen(false)
                    }
                  }}
                  className="mr-2 shrink-0 text-neutral-500 hover:text-white"
                  aria-label="Cerrar busqueda"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Desktop animated search */}
          <div className="relative hidden sm:flex items-center">
            <div
              className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out cursor-pointer rounded-lg ${
                searchOpen
                  ? "w-48 border border-neutral-800 bg-neutral-900/50 md:w-60"
                  : "w-9"
              }`}
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true)
                } else if (!searchQuery) {
                  setSearchOpen(false)
                }
              }}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10">
                <Search className="size-4 text-neutral-500" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t("common.searchContent")}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className={`h-9 bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none transition-all duration-300 ${
                  searchOpen ? "w-full pr-2 opacity-100" : "w-0 p-0 opacity-0"
                }`}
                onFocus={() => { if (!searchOpen) setSearchOpen(true) }}
              />
              {searchQuery && searchOpen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSearchChange("")
                  }}
                  className="mr-2 shrink-0 text-neutral-500 hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile Menu — Vaul Drawer from left */}
          <Drawer
            open={mobileMenuOpen}
            onOpenChange={setMobileMenuOpen}
            direction="left"
          >
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-neutral-400 lg:hidden"
              >
                <Menu className="size-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="inset-y-0 left-0 h-full w-[72vw] max-w-[260px] overflow-hidden rounded-none border-r border-white/[0.06] bg-[#0a0a0a] p-0 text-white shadow-[24px_0_80px_rgba(0,0,0,0.8)]">
              {/* Header */}
              <DrawerHeader className="px-6 pt-8 pb-6">
                <div className="flex items-center justify-between">
                  <DrawerTitle className="text-lg font-bold tracking-tighter text-white">
                    <img
                      src="/flick-logo.svg"
                      alt="flick"
                      className="h-7 w-auto"
                      decoding="async"
                    />
                  </DrawerTitle>
                  <DrawerClose asChild>
                    <button
                      className="flex size-7 items-center justify-center rounded-full text-neutral-600 transition-colors hover:text-neutral-300"
                      aria-label="Cerrar menu"
                    >
                      <X className="size-3.5" />
                    </button>
                  </DrawerClose>
                </div>
                <DrawerDescription className="sr-only">
                  {t("nav.main")}
                </DrawerDescription>
              </DrawerHeader>

              {/* Nav */}
              <nav className="flex flex-col gap-0.5 px-3">
                {navLinks.map((link) => (
                  <button
                    key={link.id}
                    disabled={link.disabled}
                    title={link.disabled ? t("common.availableSoon") : undefined}
                    onClick={() => {
                      onNavigate?.(link.id)
                      setMobileMenuOpen(false)
                    }}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
                      link.disabled
                        ? "cursor-not-allowed opacity-25"
                        : currentPage === link.id
                          ? "bg-white/[0.07] text-white"
                          : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200"
                    }`}
                  >
                    <link.icon
                      className={`size-4 shrink-0 transition-colors ${
                        currentPage === link.id
                          ? "text-white"
                          : "text-neutral-600 group-hover:text-neutral-300"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-left font-medium">
                      {link.label}
                    </span>
                    {currentPage === link.id && (
                      <span className="size-1 shrink-0 rounded-full bg-white/40" />
                    )}
                  </button>
                ))}
              </nav>

              {/* Footer line */}
              <div className="absolute bottom-8 left-6 right-6">
                <div className="h-px bg-white/[0.04]" />
                <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-700">
                  {t("nav.main")}
                </p>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </header>
  )
}
