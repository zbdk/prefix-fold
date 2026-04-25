/**
 * CacheManager: ディレクトリごとのプレフィックス解析結果をキャッシュする
 *
 * Mapベースのインメモリキャッシュを提供し、
 * ファイルシステムに変更がない場合の再解析を回避する。
 * 要件: 8.3
 */

import { PrefixGroup } from "../domain/types";

export class CacheManager {
  /** ディレクトリパスをキーとしたキャッシュストア */
  private readonly cache: Map<string, PrefixGroup> = new Map();

  /**
   * キャッシュから解析結果を取得する
   * @param directoryPath - ディレクトリパス
   * @returns キャッシュヒット時は PrefixGroup、ミス時は undefined
   */
  get(directoryPath: string): PrefixGroup | undefined {
    return this.cache.get(directoryPath);
  }

  /**
   * 解析結果をキャッシュに保存する
   * @param directoryPath - ディレクトリパス
   * @param group - プレフィックスグループの解析結果
   */
  set(directoryPath: string, group: PrefixGroup): void {
    this.cache.set(directoryPath, group);
  }

  /**
   * 特定ディレクトリのキャッシュを無効化する
   * @param directoryPath - 無効化するディレクトリパス
   */
  invalidate(directoryPath: string): void {
    this.cache.delete(directoryPath);
  }

  /**
   * 全キャッシュをクリアする
   */
  clear(): void {
    this.cache.clear();
  }
}
