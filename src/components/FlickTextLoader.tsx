export default function FlickTextLoader() {
  return (
    <div className="flex flex-col items-center animate-fade-in" aria-label="Cargando Flick" role="status">
      <div className="flex items-baseline overflow-hidden text-5xl font-bold tracking-tighter text-white sm:text-6xl">
        {"flick".split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="inline-block animate-letter-pulse"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            {letter}
          </span>
        ))}
      </div>
      <span className="mt-3 h-px w-20 bg-white/70 animate-underline-sweep" />
    </div>
  )
}
