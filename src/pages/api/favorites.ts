import type { APIRoute } from "astro"
import mysql from "mysql2/promise"
import type { Movie } from "@/lib/data"

const DB_NAME = "flick"
const TABLE_NAME = "favorites"

let ready = false

async function getConnection() {
  const connection = await mysql.createConnection({
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "",
    multipleStatements: false,
  })

  if (!ready) {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connection.query(`USE \`${DB_NAME}\``)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${TABLE_NAME}\` (
        type VARCHAR(16) NOT NULL,
        tmdb_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        year INT NULL,
        poster_path VARCHAR(255) NULL,
        backdrop_path VARCHAR(255) NULL,
        genre VARCHAR(255) NULL,
        rating DECIMAL(3,1) NULL,
        payload JSON NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (type, tmdb_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    ready = true
  } else {
    await connection.query(`USE \`${DB_NAME}\``)
  }

  return connection
}

function unavailable() {
  return new Response(JSON.stringify({ available: false, favorites: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function movieKey(movie: Pick<Movie, "type" | "tmdbId">) {
  return `${movie.type}:${movie.tmdbId}`
}

export const GET: APIRoute = async () => {
  let connection: mysql.Connection | null = null
  try {
    connection = await getConnection()
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT type, tmdb_id FROM \`${TABLE_NAME}\` ORDER BY created_at DESC`
    )
    return new Response(JSON.stringify({
      available: true,
      favorites: rows.map((row) => `${row.type}:${row.tmdb_id}`),
    }), {
      headers: { "content-type": "application/json" },
    })
  } catch {
    return unavailable()
  } finally {
    await connection?.end().catch(() => undefined)
  }
}

export const POST: APIRoute = async ({ request }) => {
  let connection: mysql.Connection | null = null
  try {
    const movie = await request.json() as Movie
    if (!movie?.tmdbId || !movie?.type || !movie?.title) {
      return new Response(JSON.stringify({ available: true, ok: false }), { status: 400 })
    }

    connection = await getConnection()
    await connection.execute(
      `INSERT INTO \`${TABLE_NAME}\`
        (type, tmdb_id, title, year, poster_path, backdrop_path, genre, rating, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        year = VALUES(year),
        poster_path = VALUES(poster_path),
        backdrop_path = VALUES(backdrop_path),
        genre = VALUES(genre),
        rating = VALUES(rating),
        payload = VALUES(payload)`,
      [
        movie.type,
        movie.tmdbId,
        movie.title,
        movie.year || null,
        movie.posterPath || null,
        movie.backdropPath || null,
        movie.genre || null,
        movie.rating || null,
        JSON.stringify(movie),
      ]
    )

    return new Response(JSON.stringify({ available: true, ok: true, key: movieKey(movie) }), {
      headers: { "content-type": "application/json" },
    })
  } catch {
    return unavailable()
  } finally {
    await connection?.end().catch(() => undefined)
  }
}

export const DELETE: APIRoute = async ({ request }) => {
  let connection: mysql.Connection | null = null
  try {
    const body = await request.json() as Pick<Movie, "type" | "tmdbId">
    if (!body?.tmdbId || !body?.type) {
      return new Response(JSON.stringify({ available: true, ok: false }), { status: 400 })
    }

    connection = await getConnection()
    await connection.execute(
      `DELETE FROM \`${TABLE_NAME}\` WHERE type = ? AND tmdb_id = ?`,
      [body.type, body.tmdbId]
    )

    return new Response(JSON.stringify({ available: true, ok: true, key: movieKey(body) }), {
      headers: { "content-type": "application/json" },
    })
  } catch {
    return unavailable()
  } finally {
    await connection?.end().catch(() => undefined)
  }
}
