# 実装計画: github-actions-vsix-release

## 概要

PrefixFold拡張機能に、GitHubへのタグプッシュをトリガーとしたCI/CDパイプラインを追加する。`.github/workflows/release.yml`にGitHub Actionsワークフローを定義し、`v`プレフィックス付きタグのプッシュ時にTypeScriptコンパイル・テスト実行・VSIXパッケージ生成・GitHub Release作成までを自動化する。本機能はYAML設定ファイルのみで構成され、アプリケーションコードの変更は不要。

## タスク

- [x] 1. GitHub Actionsワークフローファイルの作成
  - [x] 1.1 ワークフローの基本構造とトリガー設定
    - `.github/workflows/release.yml`を新規作成する
    - ワークフロー名を`Release`に設定する
    - トリガーを`on: push: tags: ["v*"]`に設定し、`v`で始まるタグプッシュのみで起動するようにする
    - 権限設定を`permissions: contents: write`のみに制限する
    - ジョブ`release`を定義し、実行環境を`ubuntu-latest`に設定する
    - _要件: 1.1, 1.2, 1.3, 5.1, 5.2, 5.4_

  - [x] 1.2 ビルドと検証ステップの追加
    - `actions/checkout@v4`でリポジトリをチェックアウトするステップを追加する
    - `actions/setup-node@v4`でNode.js LTS（`node-version: "lts/*"`）をセットアップし、`cache: "npm"`でnpmキャッシュを有効化するステップを追加する
    - `npm ci`で依存関係をインストールするステップを追加する
    - `npm run compile`でTypeScriptコンパイルを実行するステップを追加する
    - `npm test`でテストスイートを実行するステップを追加する
    - 各ステップはGitHub Actionsのデフォルトのフェイルファスト動作により、失敗時に後続ステップが中断される
    - _要件: 2.1, 2.2, 2.3, 2.4, 5.3_

  - [x] 1.3 バージョン抽出とVSIXパッケージ生成ステップの追加
    - `GITHUB_REF_NAME`から`v`プレフィックスを除去してバージョン番号を抽出するステップを追加する（`id: version`、`echo "VERSION=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"`）
    - `npx @vscode/vsce package --out prefix-fold-${{ steps.version.outputs.VERSION }}.vsix`でVSIXパッケージを生成するステップを追加する
    - vsceはグローバルインストールせず`npx`経由で実行する
    - _要件: 3.1, 3.2, 3.3, 5.5_

  - [x] 1.4 GitHub Release作成ステップの追加
    - `softprops/action-gh-release@v2`を使用してGitHub Releaseを作成するステップを追加する
    - `files`パラメータで生成したVSIXファイル（`prefix-fold-${{ steps.version.outputs.VERSION }}.vsix`）をリリースアセットとして添付する
    - `generate_release_notes: true`でGitHubの自動リリースノート生成機能を有効化する（前回タグからのコミット履歴に基づくリリースノート）
    - リリースタイトルはデフォルトでタグ名（例: `v0.1.0`）が使用される
    - _要件: 4.1, 4.2, 4.3, 4.4_

- [x] 2. チェックポイント - ワークフローファイルの検証
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。
  - ワークフローYAMLの構文と構造を確認する（トリガー設定、権限設定、ステップの順序、アクションのバージョン指定）

- [x] 3. 関連スペックの更新確認
  - [x] 3.1 collapse-treeスペックの確認と必要に応じた更新
    - `.kiro/specs/features/collapse-tree/requirements.md`と`design.md`を確認し、CI/CDパイプライン追加による影響がないか確認する
    - 影響がある場合は該当箇所を更新して整合性を保つ（現時点ではリリースプロセスの追加であり、コア機能への影響はないため、更新不要と判断される可能性が高い）
    - _要件: 5.1_

- [x] 4. 最終チェックポイント - 全体検証
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。
  - ワークフローファイルの構成確認を行う:
    - ファイルパスが`.github/workflows/release.yml`であること（要件5.1）
    - 実行環境が`ubuntu-latest`であること（要件5.2）
    - Node.jsバージョンが`lts/*`であること（要件5.3）
    - 権限設定が`contents: write`のみであること（要件5.4）
    - vsceが`npx @vscode/vsce`経由で実行されること（要件5.5）

## 備考

- 本機能はGitHub Actionsワークフロー定義（YAML設定ファイル）のみで構成され、アプリケーションコードの変更は不要
- プロパティベーステスト（PBT）は適用外（宣言的な設定ファイルであり、入力/出力を持つ関数ではないため）
- ワークフローの動作検証は実際のGitHubリポジトリでのタグプッシュによる手動E2Eテストで行う
- 各タスクは具体的な要件番号を参照しており、トレーサビリティを確保している
- チェックポイントでインクリメンタルな検証を行い、問題の早期発見を促進する
