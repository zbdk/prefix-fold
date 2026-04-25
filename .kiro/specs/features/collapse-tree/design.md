# デザインドキュメント: collapse-tree

## 概要

PrefixFold拡張機能は、VSCodeのサイドバーに専用TreeViewパネルを提供し、ワークスペース内のファイルを名前の共通プレフィックスに基づいて仮想フォルダとしてグループ化・表示する。ユーザーはフォルダのように折りたたみ・展開操作を行い、大量のファイルの中から目的のファイルを素早く見つけることができる。

### 設計方針

1. **純粋なロジックとVSCode APIの分離**: プレフィックス解析ロジックはVSCode APIに依存しない純粋関数として実装し、テスタビリティを確保する
2. **Trieベースのプレフィックス解析**: ファイル名のセグメント（区切り文字で分割した部分）をTrieに挿入し、共通プレフィックスを効率的に検出する
3. **イベント駆動の更新**: FileSystemWatcherによるファイル変更検知とデバウンスによる効率的なTreeView更新
4. **キャッシュによるパフォーマンス最適化**: 解析結果をキャッシュし、変更がない場合は再解析を回避する

### リサーチ結果の要約

- **VSCode TreeView API**: `TreeDataProvider`インターフェースの`getChildren`と`getTreeItem`メソッドを実装することでカスタムTreeViewを構築できる。`onDidChangeTreeData`イベントでTreeViewの更新を通知する（[VSCode Tree View Guide](https://code.visualstudio.com/api/extension-guides/tree-view)）
- **FileSystemWatcher**: `vscode.workspace.createFileSystemWatcher`でglob パターンを指定してファイル変更を監視できる。`**/*`パターンでサブディレクトリも含めた監視が可能
- **Trieデータ構造**: プレフィックス検索に最適化されたツリー構造。ファイル名セグメントをノードとして挿入し、共通プレフィックスの検出を効率的に行える

## アーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│  VSCode拡張機能                                              │
│                                                             │
│  ┌──────────────────┐                                       │
│  │  Extension Entry  │                                       │
│  │  (extension.ts)   │                                       │
│  └──┬───────┬───────┘                                       │
│     │       │       │                                       │
│     ▼       ▼       ▼                                       │
│  ┌──────┐ ┌──────────────────────┐ ┌───────────────────┐   │
│  │Config│ │PrefixTreeDataProvider│ │FileSystemWatcher  │   │
│  │Mngr  │─▶                      │ │                   │   │
│  └──┬───┘ └──┬──────┬───────────┘ └────────┬──────────┘   │
│     │        │      │                       │              │
│     │        ▼      ▼                       ▼              │
│     │  ┌─────────┐ ┌────────────┐   ┌──────────┐          │
│     │  │Prefix   │ │Cache       │   │Debouncer │──▶ refresh│
│     │  │Analyzer │ │Manager     │   └──────────┘          │
│     │  └──┬──┬───┘ └────────────┘                          │
│     │     │  │                                              │
│     │     ▼  ▼                                              │
│     │  ┌──────┐ ┌────────────┐                              │
│     │  │Prefix│ │Segment     │                              │
│     │  │Trie  │ │Splitter    │                              │
│     │  └──────┘ └────────────┘                              │
│     │                                                       │
└─────┼───────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  VSCode API                         │
│  ┌────────┐ ┌─────────┐ ┌────────┐ │
│  │TreeView│ │Workspace│ │Config  │ │
│  │        │ │API      │ │API     │ │
│  └────────┘ └─────────┘ └────────┘ │
└─────────────────────────────────────┘
```

### レイヤー構成

| レイヤー | 責務 | VSCode API依存 |
|---------|------|---------------|
| **プレゼンテーション層** | TreeView表示、TreeItem生成 | あり |
| **アプリケーション層** | TreeDataProvider、ファイル監視、設定管理 | あり |
| **ドメイン層** | プレフィックス解析、Trie構築、セグメント分割 | なし |
| **インフラ層** | キャッシュ管理、デバウンス | なし |

## コンポーネントとインターフェース

### 1. Extension Entry (`extension.ts`)

拡張機能のエントリーポイント。各コンポーネントの初期化と接続を行う。

```typescript
// 拡張機能のアクティベーション
export function activate(context: vscode.ExtensionContext): void;
// 拡張機能のディアクティベーション
export function deactivate(): void;
```

### 2. PrefixTreeDataProvider

`vscode.TreeDataProvider<TreeNode>`を実装し、TreeViewにデータを供給する中心コンポーネント。

```typescript
interface PrefixTreeDataProvider extends vscode.TreeDataProvider<TreeNode> {
  // TreeDataProviderの必須メソッド
  getTreeItem(element: TreeNode): vscode.TreeItem;
  getChildren(element?: TreeNode): Thenable<TreeNode[]>;
  
  // TreeView更新通知
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void>;
  
  // 手動リフレッシュ
  refresh(): void;
}
```

### 3. PrefixAnalyzer（ドメイン層・純粋関数）

ファイル名リストからプレフィックスグループを解析する。VSCode APIに依存しない純粋関数群。

```typescript
interface PrefixAnalyzer {
  // ファイル名リストからプレフィックスグループツリーを構築
  analyze(fileNames: string[], config: AnalyzerConfig): PrefixGroup;
}

interface AnalyzerConfig {
  delimiters: string[];       // プレフィックス区切り文字
  minGroupSize: number;       // 最小グループサイズ
  camelCaseSplit: boolean;    // キャメルケース区切り有効/無効
  excludePatterns: string[];  // 除外パターン
}
```

### 4. PrefixTrie（ドメイン層・純粋データ構造）

ファイル名セグメントをTrieに格納し、共通プレフィックスの検出を行う。

```typescript
interface PrefixTrie {
  // セグメント列をTrieに挿入
  insert(segments: string[], fileName: string): void;
  // Trieからプレフィックスグループを構築
  buildGroups(minGroupSize: number): PrefixGroup;
}
```

### 5. SegmentSplitter（ドメイン層・純粋関数）

ファイル名を区切り文字とキャメルケース境界でセグメントに分割する。

```typescript
interface SegmentSplitter {
  // ファイル名をセグメントに分割
  split(fileName: string, delimiters: string[], camelCaseSplit: boolean): string[];
}
```

### 6. ConfigManager

VSCodeの設定APIから設定値を読み取り、変更を監視する。

```typescript
interface ConfigManager {
  // 現在の設定を取得
  getConfig(): PrefixFoldConfig;
  // 設定変更イベント
  readonly onDidChangeConfig: vscode.Event<PrefixFoldConfig>;
}

interface PrefixFoldConfig {
  delimiters: string[];
  minGroupSize: number;
  excludePatterns: string[];
  camelCaseSplit: boolean;
}
```

### 7. CacheManager（インフラ層）

ディレクトリごとの解析結果をキャッシュする。

```typescript
interface CacheManager {
  // キャッシュから取得（キャッシュミスの場合undefined）
  get(directoryPath: string): PrefixGroup | undefined;
  // キャッシュに保存
  set(directoryPath: string, group: PrefixGroup): void;
  // 特定ディレクトリのキャッシュを無効化
  invalidate(directoryPath: string): void;
  // 全キャッシュをクリア
  clear(): void;
}
```

### 8. Debouncer（インフラ層）

ファイルシステム変更イベントのデバウンス処理を行う。

```typescript
interface Debouncer {
  // デバウンス付きでコールバックを実行
  debounce(callback: () => void, delayMs: number): void;
  // 保留中のコールバックをキャンセル
  cancel(): void;
}
```

### 9. ExplorerNavigator（エクスプローラー連携）

VSCodeの標準エクスプローラーとPrefixFold TreeView間の相互ナビゲーションを提供する。

```typescript
interface ExplorerNavigator {
  // エクスプローラーからPrefixFoldへ: 指定ディレクトリをPrefixFoldで表示
  showInPrefixFold(directoryUri: vscode.Uri): void;
  // PrefixFoldからエクスプローラーへ: 指定リソースをエクスプローラーで表示
  revealInExplorer(resourceUri: vscode.Uri): void;
}
```

#### コマンド登録（package.json contributes.commands）

```json
{
  "commands": [
    {
      "command": "prefixFold.showInPrefixFold",
      "title": "PrefixFoldで表示"
    },
    {
      "command": "prefixFold.revealInExplorer",
      "title": "エクスプローラーで表示"
    }
  ]
}
```

#### コンテキストメニュー登録（package.json contributes.menus）

```json
{
  "menus": {
    "explorer/context": [
      {
        "command": "prefixFold.showInPrefixFold",
        "when": "explorerResourceIsFolder",
        "group": "navigation"
      }
    ],
    "view/item/context": [
      {
        "command": "prefixFold.revealInExplorer",
        "when": "view == prefixFoldView && viewItem =~ /^(file|directory|virtualFolder)$/",
        "group": "navigation"
      }
    ]
  }
}
```

#### 実装方針

- **エクスプローラー → PrefixFold**: `prefixFold.showInPrefixFold` コマンドで、PrefixFoldのTreeViewパネルをフォーカスし（`treeView.reveal()`）、対象ディレクトリのプレフィックスグループを表示する
- **PrefixFold → エクスプローラー**: `prefixFold.revealInExplorer` コマンドで、`vscode.commands.executeCommand('revealInExplorer', uri)` を呼び出し、標準エクスプローラーで該当リソースを表示する
- **仮想フォルダの場合**: 仮想フォルダが属する実ディレクトリのURIを使って `revealInExplorer` を実行する

### コンポーネント間の相互作用

```
[TreeView展開時のフロー]

ユーザー ──▶ TreeView ──▶ PrefixTreeDataProvider
                              │
                              ├──▶ CacheManager.get(directoryPath)
                              │       │
                              │       ├─ キャッシュヒット ──▶ PrefixGroup を返却
                              │       │
                              │       └─ キャッシュミス
                              │              │
                              │              ▼
                              │         PrefixAnalyzer.analyze(fileNames, config)
                              │              │
                              │              ▼
                              │         CacheManager.set(directoryPath, group)
                              │
                              ▼
                         TreeNode[] を TreeView に返却
                              │
                              ▼
                         ユーザーにツリー表示


[ファイル変更時のフロー]

FileSystemWatcher ──▶ Debouncer (300ms待機)
                          │
                          ▼
                     PrefixTreeDataProvider.refresh()
                          │
                          ├──▶ CacheManager.invalidate(directoryPath)
                          │
                          └──▶ onDidChangeTreeData 発火 ──▶ TreeView 再描画
```

## データモデル

### TreeNode

TreeViewに表示される各ノードを表現する。仮想フォルダとファイルの両方を表現できる。

```typescript
// TreeViewノードの種別
enum TreeNodeKind {
  VirtualFolder = "virtualFolder",  // 仮想フォルダ（プレフィックスグループ）
  File = "file",                     // 実ファイル
  Directory = "directory",           // 実ディレクトリ
  WorkspaceRoot = "workspaceRoot",   // ワークスペースルート
}

interface TreeNode {
  kind: TreeNodeKind;
  label: string;              // 表示ラベル
  resourceUri?: vscode.Uri;   // ファイルの場合のURI
  prefix?: string;            // 仮想フォルダの場合のプレフィックス文字列
  directoryPath: string;      // 所属ディレクトリのパス
  children?: TreeNode[];      // 子ノード（遅延ロード可能）
  fileCount?: number;         // 仮想フォルダの場合のファイル数
}
```

### PrefixGroup

プレフィックス解析の結果を表現するドメインモデル。VSCode APIに依存しない。

```typescript
interface PrefixGroup {
  prefix: string;                // 共通プレフィックス（例: "aaa-"）
  files: string[];               // このグループに直接属するファイル名
  children: PrefixGroup[];       // サブプレフィックスグループ（階層構造）
  ungroupedFiles: string[];      // グループ化されなかったファイル名
}
```

### TrieNode

Trieの内部ノード。プレフィックス解析のための中間データ構造。

```typescript
interface TrieNode {
  segment: string;                        // このノードのセグメント文字列
  children: Map<string, TrieNode>;        // 子ノード（セグメント → TrieNode）
  fileNames: string[];                    // このノードで終端するファイル名
}
```

### PrefixFoldConfig

拡張機能の設定を表現する。

```typescript
interface PrefixFoldConfig {
  delimiters: string[];        // プレフィックス区切り文字（デフォルト: ["-"]）
  minGroupSize: number;        // 最小グループサイズ（デフォルト: 2）
  excludePatterns: string[];   // 除外パターン（glob形式、デフォルト: []）
  camelCaseSplit: boolean;     // キャメルケース区切り（デフォルト: false）
}
```

### VSCode設定スキーマ（package.json contributes.configuration）

```json
{
  "prefixFold.delimiters": {
    "type": "array",
    "items": { "type": "string" },
    "default": ["-"],
    "description": "プレフィックス区切り文字の配列"
  },
  "prefixFold.minGroupSize": {
    "type": "number",
    "default": 2,
    "minimum": 1,
    "description": "プレフィックスグループとして表示する最小ファイル数"
  },
  "prefixFold.excludePatterns": {
    "type": "array",
    "items": { "type": "string" },
    "default": [],
    "description": "解析対象外とするファイル/ディレクトリのglobパターン"
  },
  "prefixFold.camelCaseSplit": {
    "type": "boolean",
    "default": false,
    "description": "キャメルケース境界を区切りポイントとして使用する"
  }
}
```


## 正当性プロパティ

*プロパティとは、システムのすべての有効な実行において成立すべき特性や振る舞いのことであり、人間が読める仕様と機械的に検証可能な正当性保証の橋渡しとなる形式的な記述である。*

### Property 1: ファイル保存性（入力ファイルの完全な分類）

*任意の*ファイル名リストと有効な設定に対して、プレフィックス解析の結果において、すべてのプレフィックスグループに属するファイルとグループ化されなかったファイルの和集合は、入力ファイル名リストと完全に一致する（ファイルの欠落も重複もない）。

**Validates: Requirements 1.1, 2.4**

### Property 2: グループサイズ閾値

*任意の*ファイル名リストと最小グループサイズ（minGroupSize ≥ 2）に対して、プレフィックス解析が生成するすべてのプレフィックスグループは、直接属するファイル数とサブグループに属するファイル数の合計がminGroupSize以上である。

**Validates: Requirements 1.2, 1.3**

### Property 3: 階層的プレフィックスの整合性

*任意の*プレフィックスグループツリーにおいて、子グループのプレフィックスは親グループのプレフィックスで始まり（親プレフィックスが子プレフィックスの真のプレフィックスである）、かつ子グループに属するすべてのファイル名は子グループのプレフィックスで始まる。

**Validates: Requirements 1.5**

### Property 4: セグメント分割ラウンドトリップ

*任意の*ファイル名と区切り文字リストとキャメルケース設定に対して、SegmentSplitterで分割したセグメントを区切り文字で再結合すると、元のファイル名が復元される。

**Validates: Requirements 5.6, 5.9, 5.10**

### Property 5: 仮想フォルダラベルフォーマット

*任意の*プレフィックスグループに対して、対応する仮想フォルダTreeNodeのラベルは「{prefix} ({fileCount})」の形式であり、prefixはグループの共通プレフィックス、fileCountはグループ内の総ファイル数と一致する。

**Validates: Requirements 2.2, 2.3**

### Property 6: プレフィックス除去ラベル

*任意の*プレフィックスグループ内のファイルに対して、展開時に表示されるファイルのラベルは、元のファイル名からグループのプレフィックス部分を除去した残りの文字列と一致する。

**Validates: Requirements 3.2**

### Property 7: 空区切り文字時のグループ化無効化

*任意の*ファイル名リストに対して、区切り文字が空配列かつキャメルケース区切りが無効の場合、プレフィックス解析はプレフィックスグループを一切生成せず、すべてのファイルをグループ化されていない状態で返す。

**Validates: Requirements 5.7, 1.4**

### Property 8: 除外パターンによるフィルタリング

*任意の*ファイル名リストと除外パターンに対して、除外パターンに一致するファイルはプレフィックス解析の結果（グループ化されたファイルおよびグループ化されなかったファイルの両方）に含まれない。

**Validates: Requirements 6.4**

## エラーハンドリング

### 設定値のバリデーション

| エラー条件 | 対処 | 要件 |
|-----------|------|------|
| minGroupSizeが1未満 | デフォルト値2にフォールバック、警告メッセージ表示 | 5.4 |
| 区切り文字が空配列 | プレフィックス解析を無効化（キャメルケース有効時はキャメルケースのみで解析） | 5.7 |
| 除外パターンが不正なglob | 該当パターンを無視し、警告メッセージを表示 | 5.5 |

### ファイルシステムエラー

| エラー条件 | 対処 |
|-----------|------|
| ディレクトリ読み取り権限なし | エラーメッセージをTreeViewに表示し、該当ディレクトリをスキップ |
| ワークスペースが未オープン | TreeViewに「ワークスペースを開いてください」メッセージを表示 |
| FileSystemWatcherの作成失敗 | 手動リフレッシュのみで動作するフォールバックモード |

### パフォーマンス関連

| 条件 | 対処 | 要件 |
|------|------|------|
| ファイル数10000件超 | `vscode.window.withProgress`でプログレスインジケータ表示、バックグラウンド解析 | 8.2 |
| 解析タイムアウト（5秒超） | 解析を中断し、部分的な結果を表示、警告メッセージ表示 | - |

## テスト戦略

### テストフレームワーク

- **ユニットテスト / プロパティテスト**: [Vitest](https://vitest.dev/) + [fast-check](https://fast-check.dev/)
- **インテグレーションテスト**: `@vscode/test-electron` を使用したVSCode拡張機能テスト
- **言語**: TypeScript

### デュアルテストアプローチ

本機能では、ユニットテスト（具体例・エッジケース）とプロパティベーステスト（普遍的性質の検証）を組み合わせて包括的なカバレッジを実現する。

#### プロパティベーステスト（PBT）

プレフィックス解析ロジック（ドメイン層）は純粋関数として実装されるため、PBTに最適である。

- **対象**: PrefixAnalyzer、SegmentSplitter、PrefixTrie、ラベル生成ロジック
- **ライブラリ**: fast-check
- **最小イテレーション数**: 各プロパティテストにつき100回以上
- **タグフォーマット**: `Feature: collapse-tree, Property {number}: {property_text}`

各正当性プロパティ（Property 1〜8）に対して1つのプロパティベーステストを実装する。

#### ユニットテスト（具体例・エッジケース）

- **対象**: 設定バリデーション、TreeNode変換、デバウンス動作、キャッシュ動作
- **具体例テスト**:
  - 要件の具体例（`aaa-aaaa-aaaa`、`aaa-bbbb-cccc`等）での動作確認
  - アイコン設定の確認（要件2.5）
  - collapsibleState設定の確認（要件3.1）
  - ファイルクリック時のcommand設定確認（要件3.3）
  - デバウンス動作の確認（要件4.4）
  - キャッシュヒット/ミスの確認（要件8.3）
  - マルチルートワークスペース対応（要件6.3）

#### インテグレーションテスト

- **対象**: FileSystemWatcher連携、設定変更イベント、VSCode API連携、エクスプローラー連携
- **テスト内容**:
  - ファイル追加/削除/名前変更時のTreeView更新（要件4.1〜4.3）
  - 設定変更時のTreeView再描画（要件5.3）
  - エクスプローラーからPrefixFoldへのナビゲーション（要件7.1）
  - PrefixFoldからエクスプローラーへのナビゲーション（要件7.2〜7.4）
  - パフォーマンス要件の確認（要件8.1〜8.2）

### テスト対象の分類まとめ

| 分類 | 要件 | テスト手法 |
|------|------|-----------|
| PROPERTY | 1.1, 1.2, 1.3, 1.5, 2.2, 2.3, 2.4, 3.2, 5.6, 5.7, 5.9, 5.10, 6.4 | プロパティベーステスト（fast-check） |
| EXAMPLE | 2.5, 3.1, 4.4, 6.1, 6.3, 8.3 | ユニットテスト（具体例） |
| EDGE_CASE | 1.4, 5.4 | ユニットテスト（エッジケース）※ PBTジェネレータでもカバー |
| INTEGRATION | 3.3, 3.5, 4.1, 4.2, 4.3, 5.3, 6.2, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2 | インテグレーションテスト |
| SMOKE | 2.1, 3.4, 5.1, 5.2, 5.5, 5.8 | スモークテスト（設定・コマンド登録確認） |
