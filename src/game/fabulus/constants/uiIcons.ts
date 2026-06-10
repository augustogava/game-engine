const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = '</svg>';

function svg(body: string): string {
    return SVG_OPEN + body + SVG_CLOSE;
}

export const SKILL_ICON_SVG: Record<string, string> = {
    'power-strike': svg('<path d="M5 19 19 5"/><path d="M14 5h5v5"/><path d="M5 14v5h5"/><path d="M7 17l2 2" stroke-width="2.4"/>'),
    'shield-bash': svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 11l3 3 3-3"/>'),
    'whirlwind': svg('<path d="M4 8h12a3 3 0 1 0-3-3"/><path d="M4 12h16a3 3 0 1 1-3 3"/><path d="M4 16h8a3 3 0 1 1-3 3"/>'),
    'battle-shout': svg('<path d="M4 10v4l8 5V5z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>'),
    'second-wind': svg('<path d="M12 21c-4-3.5-7-6.5-7-10a4.5 4.5 0 0 1 7-3.5A4.5 4.5 0 0 1 19 11c0 3.5-3 6.5-7 10z"/><path d="M8 11h2l1.5-3 2 5L15 11h1"/>'),
    'fire-bolt': svg('<path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-2 1-3 1.5-4.5C10.5 8 12 6 12 3z"/><path d="M12 21v-4"/>'),
    'frost-nova': svg('<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/><circle cx="12" cy="12" r="3.5"/>'),
    'arcane-orb': svg('<circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
    'mage-armor': svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 7v6M9 9.5h6"/>'),
    'mend': svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'),
    'default': svg('<circle cx="12" cy="12" r="7"/><path d="M12 8v5M12 16.2v.1"/>'),
};

export function skillIconSvg(iconKey: string): string {
    return SKILL_ICON_SVG[iconKey] ?? SKILL_ICON_SVG.default;
}

export const ITEM_TYPE_ICON_SVG: Record<number, string> = {
    1: svg('<path d="M5 19 17 7l2-4-4 2L3 17z"/><path d="M14 16l4 4M16 18l3-3"/>'),
    2: svg('<path d="M5 14a7 7 0 0 1 14 0v4H5z"/><path d="M12 7v-3M9 18v2M15 18v2"/>'),
    3: svg('<path d="M7 4h10l2 4-2 2v10H7V10L5 8z"/><path d="M12 4v6"/>'),
    4: svg('<path d="M7 3v10l-2 5h9v-6l-3-2V3z"/><path d="M14 18h5v3h-9"/>'),
    5: svg('<circle cx="12" cy="14" r="6"/><path d="M9 8l3-5 3 5"/>'),
    6: svg('<path d="M6 3a6 6 0 0 0 12 0"/><path d="M12 9v3"/><path d="M12 12l-2.5 3L12 19l2.5-4z"/>'),
    7: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>'),
};

export function itemIconSvg(itemType: number): string {
    return ITEM_TYPE_ICON_SVG[itemType] ?? SKILL_ICON_SVG.default;
}

export const GEAR_ICON_SVG = svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>');
export const CHARACTER_ICON_SVG = svg('<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>');
export const INVENTORY_ICON_SVG = svg('<path d="M4 8h16v12H4z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/><path d="M10 12h4"/>');
export const SKILLS_ICON_SVG = svg('<path d="M12 4 4 20h16z"/><path d="M12 4v6M9.5 13h5"/>');
export const POTION_ICON_SVG = svg('<path d="M10 3h4M11 3v4l-4 5a5.5 5.5 0 1 0 10 3 5.5 5.5 0 0 0-1.5-3L13 7V3"/>');
export const MOUNT_ICON_SVG = svg('<path d="M4 18c0-5 3-9 8-9 2 0 3-1 3-3l3 2-1 3c2 1 3 3 3 5"/><path d="M7 18v3M16 18v3"/>');
