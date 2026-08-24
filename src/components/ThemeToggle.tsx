"use client"

import { useEffect, useState } from "react"

export default function ThemeToggle() {
  const [isLight, setIsLight] = useState(false)

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains("light"))
  }, [])

  const toggle = () => {
    const apply = () => {
      const next = document.documentElement.classList.toggle("light")
      localStorage.setItem("flick-theme", next ? "light" : "dark")
      setIsLight(next)
    }
    if (document.startViewTransition) {
      document.startViewTransition(apply)
    } else {
      document.documentElement.classList.add("theme-transitioning")
      apply()
      setTimeout(() => {
        document.documentElement.classList.remove("theme-transitioning")
      }, 400)
    }
  }

  return (
    <button
      onClick={toggle}
      title={isLight ? "Dark mode" : "Light mode"}
      type="button"
      className="cursor-pointer inline-flex items-center justify-center size-8 sm:size-9 rounded-lg text-sm font-medium text-neutral-500 transition-all duration-150 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95"
    >
      <svg
        className="size-4 hidden dark:block"
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
      ><g fill="none"><g fill="currentColor" clipPath="url(#themeSunClip)"><path d="M12 20a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1m-7.071-2.343a1 1 0 1 1 1.414 1.414l-1.414 1.414a1 1 0 0 1-1.414-1.414zm12.728 0a1 1 0 0 1 1.414 0l1.414 1.414a1 1 0 0 1-1.414 1.414l-1.414-1.414a1 1 0 0 1 0-1.414M12 6a6 6 0 1 1 0 12a6 6 0 0 1 0-12m-9 5a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2zm20 0a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2zM3.515 3.515a1 1 0 0 1 1.414 0l1.414 1.414a1 1 0 1 1-1.414 1.414L3.515 4.929a1 1 0 0 1 0-1.414m15.556 0a1 1 0 0 1 1.414 1.414l-1.414 1.414a1 1 0 1 1-1.414-1.414zM12 0a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V1a1 1 0 0 1 1-1"></path></g><defs><clipPath id="themeSunClip"><path fill="#fff" d="M0 0h24v24H0z"></path></clipPath></defs></g></svg>
      <svg
        className="size-4 block dark:hidden"
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="currentColor"
      ><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"></path></svg>
    </button>
  )
}
