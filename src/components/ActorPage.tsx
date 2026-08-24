"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Calendar, MapPin, Star } from "lucide-react"
import { fetchPersonDetails, fetchPersonCombinedCredits, IMG_URL, type TMDbPerson, type TMDbPersonCredit } from "@/lib/tmdb"
import { useI18n } from "@/i18n/I18nProvider"

interface ActorPageProps {
  actorId: number
  onBack: () => void
  onCreditClick: (mediaType: "movie" | "tv", id: number, title: string) => void
}

export default function ActorPage({ actorId, onBack, onCreditClick }: ActorPageProps) {
  const { lang, t } = useI18n()
  const [person, setPerson] = useState<TMDbPerson | null>(null)
  const [credits, setCredits] = useState<TMDbPersonCredit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPerson(null)
    setCredits([])
    Promise.all([
      fetchPersonDetails(actorId, lang),
      fetchPersonCombinedCredits(actorId, lang),
    ]).then(([personResult, creditsResult]) => {
      if (cancelled) return
      setPerson(personResult)
      setCredits(creditsResult.filter((credit) => credit.posterPath))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [actorId, lang])

  const profileSrc = person?.profile_path ? `${IMG_URL}/w342${person.profile_path}` : null
  const genderLabel = person?.gender === 2 ? t("common.male") : person?.gender === 1 ? t("common.female") : ""

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed top-0 right-0 left-0 z-40 bg-gradient-to-b from-black/80 to-transparent py-3 pl-3 animate-fade-in sm:py-4 sm:pl-4 lg:pl-6">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-white transition-all hover:scale-110 hover:bg-white/10 active:scale-95 sm:size-10"
          onClick={onBack}
        >
          <ChevronLeft className="size-5 sm:size-6" />
        </Button>
      </div>

      <div className="content-container pt-20 pb-16 sm:pt-24">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="size-8 animate-spin rounded-full border-2 border-neutral-700 border-t-white" />
          </div>
        ) : !person ? (
          <p className="py-24 text-center text-sm text-neutral-500">{t("common.noInfo")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="mx-auto aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl bg-neutral-900 sm:mx-0 sm:w-48">
                {profileSrc ? (
                  <img src={profileSrc} alt={person.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-neutral-700">
                    <Star className="size-8" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-white sm:text-3xl">{person.name}</h1>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                  {person.known_for_department && (
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                      {person.known_for_department}
                    </span>
                  )}
                  {person.birthday && (
                    <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                      <Calendar className="size-3" />
                      {person.birthday.split("-").reverse().join("-")}
                    </span>
                  )}
                  {person.place_of_birth && (
                    <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                      <MapPin className="size-3" />
                      {person.place_of_birth}
                    </span>
                  )}
                  {genderLabel && (
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">{genderLabel}</span>
                  )}
                </div>
                {person.biography && (
                  <p className="mt-4 line-clamp-6 max-w-3xl text-sm leading-relaxed text-neutral-400">
                    {person.biography}
                  </p>
                )}
              </div>
            </div>

            {credits.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 text-lg font-semibold text-white">{t("details.filmography")}</h2>
                <div className="grid grid-cols-3 items-start gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {credits.map((credit) => (
                    <button
                      key={`${credit.mediaType}-${credit.id}`}
                      onClick={() => onCreditClick(credit.mediaType, credit.id, credit.title)}
                      className="group cursor-pointer text-left"
                    >
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-neutral-900 shadow-md ring-1 ring-white/10">
                        <img
                          src={`${IMG_URL}/w342${credit.posterPath}`}
                          alt={credit.title}
                          className="h-full w-full object-cover transition-transform duration-500 ease-out will-change-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.45)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      </div>
                      <p className="mt-1.5 line-clamp-1 text-xs font-medium text-white">{credit.title}</p>
                      <p className="text-[11px] text-neutral-500">
                        {credit.year > 0 ? credit.year : "—"}
                        {credit.character ? ` · ${credit.character}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
