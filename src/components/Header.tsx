"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
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

  // Detect scroll for transparent header
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Focus search input when it opens
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
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
      <div className="mx-auto flex h-16 max-w-[1920px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <button
          onClick={() => onNavigate?.("home")}
          className="flex shrink-0 items-center gap-1.5"
        >
          <span className="text-2xl font-bold tracking-tighter text-white">
            flick
          </span>
          <span className="hidden h-5 w-px bg-white/20 sm:block" />
        </button>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <button
              key={link.id}
              disabled={link.disabled}
              title={link.disabled ? t("common.availableSoon") : undefined}
              onClick={() => onNavigate?.(link.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                link.disabled
                  ? "cursor-not-allowed text-neutral-600"
                  : currentPage === link.id
                    ? "text-white"
                    : "text-neutral-400 hover:text-white"
              }`}
            >
              <link.icon className="size-4" />
              <span>{link.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          {/* Desktop animated search */}
          <div className="relative hidden md:flex items-center">
            <div
              className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out cursor-pointer rounded-lg ${
                searchOpen
                  ? "w-60 border border-neutral-800 bg-neutral-900/50"
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

          {/* Mobile Menu — Vaul Drawer desde la izquierda */}
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
            <DrawerContent className="w-72 border-r border-neutral-800 bg-neutral-950 p-0 inset-y-0 left-0 h-full rounded-none">
              <DrawerHeader className="border-b border-neutral-800 px-5 py-4">
                <DrawerTitle className="text-left text-xl font-bold tracking-tighter text-white">
                  flick
                </DrawerTitle>
                <DrawerDescription className="sr-only">
                  {t("nav.main")}
                </DrawerDescription>
              </DrawerHeader>

              {/* Mobile search inside drawer */}
              <div className="border-b border-neutral-800 px-4 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500" />
                  <Input
                    placeholder={t("common.searchShort")}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="h-9 w-full border-neutral-800 bg-neutral-900/50 pl-9 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-600"
                  />
                </div>
              </div>

              <nav className="flex flex-col gap-1 p-3">
                {navLinks.map((link) => (
                  <button
                    key={link.id}
                    disabled={link.disabled}
                    title={link.disabled ? t("common.availableSoon") : undefined}
                    onClick={() => {
                      onNavigate?.(link.id)
                      setMobileMenuOpen(false)
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      link.disabled
                        ? "cursor-not-allowed text-neutral-600"
                        : currentPage === link.id
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-400 hover:bg-neutral-800/50 hover:text-white"
                    }`}
                  >
                    <link.icon className="size-4" />
                    {link.label}
                  </button>
                ))}
              </nav>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </header>
  )
}
