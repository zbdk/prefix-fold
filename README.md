# PrefixFold

ファイル名の共通プレフィックスを解析し、仮想フォルダとしてグループ化して TreeView パネルに表示する VSCode 拡張機能です。

![VSCode](https://img.shields.io/badge/VSCode-%3E%3D1.85.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-%5E5.3.0-blue)

## 概要

プロジェクト内に `api-users.ts`、`api-posts.ts`、`api-comments.ts` のように共通プレフィックスを持つファイルが多数ある場合、エクスプローラーが煩雑になりがちです。PrefixFold はこれらのファイルを自動的に検出し、仮想フォルダ `api` としてグループ化して表示します。

**Before（通常のエクスプローラー）:**

```
├── api-comments.ts
├── api-posts.ts
├── api-users.ts
├── auth-login.ts
├── auth-logout.ts
├── auth-register.ts
├── config.ts
├── db-connection.ts
├── db-migration.ts
└── utils.ts
```

**After（PrefixFold TreeView）:**

```
├── 📁 api (3 files)
│   ├── api-comments.ts
│   ├── api-posts.ts
│   └── api-users.ts
├── 📁 auth (3 files)
│   ├── auth-login.ts
│   ├── auth-logout.ts
│   └── auth-register.ts
├── 📁 db (2 files)
│   ├── db-connection.ts
│   └── db-migration.ts
├── config.ts
└── utils.ts
```

## 機能

- **共通プレフィックス検出**: 区切り文字（ハイフン、ドットなど）やキャメルケース境界でファイル名を分割し、共通プレフィックスを検出
- **仮想フォルダ表示**: 共通プレフィックスを持つファイル群を階層的な仮想フォルダとして TreeView に表示
- **双方向ナビゲーション**: PrefixFold ↔ エクスプローラー間の相互ナビゲーション
- **自動リフレッシュ**: 設定変更やファイル変更時にデバウンス付きで自動更新
- **glob パターン除外**: 不要なファイルを glob パターンで除外可能
- **すべて折りたたむ**: TreeView のノードを一括で折りたたむ機能

## インストール

> **注意**: 現在開発中のため、マーケットプレイスには公開されていません。

ソースからビルドする場合:

```bash
git clone <repository-url>
cd prefix-fold
npm install
npm run compile
```

VSCode の「拡張機能の開発ホスト」で実行するか、`.vsix` ファイルにパッケージングしてインストールしてください。

## 設定

`settings.json` で以下の設定を変更できます。

| 設定項目 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `prefixFold.delimiters` | `string[]` | `["-"]` | プレフィックス区切り文字の配列 |
| `prefixFold.minGroupSize` | `number` | `2` | グループとして表示する最小ファイル数 |
| `prefixFold.excludePatterns` | `string[]` | `[]` | 除外する glob パターン |
| `prefixFold.camelCaseSplit` | `boolean` | `false` | キャメルケース境界での分割を有効にする |

### 設定例

```jsonc
{
  // ハイフンとドットを区切り文字として使用
  "prefixFold.delimiters": ["-", "."],

  // 3ファイル以上でグループ化
  "prefixFold.minGroupSize": 3,

  // テストファイルと設定ファイルを除外
  "prefixFold.excludePatterns": ["*.test.ts", "*.config.*"],

  // キャメルケース境界でも分割
  "prefixFold.camelCaseSplit": true
}
```

## コマンド

| コマンド | 説明 |
|---|---|
| `PrefixFold: 更新` | TreeView を手動で更新 |
| `PrefixFold: すべて折りたたむ` | TreeView のすべてのノードを折りたたむ |
| `PrefixFoldで表示` | エクスプローラーで選択したフォルダを PrefixFold で表示（右クリックメニュー） |
| `エクスプローラーで表示` | PrefixFold のノードをエクスプローラーで表示（右クリックメニュー） |

## 開発

### 前提条件

- Node.js
- npm

### セットアップ

```bash
npm install
```

### よく使うコマンド

| コマンド | 説明 |
|---|---|
| `npm run compile` | TypeScript コンパイル |
| `npm test` | テスト実行（Vitest） |
| `npm run lint` | ESLint 実行 |
| `npm run watch` | ファイル変更時に自動コンパイル |

### アーキテクチャ

レイヤードアーキテクチャを採用しています。各層は明確な責務を持ち、依存方向は上位層から下位層への一方向です。

```
presentation → application → domain
                    ↓
              infrastructure
```

```
src/
├── domain/           # ドメイン層: 純粋関数・データ構造（VSCode API 非依存）
├── application/      # アプリケーション層: 設定管理・ファイル監視・エクスプローラー連携
├── infrastructure/   # インフラ層: キャッシュ・デバウンサー
├── presentation/     # プレゼンテーション層: TreeView データプロバイダ・ノード変換
├── extension.ts      # エントリポイント
└── test/             # テスト（ソースと同じディレクトリ構造）
```

### テスト

テストには [Vitest](https://vitest.dev/) を使用し、プロパティベーステストには [fast-check](https://fast-check.dev/) を使用しています。

| パターン | 用途 |
|---|---|
| `*.unit.test.ts` | ユニットテスト |
| `*.integration.test.ts` | 統合テスト |
| `*.property.test.ts` | プロパティベーステスト |

## ライセンス

このプロジェクトのライセンスについては、リポジトリのライセンスファイルを参照してください。
