/**
 * FileWatcher: ファイルシステム変更の監視と TreeView 更新の統合
 *
 * FileSystemWatcher を使用してワークスペース全体のファイル変更を監視し、
 * Debouncer 経由で PrefixTreeDataProvider の refresh を呼び出す。
 * 変更されたファイルのディレクトリに対して CacheManager の invalidate を実行する。
 * FileSystemWatcher 作成失敗時は手動リフレッシュのみで動作するフォールバックモードとなる。
 *
 * 要件: 4.1, 4.2, 4.3, 4.4
 */

import * as vscode from "vscode";
import * as path from "path";
import { Debouncer } from "../infrastructure/debouncer";
import { CacheManager } from "../infrastructure/cacheManager";
import { PrefixTreeDataProvider } from "../presentation/prefixTreeDataProvider";

export class FileWatcher implements vscode.Disposable {
  /** FileSystemWatcher インスタンス（作成失敗時は undefined） */
  private watcher: vscode.FileSystemWatcher | undefined;

  /** リソース解放用の Disposable 配列 */
  private readonly disposables: vscode.Disposable[] = [];

  /** フォールバックモードかどうか（FileSystemWatcher 作成失敗時に true） */
  private readonly fallbackMode: boolean;

  constructor(
    private readonly debouncer: Debouncer,
    private readonly cacheManager: CacheManager,
    private readonly dataProvider: PrefixTreeDataProvider
  ) {
    this.fallbackMode = !this.initializeWatcher();
  }

  /**
   * FileSystemWatcher を初期化し、イベントリスナーを登録する
   *
   * @returns 初期化成功時は true、失敗時は false
   */
  private initializeWatcher(): boolean {
    try {
      this.watcher = vscode.workspace.createFileSystemWatcher("**/*");

      // ファイル追加イベント（要件 4.1）
      const onCreateDisposable = this.watcher.onDidCreate((uri) => {
        this.handleFileChange(uri);
      });

      // ファイル削除イベント（要件 4.2）
      const onDeleteDisposable = this.watcher.onDidDelete((uri) => {
        this.handleFileChange(uri);
      });

      // ファイル変更イベント（名前変更はVSCodeでは削除+作成として検知される）（要件 4.3）
      const onChangeDisposable = this.watcher.onDidChange((uri) => {
        this.handleFileChange(uri);
      });

      this.disposables.push(
        this.watcher,
        onCreateDisposable,
        onDeleteDisposable,
        onChangeDisposable
      );

      return true;
    } catch {
      // FileSystemWatcher 作成失敗時はフォールバックモード（手動リフレッシュのみ）
      vscode.window.showWarningMessage(
        "PrefixFold: ファイル監視の初期化に失敗しました。手動リフレッシュをご利用ください。"
      );
      return false;
    }
  }

  /**
   * ファイル変更イベントを処理する
   *
   * 変更されたファイルのディレクトリキャッシュを無効化し、
   * Debouncer 経由で TreeView の更新をスケジュールする。
   *
   * @param uri - 変更されたファイルの URI
   */
  private handleFileChange(uri: vscode.Uri): void {
    // 変更されたファイルのディレクトリパスを取得
    const directoryPath = path.dirname(uri.fsPath);

    // 該当ディレクトリのキャッシュを無効化
    this.cacheManager.invalidate(directoryPath);

    // デバウンス経由で TreeView を更新（要件 4.4: 300ms デバウンス）
    this.debouncer.debounce(() => {
      this.dataProvider.refresh();
    });
  }

  /**
   * フォールバックモードかどうかを返す
   *
   * @returns フォールバックモード（手動リフレッシュのみ）の場合 true
   */
  isFallbackMode(): boolean {
    return this.fallbackMode;
  }

  /**
   * リソースを解放する
   */
  dispose(): void {
    this.debouncer.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}
