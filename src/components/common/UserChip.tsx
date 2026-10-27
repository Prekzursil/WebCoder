'use client';

import React from 'react';
import Link from 'next/link';

/**
 * RAT-3 (competitive roadmap): one chip renders a username + rating color
 * everywhere — standings, the ratings ladder, leaderboards. The band table
 * mirrors backend ratings/glicko.RATING_BANDS (single source of truth);
 * unmapped ratings render unstyled (gray default).
 */

export const RATING_COLORS: { min: number; color: string }[] = [
    { min: 2300, color: '#8b0000' },
    { min: 2100, color: '#cc0000' },
    { min: 1900, color: '#ff6600' },
    { min: 1600, color: '#aa00aa' },
    { min: 1400, color: '#0000ff' },
    { min: 1200, color: '#008000' },
    { min: 0, color: '#808080' },
];

export function ratingColor(rating: number | null | undefined): string | null {
    if (rating === null || rating === undefined) return null;
    for (const band of RATING_COLORS) {
        if (rating >= band.min) return band.color;
    }
    return null;
}

interface UserChipProps {
    username: string;
    /** Display rating (RAT-2 suppression already applied server-side). */
    rating?: number | null;
    /** Render as a link to a route (e.g. /profile/3). Omit for plain text. */
    href?: string;
    bold?: boolean;
}

export default function UserChip({ username, rating, href, bold }: UserChipProps) {
    const color = ratingColor(rating) ?? 'inherit';
    const style: React.CSSProperties = {
        color,
        fontWeight: bold || (rating !== undefined && rating !== null && rating >= 1900) ? 700 : 500,
    };
    const label = (
        <span style={style} data-rating={rating ?? undefined}>
            {username}
            {rating !== undefined && rating !== null ? (
                <span style={{ opacity: 0.75, marginLeft: 4 }}>({rating})</span>
            ) : null}
        </span>
    );
    if (href) {
        return (
            <Link href={href} style={{ textDecoration: 'none' }}>
                {label}
            </Link>
        );
    }
    return label;
}
