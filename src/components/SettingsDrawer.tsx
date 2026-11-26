import React, { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import {
  TableSettings,
  TableTheme,
  CardBackTheme,
  TrickLayout,
  ScoreAnchor,
  AiSpeed,
} from '../types';

interface SettingsDrawerProps {
  settings: TableSettings;
  isMuted: boolean;
  onToggleMute: () => void;
  onChange: (patch: Partial<TableSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

type TabId = 'cards' | 'table' | 'ui';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}) => (
  <label className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-300 font-medium">{label}</span>
      <span className="font-mono font-semibold text-slate-100 tabular-nums">
        {value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-[#13161e] rounded-lg appearance-none cursor-pointer accent-[#e91e63]"
    />
  </label>
);

const TABLE_THEMES: { id: TableTheme; label: string; swatch: string }[] = [
  { id: 'slate', label: 'Графит', swatch: '#4a4f5e' },
  { id: 'emerald', label: 'Изумруд', swatch: '#18543c' },
  { id: 'navy', label: 'Синий', swatch: '#223456' },
  { id: 'burgundy', label: 'Бордо', swatch: '#592333' },
];

const BACK_THEMES: { id: CardBackTheme; label: string; swatch: string }[] = [
  { id: 'slate', label: 'Серая', swatch: '#4c5464' },
  { id: 'crimson', label: 'Vivaro', swatch: '#7a192f' },
  { id: 'emerald', label: 'Зелёная', swatch: '#16583e' },
  { id: 'navy', label: 'Синяя', swatch: '#203763' },
];

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  settings,
  isMuted,
  onToggleMute,
  onChange,
  onReset,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('cards');

  return (
    <div
      className="fixed inset-y-0 right-0 z-[250] w-full max-w-[370px] bg-[#1e222d]/95 backdrop-blur-md border-l border-white/15 shadow-2xl flex flex-col text-slate-100"
      role="dialog"
      aria-modal="false"
      aria-label="Настройки карт и стола"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#181b24]">
        <div>
          <h2 className="text-sm font-bold tracking-tight">Настройки карт и стола</h2>
          <p className="text-[11px] text-slate-400">
            Изменения применяются в реальном времени
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть настройки"
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Segmented Tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-white/10 bg-[#1a1e28]">
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#12141c] rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('cards')}
            className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'cards'
                ? 'bg-[#e91e63] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Карты и веер
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'table'
                ? 'bg-[#e91e63] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Стол и взятка
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ui')}
            className={`py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'ui'
                ? 'bg-[#e91e63] text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Интерфейс
          </button>
        </div>
      </div>

      {/* Admin Bot Mode Controls */}
      <div className="px-4 py-3 border-b border-white/10 bg-[#161923] space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <span>Боты в игре (AI)</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                  settings.botsEnabled
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-700/60 text-slate-300'
                }`}
              >
                {settings.botsEnabled ? 'ВКЛ' : 'ВЫКЛ'}
              </span>
            </span>
            <span className="text-[11px] text-slate-400">
              {settings.botsEnabled
                ? 'Игра против AI и автоигра включены'
                : 'Все боты отключены — только игра с друзьями'}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              onChange({
                botsEnabled: !settings.botsEnabled,
                ...(!settings.botsEnabled ? {} : { botAutoPlay: false }),
              })
            }
            aria-pressed={settings.botsEnabled}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider shrink-0 cursor-pointer transition-colors ${
              settings.botsEnabled
                ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200'
            }`}
          >
            {settings.botsEnabled ? 'Отключить' : 'Включить'}
          </button>
        </div>

        {settings.botsEnabled && (
          <label className="flex items-center justify-between gap-3 pt-2 border-t border-white/10 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <span>Автоигра ботом за меня</span>
                {settings.botAutoPlay && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono uppercase">
                    ВКЛ
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-400">
                Бот автоматически торгуется и ходит картами за вас
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.botAutoPlay}
              onChange={(e) => onChange({ botAutoPlay: e.target.checked })}
              aria-label="Автоигра ботом за меня"
              className="accent-[#e91e63] w-4 h-4 shrink-0 cursor-pointer"
            />
          </label>
        )}
      </div>

      {/* Controls Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        {activeTab === 'cards' && (
          <>
            <div className="space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Веер и позиция руки игрока
              </div>

              <SliderRow
                label="Ширина веера (шаг карт)"
                value={settings.playerFanSpread}
                min={24}
                max={78}
                step={1}
                unit=" px"
                onChange={(v) => onChange({ playerFanSpread: v })}
              />

              <SliderRow
                label="Угол веера"
                value={settings.playerFanAngle}
                min={0}
                max={8}
                step={0.2}
                unit="°"
                onChange={(v) => onChange({ playerFanAngle: v })}
              />

              <SliderRow
                label="Изгиб дуги веера"
                value={settings.playerFanArc}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => onChange({ playerFanArc: v })}
              />

              <SliderRow
                label="Положение по горизонтали (X)"
                value={settings.playerHandOffsetX}
                min={-180}
                max={180}
                step={4}
                unit=" px"
                onChange={(v) => onChange({ playerHandOffsetX: v })}
              />

              <SliderRow
                label="Положение по вертикали (Y)"
                value={settings.playerHandOffsetY}
                min={-60}
                max={60}
                step={2}
                unit=" px"
                onChange={(v) => onChange({ playerHandOffsetY: v })}
              />

              <SliderRow
                label="Размер карт"
                value={Math.round(settings.cardScale * 100)}
                min={75}
                max={125}
                step={5}
                unit="%"
                onChange={(v) => onChange({ cardScale: Number((v / 100).toFixed(2)) })}
              />
            </div>

            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Внешний вид карт
              </div>

              <div>
                <div className="text-xs text-slate-300 font-medium mb-2">
                  Цвет рубашки
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {BACK_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onChange({ cardBackTheme: t.id })}
                      className={`p-2 rounded-lg border text-[11px] font-medium flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                        settings.cardBackTheme === t.id
                          ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                          : 'border-white/10 bg-[#141720] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded border border-white/20"
                        style={{ backgroundColor: t.swatch }}
                      />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between pt-2 cursor-pointer">
                <span className="text-xs text-slate-200 font-medium">
                  Нижний индекс на картах
                </span>
                <input
                  type="checkbox"
                  checked={settings.showBottomIndex}
                  onChange={(e) => onChange({ showBottomIndex: e.target.checked })}
                  className="accent-[#e91e63] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </>
        )}

        {activeTab === 'table' && (
          <>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                Сукно стола
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TABLE_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChange({ tableTheme: t.id })}
                    className={`p-2 rounded-lg border text-[11px] font-medium flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                      settings.tableTheme === t.id
                        ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                        : 'border-white/10 bg-[#141720] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full border border-white/20"
                      style={{ backgroundColor: t.swatch }}
                    />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Сыгранные карты (взятка)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'overlap', label: 'Стопкой (нахлёст)' },
                    { id: 'sideBySide', label: 'Рядом' },
                  ] as { id: TrickLayout; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ trickLayout: opt.id })}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      settings.trickLayout === opt.id
                        ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                        : 'border-white/10 bg-[#141720] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {settings.trickLayout === 'overlap' && (
                <SliderRow
                  label="Сдвиг карт во взятке"
                  value={settings.trickOffset}
                  min={8}
                  max={38}
                  step={1}
                  unit=" px"
                  onChange={(v) => onChange({ trickOffset: v })}
                />
              )}
            </div>

            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Колода и рука соперника
              </div>

              <SliderRow
                label="Колода по горизонтали (X)"
                value={settings.deckOffsetX}
                min={-120}
                max={80}
                step={4}
                unit=" px"
                onChange={(v) => onChange({ deckOffsetX: v })}
              />

              <SliderRow
                label="Колода по вертикали (Y)"
                value={settings.deckOffsetY}
                min={-140}
                max={140}
                step={4}
                unit=" px"
                onChange={(v) => onChange({ deckOffsetY: v })}
              />

              <SliderRow
                label="Ширина веера соперника"
                value={settings.aiFanSpread}
                min={18}
                max={60}
                step={1}
                unit=" px"
                onChange={(v) => onChange({ aiFanSpread: v })}
              />

              <SliderRow
                label="Позиция руки соперника (Y)"
                value={settings.aiHandOffsetY}
                min={-40}
                max={40}
                step={2}
                unit=" px"
                onChange={(v) => onChange({ aiHandOffsetY: v })}
              />
            </div>
          </>
        )}

        {activeTab === 'ui' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Положение панели счёта
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'bottomRight', label: 'Снизу справа' },
                    { id: 'topRight', label: 'Сверху справа' },
                    { id: 'bottomLeft', label: 'Снизу слева' },
                    { id: 'hidden', label: 'Скрыть панель' },
                  ] as { id: ScoreAnchor; label: string }[]
                ).map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => onChange({ scorePanelAnchor: pos.id })}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      settings.scorePanelAnchor === pos.id
                        ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                        : 'border-white/10 bg-[#141720] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Скорость хода AI
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'fast', label: 'Быстро' },
                    { id: 'normal', label: 'Обычно' },
                    { id: 'slow', label: 'Плавно' },
                  ] as { id: AiSpeed; label: string }[]
                ).map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => onChange({ aiSpeed: sp.id })}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      settings.aiSpeed === sp.id
                        ? 'border-[#e91e63] bg-[#e91e63]/15 text-white'
                        : 'border-white/10 bg-[#141720] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Подсказки и эффекты
              </div>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-200 font-medium">
                  Подсвечивать доступные карты
                </span>
                <input
                  type="checkbox"
                  checked={settings.highlightPlayable}
                  onChange={(e) => onChange({ highlightPlayable: e.target.checked })}
                  className="accent-[#e91e63] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-200 font-medium">
                  Всплывающие уведомления
                </span>
                <input
                  type="checkbox"
                  checked={settings.showToasts}
                  onChange={(e) => onChange({ showToasts: e.target.checked })}
                  className="accent-[#e91e63] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-200 font-medium">
                  Круговые таймеры хода
                </span>
                <input
                  type="checkbox"
                  checked={settings.showTimers}
                  onChange={(e) => onChange({ showTimers: e.target.checked })}
                  className="accent-[#e91e63] w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-200 font-medium">
                    Показывать счёт в конце раунда
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Если выключено — автопереход на следующий раунд
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showRoundResultModal}
                  onChange={(e) => onChange({ showRoundResultModal: e.target.checked })}
                  className="accent-[#e91e63] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-200 font-medium">
                  Звуковые эффекты
                </span>
                <input
                  type="checkbox"
                  checked={!isMuted}
                  onChange={onToggleMute}
                  className="accent-[#e91e63] w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-white/10 bg-[#181b24] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          className="px-3.5 py-2 rounded-lg bg-[#262b38] hover:bg-[#31384a] border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw size={14} />
          <span>Сбросить</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="btn-vivaro px-5 py-2 text-xs uppercase tracking-wider cursor-pointer"
        >
          Готово
        </button>
      </div>
    </div>
  );
};

export default SettingsDrawer;
