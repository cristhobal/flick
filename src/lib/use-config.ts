"use client"

import { useState, useEffect } from "react"

type DataSource = "local" | "tmdb"

export function useConfig() {
  const [dataSource, setDataSource] = useState<DataSource>("local")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check build-time env (Vercel) first
    const buildEnv = import.meta.env.PUBLIC_DATA_SOURCE as string | undefined
    if (buildEnv === "tmdb" || buildEnv === "local") {
      setDataSource(buildEnv)
      setLoading(false)
      return
    }

    // Fall back to dev-server API
    fetch("/api/config")
      .then((res) => res.json())
      .then((config) => {
        if (config.dataSource === "tmdb" || config.dataSource === "local") {
          setDataSource(config.dataSource)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { dataSource, loading }
}
