/**
 * Debouncer ユニットテスト
 *
 * デバウンスの遅延動作とキャンセル動作を検証する。
 * 検証対象: 要件 4.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Debouncer } from "../../infrastructure/debouncer";

describe("Debouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("debounce", () => {
    it("指定遅延後にコールバックが実行される", () => {
      const debouncer = new Debouncer();
      const callback = vi.fn();

      debouncer.debounce(callback, 300);

      // 遅延前は実行されない
      expect(callback).not.toHaveBeenCalled();

      // 300ms経過後に実行される
      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("デフォルト遅延（300ms）が使用される", () => {
      const debouncer = new Debouncer();
      const callback = vi.fn();

      debouncer.debounce(callback);

      vi.advanceTimersByTime(299);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("コンストラクタで指定したデフォルト遅延が使用される", () => {
      const debouncer = new Debouncer(500);
      const callback = vi.fn();

      debouncer.debounce(callback);

      vi.advanceTimersByTime(499);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("連続呼び出しで最後の1回のみ実行される", () => {
      const debouncer = new Debouncer();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      // 100ms間隔で3回呼び出し
      debouncer.debounce(callback1, 300);
      vi.advanceTimersByTime(100);

      debouncer.debounce(callback2, 300);
      vi.advanceTimersByTime(100);

      debouncer.debounce(callback3, 300);

      // 最後の呼び出しから300ms経過
      vi.advanceTimersByTime(300);

      // 最初の2つはキャンセルされ、最後の1つだけ実行される
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).toHaveBeenCalledTimes(1);
    });

    it("遅延時間内の再呼び出しでタイマーがリセットされる", () => {
      const debouncer = new Debouncer();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      debouncer.debounce(callback1, 300);

      // 200ms後に再呼び出し（まだ300ms経過していない）
      vi.advanceTimersByTime(200);
      debouncer.debounce(callback2, 300);

      // 最初の呼び出しから300ms経過しても callback1 は実行されない
      vi.advanceTimersByTime(100);
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();

      // 2回目の呼び出しから300ms経過で callback2 が実行される
      vi.advanceTimersByTime(200);
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("遅延完了後に再度 debounce できる", () => {
      const debouncer = new Debouncer();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // 1回目
      debouncer.debounce(callback1, 300);
      vi.advanceTimersByTime(300);
      expect(callback1).toHaveBeenCalledTimes(1);

      // 2回目
      debouncer.debounce(callback2, 300);
      vi.advanceTimersByTime(300);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancel", () => {
    it("保留中のコールバックをキャンセルする", () => {
      const debouncer = new Debouncer();
      const callback = vi.fn();

      debouncer.debounce(callback, 300);

      // キャンセル
      debouncer.cancel();

      // 300ms経過してもコールバックは実行されない
      vi.advanceTimersByTime(300);
      expect(callback).not.toHaveBeenCalled();
    });

    it("保留中のコールバックがない状態で cancel してもエラーにならない", () => {
      const debouncer = new Debouncer();
      expect(() => debouncer.cancel()).not.toThrow();
    });

    it("キャンセル後に新しい debounce を登録できる", () => {
      const debouncer = new Debouncer();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      debouncer.debounce(callback1, 300);
      debouncer.cancel();

      debouncer.debounce(callback2, 300);
      vi.advanceTimersByTime(300);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("既に実行済みのコールバックに対して cancel しても影響なし", () => {
      const debouncer = new Debouncer();
      const callback = vi.fn();

      debouncer.debounce(callback, 300);
      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(1);

      // 実行済みの後に cancel しても問題なし
      expect(() => debouncer.cancel()).not.toThrow();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
