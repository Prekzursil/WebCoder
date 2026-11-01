import React from "react";

// Shared horizontal-scroll wrapper for wide tables [SPEC-GAPS A1]: the list
// tables previously sat inside overflow:hidden containers that silently
// clipped columns on narrow screens. Applies the .table-scroll global class
// (overflow-x auto + min-width on the inner table via globals.css).
interface TableScrollProps {
  children: React.ReactNode;
}

export default function TableScroll({ children }: TableScrollProps) {
  return <div className="table-scroll">{children}</div>;
}
