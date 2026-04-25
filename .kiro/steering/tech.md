# 技術スタック

## ランタイム・フレームワーク

- **VSCode Extension API** (`@types/vscode ^1.85.0`)
- **TypeScript** `^5.3.0`（strict モード）
- **Node.js**（ターゲット: ES2022、モジュール: CommonJS）

## ビルド

- TypeScript コンパイラ (`tsc`) で `src/` → `out/` にトランスパイル
- `tsconfig.json` で `strict: true`、`sourceMap: true`、`declaration: true` を有効化

## テスト

- **Vitest** `^1.2.0` — テストランナー（`globals: true`、`environment: node`）
- **fast-check** `^3.15.0` — プロパティベーステスト（PBT）

## よく使うコマンド

| コマンド | 説明 |
|---|---|
| `npm run compile` | TypeScript コンパイル |
| `npm test` | テスト実行（`vitest run`） |
| `npm run lint` | ESLint 実行 |

## テストの命名規則

テストファイルは `src/test/` 配下に、ソースと同じディレクトリ構造で配置する。

| パターン | 用途 |
|---|---|
| `*.unit.test.ts` | ユニットテスト |
| `*.integration.test.ts` | 統合テスト |
| `*.property.test.ts` | プロパティベーステスト（fast-check） |

## PBT の方針

- ドメイン層の純粋関数に対してプロパティベーステストを積極的に使用する
- `fast-check` のアービトラリでドメインに適した入力を生成する
- ラウンドトリップ性、冪等性、不変条件などの性質を検証する
