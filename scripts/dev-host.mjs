// `npm run dev:host`: `astro dev --host`, reachable from other devices on the same
// network (phone, tablet, TV). Astro only prints the first network address it finds,
// which on a machine with a VPN or virtual adapters (Tailscale, WSL, Hyper-V) is often
// not the one a phone on the same Wi-Fi can reach. This lists every address, home
// network ones first, once the server reports its port.
//
// Extra arguments go straight to astro: `npm run dev:host -- --port 4000`.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { networkInterfaces } from "node:os"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const astroBin = join(dirname(require.resolve("astro/package.json")), "astro.js")

const child = spawn(process.execPath, [astroBin, "dev", "--host", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
})

// Home routers hand out 192.168.x.x / 10.x.x.x; 172.16-31.x.x is usually a virtual
// adapter (WSL, Hyper-V, Docker) and 100.64-127.x.x a VPN like Tailscale.
const rank = (ip) => {
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return 0
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return 2
  return 1
}

function networkUrls(port) {
  const rows = []
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal || address.address.startsWith("169.254.")) continue
      rows.push({ name, url: `http://${address.address}:${port}/`, rank: rank(address.address) })
    }
  }
  return rows.sort((a, b) => a.rank - b.rank)
}

let printed = false
let buffered = ""
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk)
  if (printed) return
  buffered += chunk.toString()
  const port = buffered.replace(/\x1b\[[0-9;]*m/g, "").match(/Local\s+https?:\/\/[^:\s]+:(\d+)/)?.[1]
  if (!port) return
  printed = true
  buffered = ""
  const rows = networkUrls(port)
  if (rows.length === 0) {
    process.stdout.write("\n  No hay ninguna red disponible para otros dispositivos.\n\n")
    return
  }
  const width = Math.max(...rows.map((row) => row.url.length))
  process.stdout.write("\n  Desde otro dispositivo en tu red (celular, tablet, TV):\n")
  rows.forEach((row, index) => {
    const hint = index === 0 && row.rank === 0 ? "  ← red de casa (wifi)" : ""
    process.stdout.write(`    ${row.url.padEnd(width)}  ${row.name}${hint}\n`)
  })
  process.stdout.write("\n")
})

const stop = (signal) => child.kill(signal)
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0))
