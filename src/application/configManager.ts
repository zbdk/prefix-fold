/**
 * ConfigManager: VSCodeの設定APIから設定値を読み取り、変更を監視する
 *
 * 要件: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8
 */

import * as vscode from "vscode";
import { PrefixFoldConfig } from "./types";

/** 設定セクション名 */
const CONFIG_SECTION = "prefixFold";

/** デフォルト設定値 */
const DEFAULT_CONFIG: PrefixFoldConfig = {
  delimiters: ["-"],
  minGroupSize: 2,
  excludePatterns: [],
  camelCaseSplit: false,
};

/**
 * VSCodeの設定APIからPrefixFoldの設定を管理するクラス
 */
export class ConfigManager implements vscode.Disposable {
  private readonly _onDidChangeConfig = new vscode.EventEmitter<PrefixFoldConfig>();

  /** 設定変更イベント */
  readonly onDidChangeConfig: vscode.Event<PrefixFoldConfig> = this._onDidChangeConfig.event;

  private readonly _disposable: vscode.Disposable;

  constructor() {
    // VSCodeの設定変更を監視し、prefixFoldセクションの変更時にイベントを発火する
    this._disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        const config = this.getConfig();
        this._onDidChangeConfig.fire(config);
      }
    });
  }

  /**
   * 現在の設定を取得する
   *
   * VSCodeの設定APIから値を読み取り、バリデーションを適用する。
   * minGroupSizeが1未満の場合はデフォルト値2にフォールバックし警告を表示する。
   */
  getConfig(): PrefixFoldConfig {
    const vsConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);

    const delimiters = vsConfig.get<string[]>("delimiters", DEFAULT_CONFIG.delimiters);
    let minGroupSize = vsConfig.get<number>("minGroupSize", DEFAULT_CONFIG.minGroupSize);
    const excludePatterns = vsConfig.get<string[]>("excludePatterns", DEFAULT_CONFIG.excludePatterns);
    const camelCaseSplit = vsConfig.get<boolean>("camelCaseSplit", DEFAULT_CONFIG.camelCaseSplit);

    // minGroupSizeのバリデーション: 1未満の場合はデフォルト値にフォールバック
    if (minGroupSize < 1) {
      vscode.window.showWarningMessage(
        "PrefixFold: 最小グループサイズに1未満の値が設定されています。デフォルト値の2を使用します。"
      );
      minGroupSize = DEFAULT_CONFIG.minGroupSize;
    }

    return {
      delimiters,
      minGroupSize,
      excludePatterns,
      camelCaseSplit,
    };
  }

  dispose(): void {
    this._onDidChangeConfig.dispose();
    this._disposable.dispose();
  }
}
