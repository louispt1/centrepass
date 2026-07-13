import { useMemo } from "react";
import type { Descriptor } from "./types/Descriptor";
import { definitionsReference } from "./engine";

// A quick reference for positions, actions, and modifiers, opened from the live
// coding screen (issue 10). It is an overlay, not a route, so the live screen
// stays mounted and coding state — the selected position, the Failed/Flag
// toggles, the in-progress log — is never lost while it is open.
//
// The action and modifier text is core data (definitionsReference), the very
// same descriptors that generate DEFINITIONS.md: no hand-maintained copy.

// The seven on-court positions plus TEAM, with their full names. These are the
// position codes themselves, not NVAC descriptors, so they live here.
const POSITIONS: [string, string][] = [
  ["GS", "Goal Shooter"],
  ["GA", "Goal Attack"],
  ["WA", "Wing Attack"],
  ["C", "Centre"],
  ["WD", "Wing Defence"],
  ["GD", "Goal Defence"],
  ["GK", "Goal Keeper"],
  ["TEAM", "Unattributed to a player"],
];

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: "1rem",
  overflowY: "auto",
  zIndex: 100,
} as const;

const sheet = {
  background: "#fff",
  color: "#111",
  borderRadius: "12px",
  padding: "1rem",
  maxWidth: "32rem",
  width: "100%",
  margin: "auto",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
} as const;

const th = {
  textAlign: "left",
  padding: "0.25rem 0.5rem",
  borderBottom: "2px solid #ccc",
  fontSize: "0.8rem",
} as const;
const td = {
  padding: "0.3rem 0.5rem",
  borderBottom: "1px solid #eee",
  fontSize: "0.85rem",
  verticalAlign: "top",
} as const;
const codeCell = { ...td, fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" } as const;

function DescriptorRows({ rows }: { rows: Descriptor[] }) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.label} data-testid={`reference-row-${row.label}`}>
          <td style={codeCell}>{row.code ?? "—"}</td>
          <td style={{ ...td, fontWeight: 600 }}>
            {row.label}
            {row.parent && <span style={{ color: "#888", fontWeight: 400 }}> · {row.parent}</span>}
            <div style={{ color: "#888", fontWeight: 400, fontSize: "0.75rem" }}>
              {row.resolution}
            </div>
          </td>
          <td style={td}>{row.definition}</td>
        </tr>
      ))}
    </>
  );
}

export default function ReferencePanel({ onClose }: { onClose: () => void }) {
  const { actions, modifiers } = useMemo(() => definitionsReference(), []);

  return (
    <div
      style={overlay}
      data-testid="reference-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Coding reference"
      onClick={onClose}
    >
      {/* Stop clicks inside the sheet from closing the overlay. */}
      <div style={sheet} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>Coding reference</h2>
          <button
            data-testid="reference-close"
            onClick={onClose}
            style={{
              minHeight: "40px",
              minWidth: "40px",
              fontSize: "1rem",
              border: "1px solid #999",
              borderRadius: "8px",
              background: "#fff",
            }}
            aria-label="Close reference"
          >
            Done
          </button>
        </div>

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.25rem" }}>Positions</h3>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1rem" }}>
          <tbody>
            {POSITIONS.map(([code, name]) => (
              <tr key={code} data-testid={`reference-position-${code}`}>
                <td style={codeCell}>{code}</td>
                <td style={td}>{name}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.25rem" }}>Actions</h3>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th style={th}>Code</th>
              <th style={th}>Descriptor</th>
              <th style={th}>Definition</th>
            </tr>
          </thead>
          <tbody>
            <DescriptorRows rows={actions} />
          </tbody>
        </table>

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.25rem" }}>Modifiers</h3>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Code</th>
              <th style={th}>Modifier</th>
              <th style={th}>Definition</th>
            </tr>
          </thead>
          <tbody>
            <DescriptorRows rows={modifiers} />
          </tbody>
        </table>

        <p style={{ color: "#888", fontSize: "0.75rem", marginTop: "1rem", marginBottom: 0 }}>
          Terminology follows the NVAC taxonomy (Mackay et al. 2023). Full definitions and
          deviations are in DEFINITIONS.md.
        </p>
      </div>
    </div>
  );
}
