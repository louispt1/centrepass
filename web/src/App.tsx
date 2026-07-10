export default function App({ engineDescription }: { engineDescription: string }) {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "40rem" }}>
      <h1>CentrePass</h1>
      <p>Netball match statistics — local-first, offline, open source.</p>
      <p>
        Engine: <strong data-testid="engine-description">{engineDescription}</strong>
      </p>
      <p style={{ color: "#666" }}>
        The line above is computed in Rust (<code>netball-core</code>) and delivered through
        WebAssembly — this page is the walking skeleton proving that plumbing works.
      </p>
    </main>
  );
}
