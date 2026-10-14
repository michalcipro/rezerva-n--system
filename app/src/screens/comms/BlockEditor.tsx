import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { CampaignBlock } from '../../domain/types';
import { Button, Icon, IconButton, Menu, toast } from '../../ui';
import { BLOCK_LABEL, BLOCK_ORDER, blockHasContent, insertAt, newBlock, type BlockType } from './lib';
import { AutoTextarea, focusCaret } from './shared';

/** Bloky e-mailu se stabilními klíči (kvůli přesouvání a zachování fokusu). */
export interface BlockList {
  blocks: CampaignBlock[];
  keys: string[];
}

let keySeq = 0;
export const newBlockKey = (): string => `blk${(keySeq += 1)}`;

type Field = HTMLInputElement | HTMLTextAreaElement;
type FocusTarget = { key: string; action: 'field' | 'item' | 'up' | 'down' | 'delete' | 'add'; index?: number };

interface BlockEditorProps {
  value: BlockList;
  onChange: (update: (prev: BlockList) => BlockList) => void;
}

const NAME_TOKEN = '[jméno]';

/**
 * Úprava obsahu přímo v e-mailovém plátně: každý blok má lištu (posun, přidání,
 * duplikace, smazání) a pole ve stylu výsledného e-mailu.
 */
export function BlockEditor({ value, onChange }: BlockEditorProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const fields = useRef(new Map<string, Field>());
  const lastField = useRef<string | null>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const { blocks, keys } = value;

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target || !root.current) return;
    pendingFocus.current = null;
    const scope = root.current.querySelector<HTMLElement>(`[data-key="${target.key}"]`);
    if (!scope) return;
    let el: HTMLElement | null = null;
    if (target.action === 'field') el = scope.querySelector<HTMLElement>('textarea, input') ?? scope.querySelector<HTMLElement>('[data-action="delete"]');
    else if (target.action === 'item') el = scope.querySelector<HTMLElement>(`[data-item="${target.index ?? 0}"]`);
    else if (target.action === 'add') el = scope.querySelector<HTMLElement>('button');
    else el = scope.querySelector<HTMLElement>(`[data-action="${target.action}"]`);
    el?.focus();
  });

  const register = (id: string) => (el: Field | null) => {
    if (el) fields.current.set(id, el);
    else fields.current.delete(id);
  };

  const setBlock = (index: number, next: CampaignBlock): void =>
    onChange((prev) => ({ ...prev, blocks: prev.blocks.map((b, i) => (i === index ? next : b)) }));

  const insert = (type: BlockType, at: number): void => {
    const key = newBlockKey();
    onChange((prev) => {
      const nextBlocks = [...prev.blocks];
      const nextKeys = [...prev.keys];
      nextBlocks.splice(at, 0, newBlock(type));
      nextKeys.splice(at, 0, key);
      return { blocks: nextBlocks, keys: nextKeys };
    });
    pendingFocus.current = { key, action: 'field' };
  };

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const key = keys[index];
    onChange((prev) => {
      const nextBlocks = [...prev.blocks];
      const nextKeys = [...prev.keys];
      [nextBlocks[index], nextBlocks[target]] = [nextBlocks[target], nextBlocks[index]];
      [nextKeys[index], nextKeys[target]] = [nextKeys[target], nextKeys[index]];
      return { blocks: nextBlocks, keys: nextKeys };
    });
    const atEdge = target === 0 || target === blocks.length - 1;
    pendingFocus.current = { key, action: atEdge ? (dir < 0 ? 'down' : 'up') : dir < 0 ? 'up' : 'down' };
  };

  const duplicate = (index: number): void => {
    const copy = JSON.parse(JSON.stringify(blocks[index])) as CampaignBlock;
    const key = newBlockKey();
    onChange((prev) => {
      const nextBlocks = [...prev.blocks];
      const nextKeys = [...prev.keys];
      nextBlocks.splice(index + 1, 0, copy);
      nextKeys.splice(index + 1, 0, key);
      return { blocks: nextBlocks, keys: nextKeys };
    });
    pendingFocus.current = { key, action: 'field' };
  };

  const remove = (index: number): void => {
    const removed = blocks[index];
    const removedKey = keys[index];
    onChange((prev) => ({
      blocks: prev.blocks.filter((_, i) => i !== index),
      keys: prev.keys.filter((_, i) => i !== index),
    }));
    const neighbour = keys[index + 1] ?? keys[index - 1];
    pendingFocus.current = neighbour ? { key: neighbour, action: 'delete' } : { key: 'add-bar', action: 'add' };
    if (blockHasContent(removed)) {
      toast(`Blok „${BLOCK_LABEL[removed.type]}“ smazán`, {
        action: {
          label: 'Vrátit zpět',
          onClick: () =>
            onChange((prev) => {
              const at = Math.min(index, prev.blocks.length);
              const nextBlocks = [...prev.blocks];
              const nextKeys = [...prev.keys];
              nextBlocks.splice(at, 0, removed);
              nextKeys.splice(at, 0, removedKey);
              return { blocks: nextBlocks, keys: nextKeys };
            }),
        },
      });
    }
  };

  /** Vloží [jméno] na pozici kurzoru (poslední pole bloku, jinak na konec hlavního pole). */
  const insertName = (index: number): void => {
    const b = blocks[index];
    const key = keys[index];
    const last = lastField.current && lastField.current.startsWith(key + '|') ? lastField.current : null;
    const fieldId = last ?? (b.type === 'list' ? `${key}|item|${Math.max(0, b.items.length - 1)}` : `${key}|main`);
    const parts = fieldId.split('|');
    const el = fields.current.get(fieldId) ?? null;
    let current = '';
    if (b.type === 'heading' || b.type === 'text') current = b.text;
    else if (b.type === 'list') current = b.items[Number(parts[2])] ?? '';
    else return;
    const useCaret = last !== null && el !== null;
    const start = useCaret ? (el.selectionStart ?? current.length) : current.length;
    const end = useCaret ? (el.selectionEnd ?? current.length) : current.length;
    const res = insertAt(current, start, end, NAME_TOKEN);
    if (b.type === 'list') {
      const itemIndex = Number(parts[2]);
      setBlock(index, { ...b, items: b.items.map((it, i) => (i === itemIndex ? res.value : it)) });
    } else if (b.type === 'heading' || b.type === 'text') {
      setBlock(index, { ...b, text: res.value });
    }
    focusCaret(el, res.caret);
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number, itemIndex: number): void => {
    const b = blocks[index];
    if (b.type !== 'list') return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const items = [...b.items];
      items.splice(itemIndex + 1, 0, '');
      setBlock(index, { ...b, items });
      pendingFocus.current = { key: keys[index], action: 'item', index: itemIndex + 1 };
    } else if (event.key === 'Backspace' && b.items[itemIndex] === '' && b.items.length > 1) {
      event.preventDefault();
      setBlock(index, { ...b, items: b.items.filter((_, i) => i !== itemIndex) });
      pendingFocus.current = { key: keys[index], action: 'item', index: Math.max(0, itemIndex - 1) };
    }
  };

  return (
    <div className="com-blocks" ref={root}>
      {blocks.length === 0 && (
        <div className="com-blocks__empty">
          <p className="com-blocks__empty-title">E-mail je zatím prázdný</p>
          <p>Začněte nadpisem nebo odstavcem textu. Oslovení vložíte jako [jméno].</p>
        </div>
      )}
      {blocks.map((b, index) => {
        const key = keys[index];
        const n = index + 1;
        const label = BLOCK_LABEL[b.type];
        const named = `${label.toLowerCase()} (blok ${n})`;
        return (
          <div key={key} className="com-blk" data-key={key} data-type={b.type}>
            <div className="com-blk__bar">
              <span className="com-blk__label">
                {n}. {label}
              </span>
              <span className="com-blk__tools">
                {(b.type === 'heading' || b.type === 'text' || b.type === 'list') && (
                  <button
                    type="button"
                    className="com-blk__name"
                    title="Vložit oslovení – v e-mailu se nahradí křestním jménem příjemce"
                    aria-label={`Vložit [jméno] do bloku ${n}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertName(index)}
                  >
                    + [jméno]
                  </button>
                )}
                <IconButton
                  size="sm"
                  icon="arrowUp"
                  label={`Posunout ${named} výš`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  data-action="up"
                />
                <IconButton
                  size="sm"
                  icon="arrowDown"
                  label={`Posunout ${named} níž`}
                  disabled={index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                  data-action="down"
                />
                <Menu
                  trigger={<IconButton size="sm" icon="plus" label={`Přidat blok pod ${named}`} />}
                  label="Přidat blok"
                  items={BLOCK_ORDER.map((type) => ({ id: type, label: BLOCK_LABEL[type], onSelect: () => insert(type, index + 1) }))}
                />
                <IconButton size="sm" icon="copy" label={`Duplikovat ${named}`} onClick={() => duplicate(index)} data-action="copy" />
                <IconButton size="sm" icon="trash" label={`Smazat ${named}`} onClick={() => remove(index)} data-action="delete" />
              </span>
            </div>
            <div className="com-blk__body">
              {b.type === 'heading' && (
                <AutoTextarea
                  ref={register(`${key}|main`)}
                  className="com-email__h com-blk__grow"
                  value={b.text}
                  placeholder="Nadpis e-mailu"
                  aria-label={`Text nadpisu (blok ${n})`}
                  onFocus={() => (lastField.current = `${key}|main`)}
                  onChange={(event) => setBlock(index, { ...b, text: event.target.value.replace(/\n/g, ' ') })}
                />
              )}
              {b.type === 'text' && (
                <AutoTextarea
                  ref={register(`${key}|main`)}
                  className="com-email__p com-blk__grow"
                  value={b.text}
                  placeholder="Text odstavce. Prázdný řádek začne nový odstavec."
                  aria-label={`Text odstavce (blok ${n})`}
                  onFocus={() => (lastField.current = `${key}|main`)}
                  onChange={(event) => setBlock(index, { ...b, text: event.target.value })}
                />
              )}
              {b.type === 'list' && (
                <>
                  <ol className="com-email__list com-blk__list">
                    {b.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="com-email__li">
                        <span className="com-email__num" aria-hidden="true">
                          {itemIndex + 1}
                        </span>
                        <AutoTextarea
                          ref={register(`${key}|item|${itemIndex}`)}
                          className="com-blk__item"
                          value={item}
                          data-item={itemIndex}
                          placeholder="Položka seznamu"
                          aria-label={`Položka ${itemIndex + 1} (seznam, blok ${n})`}
                          onFocus={() => (lastField.current = `${key}|item|${itemIndex}`)}
                          onChange={(event) =>
                            setBlock(index, {
                              ...b,
                              items: b.items.map((it, i) => (i === itemIndex ? event.target.value.replace(/\n/g, ' ') : it)),
                            })
                          }
                          onKeyDown={(event) => onItemKeyDown(event, index, itemIndex)}
                        />
                        <IconButton
                          size="sm"
                          icon="x"
                          label={`Odebrat položku ${itemIndex + 1}`}
                          disabled={b.items.length === 1}
                          onClick={() => {
                            setBlock(index, { ...b, items: b.items.filter((_, i) => i !== itemIndex) });
                            pendingFocus.current = { key, action: 'item', index: Math.max(0, itemIndex - 1) };
                          }}
                        />
                      </li>
                    ))}
                  </ol>
                  <div className="com-blk__listfoot">
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setBlock(index, { ...b, items: [...b.items, ''] });
                        pendingFocus.current = { key, action: 'item', index: b.items.length };
                      }}
                    >
                      + Přidat položku
                    </button>
                    <span className="com-blk__hint">„Název · detail“ zobrazí detail vpravo</span>
                  </div>
                </>
              )}
              {b.type === 'button' && (
                <div className="com-blk__button">
                  <span className="com-email__btn com-blk__btn">
                    <input
                      className="com-blk__btnlabel"
                      value={b.label}
                      size={Math.max(8, b.label.length + 1)}
                      placeholder="Text tlačítka"
                      aria-label={`Text tlačítka (blok ${n})`}
                      onChange={(event) => setBlock(index, { ...b, label: event.target.value })}
                    />
                  </span>
                  <label className="com-blk__url">
                    <Icon name="link" size={14} />
                    <span className="visually-hidden">Odkaz tlačítka (blok {n})</span>
                    <input
                      type="url"
                      inputMode="url"
                      value={b.url}
                      placeholder="https://… (prázdné = rezervace kliniky)"
                      onChange={(event) => setBlock(index, { ...b, url: event.target.value })}
                    />
                  </label>
                </div>
              )}
              {b.type === 'divider' && <hr className="com-email__hr" />}
            </div>
          </div>
        );
      })}
      <div className="com-blocks__add" data-key="add-bar">
        <span className="com-blocks__add-label">Přidat blok</span>
        <div className="com-blocks__add-buttons">
          {BLOCK_ORDER.map((type) => (
            <Button key={type} size="sm" variant="secondary" icon="plus" onClick={() => insert(type, blocks.length)}>
              {BLOCK_LABEL[type]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
