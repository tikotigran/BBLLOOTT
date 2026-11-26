import { TableSettings, TableTheme, CardBackTheme } from '../types';

export const SETTINGS_STORAGE_KEY = 'vivaro_blot_settings_v1';

export const DEFAULT_SETTINGS: TableSettings = {
  playerFanSpread: 54,
  playerFanAngle: 3.6,
  playerFanArc: 2.3,
  playerHandOffsetX: 0,
  playerHandOffsetY: 14,
  aiFanSpread: 38,
  aiHandOffsetY: -16,
  cardScale: 1,
  cardBackTheme: 'slate',
  showBottomIndex: false,
  tableTheme: 'slate',
  trickLayout: 'overlap',
  trickOffset: 18,
  deckOffsetX: 0,
  deckOffsetY: 0,
  scorePanelAnchor: 'bottomRight',
  showToasts: true,
  highlightPlayable: true,
  showTimers: true,
  showRoundResultModal: true,
  botsEnabled: false,
  botAutoPlay: false,
  aiSpeed: 'normal',
};

const clamp = (val: number, min: number, max: number, fallback: number) =>
  typeof val === 'number' && !Number.isNaN(val)
    ? Math.min(max, Math.max(min, val))
    : fallback;

export const sanitizeSettings = (
  raw: Partial<TableSettings> | null | undefined
): TableSettings => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    playerFanSpread: clamp(raw.playerFanSpread ?? DEFAULT_SETTINGS.playerFanSpread, 24, 78, DEFAULT_SETTINGS.playerFanSpread),
    playerFanAngle: clamp(raw.playerFanAngle ?? DEFAULT_SETTINGS.playerFanAngle, 0, 8, DEFAULT_SETTINGS.playerFanAngle),
    playerFanArc: clamp(raw.playerFanArc ?? DEFAULT_SETTINGS.playerFanArc, 0, 5, DEFAULT_SETTINGS.playerFanArc),
    playerHandOffsetX: clamp(raw.playerHandOffsetX ?? DEFAULT_SETTINGS.playerHandOffsetX, -180, 180, DEFAULT_SETTINGS.playerHandOffsetX),
    playerHandOffsetY: clamp(raw.playerHandOffsetY ?? DEFAULT_SETTINGS.playerHandOffsetY, -60, 60, DEFAULT_SETTINGS.playerHandOffsetY),
    aiFanSpread: clamp(raw.aiFanSpread ?? DEFAULT_SETTINGS.aiFanSpread, 18, 60, DEFAULT_SETTINGS.aiFanSpread),
    aiHandOffsetY: clamp(raw.aiHandOffsetY ?? DEFAULT_SETTINGS.aiHandOffsetY, -40, 40, DEFAULT_SETTINGS.aiHandOffsetY),
    cardScale: clamp(raw.cardScale ?? DEFAULT_SETTINGS.cardScale, 0.75, 1.25, DEFAULT_SETTINGS.cardScale),
    cardBackTheme: (['slate', 'crimson', 'emerald', 'navy'] as const).includes(raw.cardBackTheme as CardBackTheme)
      ? (raw.cardBackTheme as CardBackTheme)
      : DEFAULT_SETTINGS.cardBackTheme,
    showBottomIndex: typeof raw.showBottomIndex === 'boolean' ? raw.showBottomIndex : DEFAULT_SETTINGS.showBottomIndex,
    tableTheme: (['slate', 'emerald', 'navy', 'burgundy'] as const).includes(raw.tableTheme as TableTheme)
      ? (raw.tableTheme as TableTheme)
      : DEFAULT_SETTINGS.tableTheme,
    trickLayout: raw.trickLayout === 'sideBySide' ? 'sideBySide' : 'overlap',
    trickOffset: clamp(raw.trickOffset ?? DEFAULT_SETTINGS.trickOffset, 8, 38, DEFAULT_SETTINGS.trickOffset),
    deckOffsetX: clamp(raw.deckOffsetX ?? DEFAULT_SETTINGS.deckOffsetX, -120, 80, DEFAULT_SETTINGS.deckOffsetX),
    deckOffsetY: clamp(raw.deckOffsetY ?? DEFAULT_SETTINGS.deckOffsetY, -140, 140, DEFAULT_SETTINGS.deckOffsetY),
    scorePanelAnchor: (['bottomRight', 'topRight', 'bottomLeft', 'hidden'] as const).includes(raw.scorePanelAnchor as TableSettings['scorePanelAnchor'])
      ? (raw.scorePanelAnchor as TableSettings['scorePanelAnchor'])
      : DEFAULT_SETTINGS.scorePanelAnchor,
    showToasts: typeof raw.showToasts === 'boolean' ? raw.showToasts : DEFAULT_SETTINGS.showToasts,
    highlightPlayable: typeof raw.highlightPlayable === 'boolean' ? raw.highlightPlayable : DEFAULT_SETTINGS.highlightPlayable,
    showTimers: typeof raw.showTimers === 'boolean' ? raw.showTimers : DEFAULT_SETTINGS.showTimers,
    showRoundResultModal: typeof raw.showRoundResultModal === 'boolean' ? raw.showRoundResultModal : DEFAULT_SETTINGS.showRoundResultModal,
    botsEnabled: typeof raw.botsEnabled === 'boolean' ? raw.botsEnabled : DEFAULT_SETTINGS.botsEnabled,
    botAutoPlay:
      (typeof raw.botsEnabled === 'boolean' ? raw.botsEnabled : DEFAULT_SETTINGS.botsEnabled) &&
      typeof raw.botAutoPlay === 'boolean'
        ? raw.botAutoPlay
        : DEFAULT_SETTINGS.botAutoPlay,
    aiSpeed: (['fast', 'normal', 'slow'] as const).includes(raw.aiSpeed as TableSettings['aiSpeed'])
      ? (raw.aiSpeed as TableSettings['aiSpeed'])
      : DEFAULT_SETTINGS.aiSpeed,
  };
};

export const loadSettings = (): TableSettings => {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings: TableSettings) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
};

export const TABLE_THEME_BACKGROUNDS: Record<TableTheme, string> = {
  slate: 'radial-gradient(ellipse at 50% 48%, #585d6c 0%, #414654 48%, #2a2e39 100%)',
  emerald: 'radial-gradient(ellipse at 50% 48%, #1d5c42 0%, #13422f 50%, #0b291d 100%)',
  navy: 'radial-gradient(ellipse at 50% 48%, #2a3c5f 0%, #1c2944 50%, #11192b 100%)',
  burgundy: 'radial-gradient(ellipse at 50% 48%, #632b3b 0%, #441c28 50%, #280f17 100%)',
};

export const AI_SPEED_MS: Record<TableSettings['aiSpeed'], number> = {
  fast: 450,
  normal: 850,
  slow: 1350,
};
