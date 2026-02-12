export function HomePage() {
  return (
    <main
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(34px, 7vw, 72px)',
          fontWeight: 800,
          letterSpacing: '0.4px',
          lineHeight: 1.05,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.95)',
        }}
      >
        Лендинг
      </div>
    </main>
  )
}

