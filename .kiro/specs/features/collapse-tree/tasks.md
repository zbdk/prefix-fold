# 実装計画: collapse-tree (PrefixFold)

## 概要

VSCode拡張機能「PrefixFold」の実装計画。ファイル名の共通プレフィックスに基づいてファイルを仮想フォルダとしてグループ化し、TreeViewパネルで表示する機能を段階的に実装する。純粋なドメインロジック（プレフィックス解析）から始め、インフラ層（キャッシュ・デバウンス）、アプリケーション層（TreeDataProvider・設定管理）、プレゼンテーション層（TreeView・エクスプローラー連携）の順に構築する。

## タスク

- [-] 1. プロジェクト構造のセットアップとコアインターフェース定義
  - [-] 1.1 VSCode拡張機能プロジェクトの初期化
    - `package.json` を作成し、拡張機能のメタデータ、`activationEvents`、`contributes`（viewsContainers、views、configuration、commands、menus）を定義する
    - `tsconfig.json` を作成し、TypeScriptコンパイラ設定を行う
    - Vitest と fast-check をdev dependenciesとして追加し、テスト設定ファイル（`vitest.config.ts`）を作成する
    - ディレクトリ構造を作成する: `src/domain/`、`src/infrastructure/`、`src/application/`、`src/presentation/`、`src/test/`
    - _要件: 2.1, 5.1, 5.2, 5.5, 5.8_

  - [ ] 1.2 コアインターフェースと型定義の作成
    - `src/domain/types.ts` に `PrefixGroup`、`TrieNode`、`AnalyzerConfig` インターフェースを定義する
    - `src/presentation/types.ts` に `TreeNode`、`TreeNodeKind` enum を定義する
    - `src/application/types.ts` に `PrefixFoldConfig` インターフェースを定義する
    - _要件: 1.1, 1.2, 1.5, 2.2_

- [ ] 2. ドメイン層の実装: セグメント分割
  - [ ] 2.1 SegmentSplitter の実装
    - `src/domain/segmentSplitter.ts` に `split` 関数を実装する
    - 区切り文字リストに基づいてファイル名をセグメントに分割するロジックを実装する
    - キャメルケース境界での分割ロジックを実装する（`camelCaseSplit` オプション対応）
    - 区切り文字とキャメルケースの両方が有効な場合の統合分割ロジックを実装する
    - _要件: 5.6, 5.9, 5.10_

  - [ ] 2.2 SegmentSplitter のプロパティテスト
    - **Property 4: セグメント分割ラウンドトリップ**
    - 任意のファイル名と区切り文字リストに対して、分割したセグメントを再結合すると元のファイル名が復元されることを検証する
    - **検証対象: 要件 5.6, 5.9, 5.10**

  - [ ] 2.3 SegmentSplitter のユニットテスト
    - 具体例テスト: `aaa-bbbb-cccc` を `["-"]` で分割 → `["aaa", "bbbb", "cccc"]`
    - キャメルケーステスト: `AppCode` → `["App", "Code"]`
    - 区切り文字なしテスト: `filename` → `["filename"]`
    - 複数区切り文字テスト: `aaa-bbb.ccc` を `["-", "."]` で分割
    - _要件: 5.6, 5.9, 5.10_

- [ ] 3. ドメイン層の実装: PrefixTrie と PrefixAnalyzer
  - [ ] 3.1 PrefixTrie の実装
    - `src/domain/prefixTrie.ts` に `PrefixTrie` クラスを実装する
    - `insert` メソッド: セグメント列をTrieに挿入する
    - `buildGroups` メソッド: Trieから `PrefixGroup` ツリーを構築する（`minGroupSize` による閾値フィルタリング含む）
    - _要件: 1.1, 1.2, 1.3, 1.5_

  - [ ] 3.2 PrefixAnalyzer の実装
    - `src/domain/prefixAnalyzer.ts` に `analyze` 関数を実装する
    - SegmentSplitter と PrefixTrie を組み合わせてファイル名リストからプレフィックスグループツリーを構築する
    - 除外パターン（glob形式）によるフィルタリングを実装する
    - 空区切り文字時のグループ化無効化ロジックを実装する
    - _要件: 1.1, 1.2, 1.3, 1.4, 1.5, 5.7, 6.4_

  - [ ]* 3.3 PrefixAnalyzer のプロパティテスト: ファイル保存性
    - **Property 1: ファイル保存性（入力ファイルの完全な分類）**
    - 任意のファイル名リストに対して、すべてのプレフィックスグループに属するファイルとグループ化されなかったファイルの和集合が入力と一致することを検証する
    - **検証対象: 要件 1.1, 2.4**

  - [ ]* 3.4 PrefixAnalyzer のプロパティテスト: グループサイズ閾値
    - **Property 2: グループサイズ閾値**
    - 任意のファイル名リストと minGroupSize に対して、すべてのプレフィックスグループのファイル数が minGroupSize 以上であることを検証する
    - **検証対象: 要件 1.2, 1.3**

  - [ ]* 3.5 PrefixAnalyzer のプロパティテスト: 階層的プレフィックスの整合性
    - **Property 3: 階層的プレフィックスの整合性**
    - 任意のプレフィックスグループツリーにおいて、子グループのプレフィックスが親グループのプレフィックスで始まることを検証する
    - **検証対象: 要件 1.5**

  - [ ]* 3.6 PrefixAnalyzer のプロパティテスト: 空区切り文字時のグループ化無効化
    - **Property 7: 空区切り文字時のグループ化無効化**
    - 区切り文字が空配列かつキャメルケース無効の場合、プレフィックスグループが生成されないことを検証する
    - **検証対象: 要件 5.7, 1.4**

  - [ ]* 3.7 PrefixAnalyzer のプロパティテスト: 除外パターンによるフィルタリング
    - **Property 8: 除外パターンによるフィルタリング**
    - 除外パターンに一致するファイルが解析結果に含まれないことを検証する
    - **検証対象: 要件 6.4**

- [ ] 4. チェックポイント - ドメイン層の検証
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [ ] 5. インフラ層の実装: キャッシュとデバウンス
  - [ ] 5.1 CacheManager の実装
    - `src/infrastructure/cacheManager.ts` に `CacheManager` クラスを実装する
    - `get`、`set`、`invalidate`、`clear` メソッドを実装する
    - ディレクトリパスをキーとした `Map` ベースのキャッシュを実装する
    - _要件: 8.3_

  - [ ] 5.2 Debouncer の実装
    - `src/infrastructure/debouncer.ts` に `Debouncer` クラスを実装する
    - `debounce` メソッド: 指定ミリ秒のデバウンス付きでコールバックを実行する
    - `cancel` メソッド: 保留中のコールバックをキャンセルする
    - デフォルトのデバウンス遅延は300ミリ秒とする
    - _要件: 4.4_

  - [ ]* 5.3 CacheManager と Debouncer のユニットテスト
    - キャッシュヒット/ミスの動作確認
    - `invalidate` による特定ディレクトリのキャッシュ無効化確認
    - `clear` による全キャッシュクリア確認
    - デバウンスの遅延動作確認（300ms以内の連続呼び出しで最後の1回のみ実行）
    - デバウンスのキャンセル動作確認
    - _要件: 4.4, 8.3_

- [ ] 6. アプリケーション層の実装: 設定管理
  - [ ] 6.1 ConfigManager の実装
    - `src/application/configManager.ts` に `ConfigManager` クラスを実装する
    - `getConfig` メソッド: VSCodeの設定APIから `PrefixFoldConfig` を読み取る
    - `onDidChangeConfig` イベント: `vscode.workspace.onDidChangeConfiguration` を監視し、設定変更を通知する
    - 設定値のバリデーション: `minGroupSize` が1未満の場合はデフォルト値2にフォールバックし警告表示
    - _要件: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8_

  - [ ]* 6.2 ConfigManager のユニットテスト
    - デフォルト設定値の確認
    - `minGroupSize` が1未満の場合のフォールバック動作確認
    - 不正なglob除外パターンの処理確認
    - _要件: 5.4_

- [ ] 7. プレゼンテーション層の実装: TreeDataProvider
  - [ ] 7.1 TreeNode 変換ロジックの実装
    - `src/presentation/treeNodeConverter.ts` に `PrefixGroup` から `TreeNode` への変換ロジックを実装する
    - 仮想フォルダのラベルフォーマット: `{prefix} ({fileCount})`
    - ファイルのラベル: プレフィックス部分を除去した残りの文字列
    - アイコンの設定: 実フォルダと仮想フォルダを視覚的に区別する `ThemeIcon` を設定する
    - `collapsibleState` の設定: 仮想フォルダは `Collapsed`、ファイルは `None`
    - ファイルクリック時の `command` 設定: `vscode.open` コマンドを設定する
    - _要件: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_

  - [ ]* 7.2 TreeNode 変換ロジックのプロパティテスト: 仮想フォルダラベルフォーマット
    - **Property 5: 仮想フォルダラベルフォーマット**
    - 任意のプレフィックスグループに対して、仮想フォルダのラベルが `{prefix} ({fileCount})` 形式であることを検証する
    - **検証対象: 要件 2.2, 2.3**

  - [ ]* 7.3 TreeNode 変換ロジックのプロパティテスト: プレフィックス除去ラベル
    - **Property 6: プレフィックス除去ラベル**
    - 任意のプレフィックスグループ内のファイルに対して、ラベルがプレフィックス部分を除去した残りと一致することを検証する
    - **検証対象: 要件 3.2**

  - [ ]* 7.4 TreeNode 変換ロジックのユニットテスト
    - アイコン設定の確認（仮想フォルダ vs 実フォルダ）
    - `collapsibleState` の確認
    - ファイルクリック時の `command` 設定確認
    - グループ化されないファイルのルートレベル表示確認
    - _要件: 2.4, 2.5, 3.1, 3.3_

- [ ] 8. プレゼンテーション層の実装: PrefixTreeDataProvider
  - [ ] 8.1 PrefixTreeDataProvider の実装
    - `src/presentation/prefixTreeDataProvider.ts` に `PrefixTreeDataProvider` クラスを実装する
    - `getTreeItem` メソッド: `TreeNode` から `vscode.TreeItem` を生成する
    - `getChildren` メソッド: ルートまたは親ノードの子ノードを返す。CacheManager を利用してキャッシュヒット時は再解析を回避する
    - `onDidChangeTreeData` イベント: TreeView更新通知を発火する
    - `refresh` メソッド: キャッシュを無効化し `onDidChangeTreeData` を発火する
    - マルチルートワークスペース対応: 各ルートフォルダを個別の `WorkspaceRoot` ノードとして表示する
    - 大量ファイル（10000件超）時のプログレスインジケータ表示
    - _要件: 2.1, 2.4, 6.1, 6.2, 6.3, 8.1, 8.2_

  - [ ]* 8.2 PrefixTreeDataProvider のユニットテスト
    - マルチルートワークスペースでの動作確認
    - キャッシュヒット時の再解析回避確認
    - `refresh` 呼び出し時のキャッシュ無効化確認
    - _要件: 6.3, 8.3_

- [ ] 9. チェックポイント - プレゼンテーション層の検証
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [ ] 10. ファイルシステム監視の実装
  - [ ] 10.1 FileSystemWatcher の統合
    - `src/application/fileWatcher.ts` に FileSystemWatcher のセットアップロジックを実装する
    - `vscode.workspace.createFileSystemWatcher('**/*')` でワークスペース全体を監視する
    - ファイルの追加・削除・名前変更イベントを Debouncer 経由で PrefixTreeDataProvider の `refresh` に接続する
    - 変更されたファイルのディレクトリに対して CacheManager の `invalidate` を呼び出す
    - FileSystemWatcher 作成失敗時のフォールバック（手動リフレッシュのみ）を実装する
    - _要件: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 10.2 ファイルシステム監視のインテグレーションテスト
    - ファイル追加時のTreeView更新確認
    - ファイル削除時のTreeView更新確認
    - ファイル名前変更時のTreeView更新確認
    - デバウンスによる一括更新確認
    - _要件: 4.1, 4.2, 4.3, 4.4_

- [ ] 11. エクスプローラー連携の実装
  - [ ] 11.1 ExplorerNavigator の実装
    - `src/application/explorerNavigator.ts` に `ExplorerNavigator` クラスを実装する
    - `showInPrefixFold` コマンド: エクスプローラーのフォルダ右クリックから PrefixFold TreeView を開いて該当ディレクトリを表示する
    - `revealInExplorer` コマンド: PrefixFold TreeView のファイル/ディレクトリ/仮想フォルダ右クリックから標準エクスプローラーで表示する
    - 仮想フォルダの場合は所属する実ディレクトリの URI を使用する
    - _要件: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 11.2 エクスプローラー連携のインテグレーションテスト
    - エクスプローラーからPrefixFoldへのナビゲーション確認
    - PrefixFoldからエクスプローラーへのナビゲーション確認（ファイル、ディレクトリ、仮想フォルダ）
    - _要件: 7.1, 7.2, 7.3, 7.4_

- [ ] 12. 拡張機能エントリーポイントの統合
  - [ ] 12.1 extension.ts の実装
    - `src/extension.ts` に `activate` 関数と `deactivate` 関数を実装する
    - 各コンポーネント（ConfigManager、CacheManager、Debouncer、PrefixTreeDataProvider、FileWatcher、ExplorerNavigator）の初期化と接続を行う
    - TreeView の登録: `vscode.window.createTreeView('prefixFoldView', { treeDataProvider })` を呼び出す
    - コマンドの登録: `prefixFold.showInPrefixFold`、`prefixFold.revealInExplorer`、`prefixFold.refresh`（手動リフレッシュ）
    - 設定変更時の TreeView 再描画を ConfigManager の `onDidChangeConfig` イベントに接続する
    - すべての Disposable を `context.subscriptions` に追加してリソースリークを防止する
    - 「すべて折りたたむ」コマンドの登録
    - _要件: 2.1, 3.4, 5.3_

  - [ ]* 12.2 拡張機能全体のインテグレーションテスト
    - 拡張機能のアクティベーション確認
    - 設定変更時のTreeView再描画確認
    - 手動リフレッシュコマンドの動作確認
    - _要件: 5.3, 6.2_

- [ ] 13. 最終チェックポイント - 全体検証
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

## 備考

- `*` マーク付きのタスクはオプションであり、MVP実装時にはスキップ可能
- 各タスクは具体的な要件番号を参照しており、トレーサビリティを確保している
- チェックポイントでインクリメンタルな検証を行い、問題の早期発見を促進する
- プロパティテストは普遍的な正当性を検証し、ユニットテストは具体例とエッジケースを検証する
- ドメイン層は VSCode API に依存しない純粋関数として実装し、テスタビリティを確保する
