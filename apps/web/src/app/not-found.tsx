export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#020617',
        color: '#f1f5f9',
      }}
    >
      <h1 style={{ fontSize: '6rem', fontWeight: 700, margin: 0, color: '#3b82f6' }}>404</h1>
      <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginTop: '1rem' }}>
        Página não encontrada
      </p>
      <a
        href="/"
        style={{
          marginTop: '2rem',
          padding: '0.75rem 1.5rem',
          backgroundColor: '#3b82f6',
          color: '#fff',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        Voltar ao início
      </a>
    </div>
  );
}
