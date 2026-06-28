"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"

export default function FlickTextLoader() {
  const rootRef = useRef<HTMLDivElement>(null)
  const lettersRef = useRef<HTMLSpanElement[]>([])
  const underlineRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const underline = underlineRef.current
    const letters = lettersRef.current.filter(Boolean)
    if (!root || !underline || letters.length === 0) return

    const ctx = gsap.context(() => {
      gsap.set(root, { autoAlpha: 0, y: 8, scale: 0.96 })
      gsap.set(letters, { y: 12, autoAlpha: 0 })
      gsap.set(underline, { scaleX: 0, transformOrigin: "0% 50%" })

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.35 })
      tl.to(root, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.35,
        ease: "power3.out",
      })
        .to(letters, {
          autoAlpha: 1,
          y: 0,
          duration: 0.34,
          stagger: 0.055,
          ease: "power3.out",
        }, 0.05)
        .to(underline, {
          scaleX: 1,
          duration: 0.55,
          ease: "power3.inOut",
        }, 0.22)
        .to(letters, {
          y: -3,
          duration: 0.45,
          stagger: 0.045,
          ease: "sine.inOut",
        }, 0.78)
        .to(letters, {
          y: 0,
          duration: 0.45,
          stagger: 0.045,
          ease: "sine.inOut",
        }, 1.12)
        .to(underline, {
          scaleX: 0,
          transformOrigin: "100% 50%",
          duration: 0.5,
          ease: "power3.inOut",
        }, 1.55)
        .to(root, {
          autoAlpha: 0.72,
          scale: 0.985,
          duration: 0.42,
          ease: "power2.inOut",
        }, 1.75)
        .to(root, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.42,
          ease: "power2.out",
        })
    }, root)

    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="flex flex-col items-center" aria-label="Cargando Flick" role="status">
      <div className="flex items-baseline overflow-hidden text-5xl font-bold tracking-tighter text-white sm:text-6xl">
        {"flick".split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            ref={(element) => {
              if (element) lettersRef.current[index] = element
            }}
            className="inline-block"
          >
            {letter}
          </span>
        ))}
      </div>
      <span ref={underlineRef} className="mt-3 h-px w-20 bg-white/70" />
    </div>
  )
}
