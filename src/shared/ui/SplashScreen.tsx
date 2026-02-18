export function SplashScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        color: 'rgba(255,255,255,0.9)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>TaskFlow</div>
        <div style={{ marginTop: 8, opacity: 0.85 }}>Loading…</div>
      </div>
    </div>
  )
}

