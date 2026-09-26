import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pose } from '@/lib/types';
import { useLibrary } from './library';
import { MAX_SAMPLES, useRecorder } from './recorderStore';

const pose = (x: number): Pose => ({ x, y: 0, z: 530, roll: 0, pitch: 0, yaw: 0 });

describe('gravador', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLibrary.setState({ items: [], activeId: null });
  });
  afterEach(() => {
    useRecorder.getState().stop();
    vi.useRealTimers();
  });

  it('amostra a 20 Hz a pose mais recente, inclusive pausas', () => {
    const r = useRecorder.getState();
    r.start();
    r.capture(pose(0));
    vi.advanceTimersByTime(1000);
    expect(useRecorder.getState().samples).toBe(20);
    r.capture(pose(10));
    vi.advanceTimersByTime(1000);
    expect(useRecorder.getState().samples).toBe(40);
  });

  it('ao parar, simplifica e salva na biblioteca como gravação aberta', () => {
    const r = useRecorder.getState();
    r.start();
    for (let i = 0; i < 40; i++) {
      r.capture(pose(i < 20 ? 0 : 15));
      vi.advanceTimersByTime(50);
    }
    const rec = useRecorder.getState().stop('teste')!;
    expect(rec.name).toBe('teste');
    expect(rec.keys.length).toBeLessThan(10);
    expect(rec.keys[0].t).toBe(0);
    expect(useLibrary.getState().activeId).toBe(rec.id);
    expect(useRecorder.getState().status).toBe('idle');
  });

  it('para sozinho no limite de tamanho', () => {
    const r = useRecorder.getState();
    r.start();
    r.capture(pose(1));
    vi.advanceTimersByTime(MAX_SAMPLES * 50 + 500);
    expect(useRecorder.getState().status).toBe('idle');
    expect(useRecorder.getState().truncated).toBe(true);
  });

  it('sem nenhuma pose não cria gravação', () => {
    useRecorder.getState().start();
    vi.advanceTimersByTime(500);
    expect(useRecorder.getState().stop()).toBeNull();
  });
});
