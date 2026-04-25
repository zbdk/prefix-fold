# プロジェクト構造

## アーキテクチャ

レイヤードアーキテクチャを採用。各層は明確な責務を持ち、依存方向は上位層→下位層の一方向。

```
presentation → application → domain
                    ↓
              infrastructure
```

## ディレクトリ構成

```
src/
├── domain/           # ドメイン層: 純粋関数・データ構造（VSCode API 非依存）
├── application/      # アプリケーション層: ユースケース・設定管理・ファイル監視
├── infrastructure/   # インフラ層: キャッシュ・デバウンサーなどの技術的関心事
├── presentation/     # プレゼンテーション層: TreeView データプロバイダ・ノード変換
├── extension.ts      # エントリポイント: 各層の初期化と接続
└── test/             # テスト: ソースと同じディレクトリ構造を反映
    ├── domain/
    ├── application/
    ├── infrastructure/
    └── presentation/
```

## 各層の責務

- **domain**: プレフィックス解析のコアロジック。`PrefixTrie`、`SegmentSplitter`、`GlobMatcher`、`PrefixAnalyzer` など。VSCode API に一切依存しない純粋関数・クラスで構成。
- **application**: VSCode の設定読み取り（`ConfigManager`）、ファイル変更監視（`FileWatcher`）、エクスプローラー連携（`ExplorerNavigator`）。
- **infrastructure**: キャッシュ管理（`CacheManager`）、デバウンス処理（`Debouncer`）。
- **presentation**: `TreeDataProvider` 実装（`PrefixTreeDataProvider`）、ドメインモデルから TreeView ノードへの変換（`TreeNodeConverter`）。

## 型定義

各層に `types.ts` を配置し、その層固有の型を定義する。ドメイン型（`PrefixGroup`、`TrieNode`、`AnalyzerConfig`）はドメイン層に、表示用型（`TreeNode`、`TreeNodeKind`）はプレゼンテーション層に配置。

## DI パターン

コンストラクタインジェクションを使用。`extension.ts` で各コンポーネントを生成し、依存を注入する。すべての Disposable は `context.subscriptions` に登録してリソースリークを防止する。
