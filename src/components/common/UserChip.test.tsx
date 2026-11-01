import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import UserChip, { ratingColor } from "./UserChip";

// RAT-3: one chip renders username + rating color everywhere. The band
// table mirrors backend ratings/glicko.RATING_BANDS.

describe("ratingColor band mapping", () => {
  it("maps the Codeforces-style ladder", () => {
    expect(ratingColor(2400)).toBe("#8b0000"); // legendary grandmaster
    expect(ratingColor(2200)).toBe("#cc0000"); // grandmaster
    expect(ratingColor(2000)).toBe("#ff6600"); // master
    expect(ratingColor(1700)).toBe("#aa00aa"); // expert
    expect(ratingColor(1500)).toBe("#0000ff"); // specialist
    expect(ratingColor(1300)).toBe("#008000"); // pupil
    expect(ratingColor(100)).toBe("#808080"); // newbie
  });

  it("null/undefined render unstyled", () => {
    expect(ratingColor(null)).toBeNull();
    expect(ratingColor(undefined)).toBeNull();
  });
});

describe("UserChip rendering", () => {
  it("renders the username with the rating appended", () => {
    render(<UserChip username="alice" rating={1905} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("(1905)")).toBeInTheDocument();
  });

  it("links to the given href", () => {
    render(<UserChip username="alice" rating={1500} href="/profile/2" />);
    const link = screen.getByRole("link", { name: /alice/ });
    expect(link).toHaveAttribute("href", "/profile/2");
    // Specialist blue from the band table.
    expect(link.firstChild).toHaveStyle({ color: "#0000ff" });
  });

  it("renders plain (unrated) handles without the rating suffix", () => {
    render(<UserChip username="newbie" />);
    expect(screen.getByText("newbie")).toBeInTheDocument();
    expect(screen.queryByText(/newbie \(/)).not.toBeInTheDocument();
    cleanup();
  });
});
