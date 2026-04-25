/**
 * Debouncer: ファイルシステム変更イベントのデバウンス処理
 *
 * 短時間に連続して発生するイベントをまとめ、
 * 最後のイベントから指定ミリ秒後にコールバックを1回だけ実行する。
 * 要件: 4.4
 */

/** デフォルトのデバウンス遅延（ミリ秒） */
const DEFAULT_DELAY_MS = 300;

export class Debouncer {
  /** 保留中のタイマーID */
  private timerId: ReturnType<typeof setTimeout> | undefined;

  /** デフォルトのデバウンス遅延（ミリ秒） */
  private readonly defaultDelayMs: number;

  /**
   * @param defaultDelayMs - デフォルトのデバウンス遅延（ミリ秒）。省略時は300ms
   */
  constructor(defaultDelayMs: number = DEFAULT_DELAY_MS) {
    this.defaultDelayMs = defaultDelayMs;
  }

  /**
   * デバウンス付きでコールバックを実行する
   *
   * 前回の呼び出しから delayMs 以内に再度呼び出された場合、
   * 前回のコールバックはキャンセルされ、新しいコールバックが遅延実行される。
   *
   * @param callback - 遅延実行するコールバック関数
   * @param delayMs - デバウンス遅延（ミリ秒）。省略時はコンストラクタで指定したデフォルト値
   */
  debounce(callback: () => void, delayMs?: number): void {
    // 保留中のコールバックがあればキャンセル
    this.cancel();

    const delay = delayMs ?? this.defaultDelayMs;
    this.timerId = setTimeout(() => {
      this.timerId = undefined;
      callback();
    }, delay);
  }

  /**
   * 保留中のコールバックをキャンセルする
   */
  cancel(): void {
    if (this.timerId !== undefined) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }
}
