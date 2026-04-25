import * as vscode from "vscode";
import { ConfigManager } from "./application/configManager";
import { CacheManager } from "./infrastructure/cacheManager";
import { Debouncer } from "./infrastructure/debouncer";
import { PrefixTreeDataProvider } from "./presentation/prefixTreeDataProvider";
import { FileWatcher } from "./application/fileWatcher";
import { ExplorerNavigator } from "./application/explorerNavigator";
import { TreeNode } from "./presentation/types";

/** デフォルトのデバウンス遅延（ミリ秒） */
const DEFAULT_DEBOUNCE_DELAY_MS = 300;

/**
 * 拡張機能のアクティベーション
 *
 * 各コンポーネントの初期化と接続を行い、
 * TreeView・コマンド・設定変更リスナーを登録する。
 * すべての Disposable を context.subscriptions に追加してリソースリークを防止する。
 *
 * 要件: 2.1, 3.4, 5.3
 */
export function activate(context: vscode.ExtensionContext): void {
  // 1. ConfigManager の初期化
  const configManager = new ConfigManager();

  // 2. CacheManager の初期化
  const cacheManager = new CacheManager();

  // 3. Debouncer の初期化（デフォルト300msの遅延）
  const debouncer = new Debouncer(DEFAULT_DEBOUNCE_DELAY_MS);

  // 4. PrefixTreeDataProvider の初期化（CacheManager と ConfigManager を注入）
  const dataProvider = new PrefixTreeDataProvider(cacheManager, configManager);

  // 5. TreeView の作成（showCollapseAll: true で「すべて折りたたむ」ボタンを表示）
  const treeView = vscode.window.createTreeView<TreeNode>("prefixFoldView", {
    treeDataProvider: dataProvider,
    showCollapseAll: true,
  });

  // 6. FileWatcher の初期化（Debouncer、CacheManager、PrefixTreeDataProvider を注入）
  const fileWatcher = new FileWatcher(debouncer, cacheManager, dataProvider);

  // 7. ExplorerNavigator の初期化と TreeView の設定
  const explorerNavigator = new ExplorerNavigator();
  explorerNavigator.setTreeView(treeView);

  // 8. コマンドの登録

  // 8a. prefixFold.showInPrefixFold: エクスプローラーからPrefixFoldへのナビゲーション（要件 7.1）
  const showInPrefixFoldCommand = vscode.commands.registerCommand(
    "prefixFold.showInPrefixFold",
    (uri: vscode.Uri) => {
      explorerNavigator.showInPrefixFold(uri);
    }
  );

  // 8b. prefixFold.revealInExplorer: PrefixFoldからエクスプローラーへのナビゲーション（要件 7.2, 7.3, 7.4）
  const revealInExplorerCommand = vscode.commands.registerCommand(
    "prefixFold.revealInExplorer",
    (node: TreeNode) => {
      explorerNavigator.revealInExplorer(node);
    }
  );

  // 8c. prefixFold.refresh: 手動リフレッシュコマンド（要件 5.3）
  const refreshCommand = vscode.commands.registerCommand(
    "prefixFold.refresh",
    () => {
      dataProvider.refresh();
    }
  );

  // 8d. prefixFold.collapseAll: すべて折りたたむコマンド（要件 3.4）
  // showCollapseAll: true により TreeView 組み込みの折りたたみボタンが提供されるが、
  // コマンドパレットからも実行できるようにコマンドを登録する
  const collapseAllCommand = vscode.commands.registerCommand(
    "prefixFold.collapseAll",
    () => {
      // TreeView 組み込みの折りたたみコマンドを実行する
      vscode.commands.executeCommand("workbench.actions.treeView.prefixFoldView.collapseAll");
    }
  );

  // 9. 設定変更時の TreeView 再描画を接続（要件 5.3）
  const configChangeDisposable = configManager.onDidChangeConfig(() => {
    dataProvider.refresh();
  });

  // 10. すべての Disposable を context.subscriptions に追加してリソースリークを防止する
  context.subscriptions.push(
    configManager,
    dataProvider,
    treeView,
    fileWatcher,
    explorerNavigator,
    showInPrefixFoldCommand,
    revealInExplorerCommand,
    refreshCommand,
    collapseAllCommand,
    configChangeDisposable
  );
}

/**
 * 拡張機能のディアクティベーション
 *
 * すべてのクリーンアップは Disposable パターンで処理されるため、
 * この関数は空で問題ない。
 */
export function deactivate(): void {
  // すべてのリソースは context.subscriptions の Disposable で解放される
}
