"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import {
  Search,
  Menu,
  Home,
  Film,
  Tv,
  Clapperboard,
  Library,
  ChevronRight,
  X,
} from "lucide-react"
import { useI18n } from "@/i18n/I18nProvider"
import ThemeToggle from "@/components/ThemeToggle"
import { useScrollViewport } from "@/lib/scroll-container"

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
  const scrollViewport = useScrollViewport()

  useEffect(() => {
    if (!scrollViewport) return
    const onScroll = () => setIsScrolled(scrollViewport.scrollTop > 50)
    onScroll()
    scrollViewport.addEventListener("scroll", onScroll, { passive: true })
    return () => scrollViewport.removeEventListener("scroll", onScroll)
  }, [scrollViewport])

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
          className="flex min-w-0 shrink-0 cursor-pointer items-center"
        >
          <span className="text-xl font-bold tracking-tighter text-white sm:text-2xl">
            flick
          </span>
        </button>
        <span className="mx-3 hidden h-5 w-px shrink-0 bg-white/20 sm:block" />

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
                    ? "cursor-pointer text-white"
                    : "cursor-pointer text-neutral-400 hover:text-white"
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
                  className="mr-2 shrink-0 cursor-pointer text-neutral-500 hover:text-white"
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
                  className="mr-2 shrink-0 cursor-pointer text-neutral-500 hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <ThemeToggle />

          {/* Mobile menu. A Sheet (Radix Dialog), not a Vaul Drawer: Vaul rubber-bands a
              drag away from the dismiss direction, which on a side panel pinned to the
              edge just tears it off that edge and exposes the page behind it. A Sheet has
              no drag gesture, and it matches the panel FilterSidebar already uses. */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-neutral-400 lg:hidden"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              overlayClassName="bg-black/60 supports-backdrop-filter:backdrop-blur-[2px]"
              // The width carries the `data-[side=left]` prefix so it overrides the
              // variant-scoped `w-3/4` in the base styles instead of tying on specificity.
              className="gap-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-2xl data-[side=left]:w-[min(86vw,20rem)] data-[side=left]:sm:max-w-none supports-backdrop-filter:bg-sidebar/85 supports-backdrop-filter:backdrop-blur-xl"
            >
              <SheetHeader className="shrink-0 gap-0 border-b border-sidebar-border/60 px-5 pt-6 pb-4">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-xl font-bold tracking-tighter text-sidebar-foreground">
                    flick
                  </SheetTitle>
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      aria-label="Cerrar menu"
                    >
                      <X className="size-4" />
                    </Button>
                  </SheetClose>
                </div>
                <SheetDescription className="sr-only">
                  {t("nav.main")}
                </SheetDescription>
              </SheetHeader>

              <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/35 uppercase">
                  {t("nav.main")}
                </p>
                <ul className="flex flex-col gap-1">
                  {navLinks.map((link) => {
                    const active = currentPage === link.id
                    return (
                      <li key={link.id}>
                        <button
                          disabled={link.disabled}
                          title={link.disabled ? t("common.availableSoon") : undefined}
                          aria-current={active ? "page" : undefined}
                          onClick={() => {
                            onNavigate?.(link.id)
                            setMobileMenuOpen(false)
                          }}
                          className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl py-2.5 pr-3 pl-3.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                            link.disabled
                              ? "cursor-not-allowed opacity-25"
                              : active
                                ? "cursor-pointer bg-gradient-to-r from-sidebar-accent to-sidebar-accent/25 text-sidebar-accent-foreground"
                                : "cursor-pointer text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground active:scale-[0.985]"
                          }`}
                        >
                          {/* Active rail — reads at a glance without relying on the fill alone */}
                          {active && (
                            <span
                              aria-hidden
                              className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary"
                            />
                          )}
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              active
                                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                : "bg-sidebar-accent/40 text-sidebar-foreground/55 group-hover:bg-sidebar-accent/70 group-hover:text-sidebar-foreground"
                            }`}
                          >
                            <link.icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-left font-medium">
                            {link.label}
                          </span>
                          <ChevronRight
                            aria-hidden
                            className={`size-4 shrink-0 transition-opacity ${
                              active ? "opacity-45" : "opacity-0 group-hover:opacity-30"
                            }`}
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>

              <SheetFooter className="shrink-0 gap-0 border-t border-sidebar-border/60 px-5 py-4">
                <p className="text-[11px] font-medium text-sidebar-foreground/35">
                  flick &middot; {new Date().getFullYear()}
                </p>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
