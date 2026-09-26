import * as Blockly from 'blockly/core';
import { useEffect, useRef } from 'react';
import { useUi } from '@/stores/ui';
import { makeTheme, registerBlocks, TOOLBOX } from './blocks';
import type { CompileError, WorkspaceJson } from './compile';

interface BlocklyEditorProps {
  /** programa inicial; trocar `programKey` recarrega a área com `initial` */
  initial: WorkspaceJson;
  programKey: string;
  onChange: (json: WorkspaceJson) => void;
  /** erros de compilação/viabilidade: aparecem como aviso no bloco */
  errors: CompileError[];
  /** bloco em execução na prévia */
  activeBlockId?: string | null;
}

/** Área do Blockly: injeta, carrega o programa e devolve o JSON a cada mudança. */
export function BlocklyEditor({ initial, programKey, onChange, errors, activeBlockId }: BlocklyEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const change = useRef(onChange);
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  // injeta uma vez
  useEffect(() => {
    if (!host.current) return;
    registerBlocks();
    const w = Blockly.inject(host.current, {
      toolbox: TOOLBOX,
      theme: makeTheme(document.documentElement.dataset.theme === 'dark'),
      trashcan: true,
      sounds: false,
      zoom: { controls: true, wheel: true, startScale: 0.95, maxScale: 2, minScale: 0.4 },
      move: { scrollbars: true, drag: true, wheel: false },
      grid: { spacing: 24, length: 2, colour: 'rgba(128,128,128,0.25)', snap: true },
    });
    ws.current = w;
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || w.isDragging()) return;
      change.current(Blockly.serialization.workspaces.save(w) as WorkspaceJson);
    };
    w.addChangeListener(listener);
    const ro = new ResizeObserver(() => Blockly.svgResize(w));
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      w.dispose();
      ws.current = null;
    };
  }, []);

  // carrega o programa escolhido
  useEffect(() => {
    const w = ws.current;
    if (!w) return;
    Blockly.Events.disable();
    try {
      w.clear();
      Blockly.serialization.workspaces.load(initial as object, w);
    } finally {
      Blockly.Events.enable();
    }
    change.current(Blockly.serialization.workspaces.save(w) as WorkspaceJson);
    w.scrollCenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programKey]);

  useEffect(() => {
    ws.current?.setTheme(makeTheme(theme === 'dark'));
  }, [theme]);

  // avisos nos blocos com erro
  useEffect(() => {
    const w = ws.current;
    if (!w) return;
    for (const b of w.getAllBlocks(false)) b.setWarningText(null);
    for (const e of errors) if (e.blockId) w.getBlockById(e.blockId)?.setWarningText(e.message);
  }, [errors]);

  useEffect(() => {
    ws.current?.highlightBlock(activeBlockId ?? null);
  }, [activeBlockId]);

  return (
    <div
      ref={host}
      className="h-[42rem] max-h-[75vh] min-h-[28rem] w-full overflow-hidden rounded-lg border border-border"
      role="region"
      aria-label="Área de montagem dos blocos. O programa também aparece em texto na lista de passos."
    />
  );
}
