"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"

export default function AnimatedLogoLoader() {
  const rootRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<SVGPathElement>(null)
  const innerRef = useRef<SVGPathElement>(null)
  const playRef = useRef<SVGPathElement>(null)
  const glossRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const shell = shellRef.current
    const inner = innerRef.current
    const play = playRef.current
    const gloss = glossRef.current
    if (!root || !shell || !inner || !play || !gloss) return

    const ctx = gsap.context(() => {
      gsap.set([root, shell, inner, play, gloss], { transformOrigin: "50% 50%" })
      gsap.set(root, { autoAlpha: 0, scale: 0.86, y: 8 })
      gsap.set(shell, { scale: 0.94, rotate: -3 })
      gsap.set(inner, { autoAlpha: 0, scale: 0.88 })
      gsap.set(play, { autoAlpha: 0, scale: 0.72 })
      gsap.set(gloss, { autoAlpha: 0, x: -80 })

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.18 })
      tl.to(root, {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: 0.55,
        ease: "power3.out",
      })
        .to(shell, {
          scale: 1,
          rotate: 0,
          duration: 0.7,
          ease: "elastic.out(1, 0.65)",
        }, 0.05)
        .to(inner, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.45,
          ease: "power2.out",
        }, 0.18)
        .to(play, {
          autoAlpha: 1,
          scale: 1,
          duration: 0.42,
          ease: "back.out(1.8)",
        }, 0.28)
        .to(gloss, {
          autoAlpha: 1,
          x: 0,
          duration: 0.48,
          ease: "power2.out",
        }, 0.36)
        .to(root, {
          scale: 1.035,
          duration: 0.8,
          ease: "sine.inOut",
        }, 0.86)
        .to(play, {
          scale: 0.9,
          duration: 0.36,
          ease: "sine.inOut",
        }, 0.9)
        .to(play, {
          scale: 1.04,
          duration: 0.42,
          ease: "sine.inOut",
        })
        .to(gloss, {
          x: 90,
          autoAlpha: 0.45,
          duration: 0.72,
          ease: "power1.inOut",
        }, 1.18)
        .to(root, {
          scale: 1,
          duration: 0.62,
          ease: "sine.inOut",
        }, 1.5)
        .to([shell, inner], {
          rotate: 1.4,
          duration: 0.7,
          ease: "sine.inOut",
        }, 1.48)
        .to([shell, inner], {
          rotate: 0,
          duration: 0.7,
          ease: "sine.inOut",
        })
        .to(root, {
          autoAlpha: 0.82,
          scale: 0.96,
          duration: 0.42,
          ease: "power2.inOut",
        })
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
    <div ref={rootRef} className="w-32 sm:w-40" aria-label="Cargando" role="status">
      <svg width="100%" viewBox="0 0 680 680" role="img" xmlns="http://www.w3.org/2000/svg">
        <title>Flick - Logo</title>
        <desc>Icono minimalista de plataforma de streaming con forma hexagonal redondeada y simbolo de play.</desc>
        <defs>
          <linearGradient id="loader-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7C4DFF" />
            <stop offset="40%" stopColor="#9C27B0" />
            <stop offset="75%" stopColor="#E91E63" />
            <stop offset="100%" stopColor="#FF2D75" />
          </linearGradient>
          <linearGradient id="loader-gloss" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id="loader-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="12" stdDeviation="24" floodColor="#9C27B0" floodOpacity="0.32" />
          </filter>
        </defs>

        <path
          ref={shellRef}
          d="M 340 90 C 380 90, 420 100, 452 118 L 548 170 C 572 182, 590 204, 592 230 L 592 340 L 592 450 C 592 476, 572 498, 548 510 L 452 562 C 420 580, 380 590, 340 590 C 300 590, 260 580, 228 562 L 132 510 C 108 498, 88 476, 88 450 L 88 340 L 88 230 C 88 204, 108 182, 132 170 L 228 118 C 260 100, 300 90, 340 90 Z"
          fill="url(#loader-grad)"
          filter="url(#loader-shadow)"
        />
        <path
          d="M 340 116 C 375 116, 410 125, 438 141 L 528 190 C 549 201, 564 221, 564 244 L 564 340 L 564 436 C 564 459, 549 479, 528 490 L 438 539 C 410 555, 375 564, 340 564 C 305 564, 270 555, 242 539 L 152 490 C 131 479, 116 459, 116 436 L 116 244 C 116 221, 131 201, 152 190 L 242 141 C 270 125, 305 116, 340 116 Z"
          fill="none"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth="1.5"
        />
        <path
          ref={innerRef}
          d="M 340 148 C 370 148, 400 156, 426 170 L 508 214 C 526 224, 538 242, 538 262 L 538 340 L 538 418 C 538 438, 526 456, 508 466 L 426 510 C 400 524, 370 532, 340 532 C 310 532, 280 524, 254 510 L 172 466 C 154 456, 142 438, 142 418 L 142 262 C 142 242, 154 224, 172 214 L 254 170 C 280 156, 310 148, 340 148 Z"
          fill="rgba(255,255,255,0.05)"
        />
        <path
          ref={playRef}
          d="M 302 276 Q 302 256, 320 264 L 432 329 Q 452 340, 432 351 L 320 416 Q 302 424, 302 404 Z"
          fill="rgba(255,255,255,0.28)"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          ref={glossRef}
          d="M 340 90 C 380 90, 420 100, 452 118 L 548 170 C 572 182, 590 204, 592 230 L 592 310 C 490 288, 370 282, 250 305 L 88 340 L 88 230 C 88 204, 108 182, 132 170 L 228 118 C 260 100, 300 90, 340 90 Z"
          fill="url(#loader-gloss)"
        />
      </svg>
    </div>
  )
}
