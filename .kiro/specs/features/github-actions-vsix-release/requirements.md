# 要件定義ドキュメント

## はじめに

VSCode拡張機能「PrefixFold」に、GitHubへのタグプッシュをトリガーとしてVSIXパッケージを自動ビルドし、GitHub Releaseに添付するCI/CDパイプラインを追加する。これにより、リリース作業を手動で行う必要がなくなり、タグを打つだけで一貫性のあるリリース成果物を配布できるようになる。

### 背景

現在、PrefixFoldにはCI/CDパイプラインが存在せず、VSIXパッケージの生成やリリースはすべて手動で行う必要がある。GitHub Actionsを導入し、タグプッシュ時に自動的にVSIXファイルを生成してGitHub Releaseに添付する仕組みを構築することで、リリースプロセスの自動化と品質の安定化を実現する。

## 用語集

- **GitHub_Actions**: GitHubが提供するCI/CDプラットフォーム。リポジトリ内のイベントをトリガーとしてワークフローを自動実行する
- **ワークフローファイル**: GitHub Actionsの実行手順を定義するYAMLファイル。`.github/workflows/`ディレクトリに配置する
- **VSIX**: VSCode拡張機能のパッケージ形式。`.vsix`拡張子を持つファイルで、拡張機能のインストールに使用する
- **vsce**: VSCode Extension Manager。VSCode拡張機能のパッケージング・公開を行うCLIツール
- **タグ**: Gitのタグ。バージョン番号を示すために使用する（例: `v0.1.0`、`v1.0.0`）
- **GitHub_Release**: GitHubが提供するリリース管理機能。タグに紐づけてリリースノートやバイナリファイルを公開できる
- **リリースアセット**: GitHub Releaseに添付されるファイル。本機能ではVSIXファイルがリリースアセットとなる

## 要件

### 要件1: ワークフロートリガー

**ユーザーストーリー:** 開発者として、GitHubにバージョンタグをプッシュするだけでリリースプロセスが自動的に開始されてほしい。それにより、手動でのビルド・リリース作業を省略できる。

#### 受け入れ基準

1. WHEN `v`で始まるタグがGitHubリポジトリにプッシュされた場合（例: `v0.1.0`、`v1.0.0`）、THE GitHub_Actions SHALL リリースワークフローを自動的に開始する
2. WHEN `v`で始まらないタグがプッシュされた場合、THE GitHub_Actions SHALL リリースワークフローを実行しない
3. WHEN ブランチへの通常のプッシュが行われた場合、THE GitHub_Actions SHALL リリースワークフローを実行しない

### 要件2: ビルドと検証

**ユーザーストーリー:** 開発者として、リリース前にコードのコンパイルとテストが自動的に実行されてほしい。それにより、品質が検証された成果物のみがリリースされる。

#### 受け入れ基準

1. WHEN リリースワークフローが開始された場合、THE GitHub_Actions SHALL Node.js環境をセットアップし、`npm ci`で依存関係をインストールする
2. WHEN 依存関係のインストールが完了した場合、THE GitHub_Actions SHALL `npm run compile`を実行してTypeScriptのコンパイルを行う
3. WHEN コンパイルが完了した場合、THE GitHub_Actions SHALL `npm test`を実行してテストスイートを実行する
4. IF コンパイルまたはテストが失敗した場合、THEN THE GitHub_Actions SHALL ワークフローを中断し、VSIXパッケージの生成を行わない

### 要件3: VSIXパッケージ生成

**ユーザーストーリー:** 開発者として、タグのバージョン番号に基づいたVSIXパッケージが自動的に生成されてほしい。それにより、バージョン管理された配布可能な成果物を得られる。

#### 受け入れ基準

1. WHEN ビルドと検証が成功した場合、THE GitHub_Actions SHALL vsceを使用してVSIXパッケージを生成する
2. WHEN VSIXパッケージを生成する場合、THE GitHub_Actions SHALL ファイル名を`prefix-fold-{バージョン}.vsix`の形式とする（例: タグ`v0.1.0`の場合、`prefix-fold-0.1.0.vsix`）
3. IF VSIXパッケージの生成が失敗した場合、THEN THE GitHub_Actions SHALL ワークフローを中断し、GitHub Releaseの作成を行わない

### 要件4: GitHub Release作成

**ユーザーストーリー:** 開発者として、タグに対応するGitHub Releaseが自動的に作成され、VSIXファイルが添付されてほしい。それにより、ユーザーがGitHubから直接拡張機能をダウンロードできる。

#### 受け入れ基準

1. WHEN VSIXパッケージの生成が成功した場合、THE GitHub_Actions SHALL プッシュされたタグに対応するGitHub Releaseを作成する
2. WHEN GitHub Releaseを作成する場合、THE GitHub_Actions SHALL 生成したVSIXファイルをリリースアセットとして添付する
3. WHEN GitHub Releaseを作成する場合、THE GitHub_Actions SHALL リリースタイトルをタグ名と同一にする（例: `v0.1.0`）
4. WHEN GitHub Releaseを作成する場合、THE GitHub_Actions SHALL タグから前回のタグまでのコミット履歴に基づいてリリースノートを自動生成する

### 要件5: ワークフロー構成

**ユーザーストーリー:** 開発者として、ワークフローファイルがGitHubのベストプラクティスに従って構成されてほしい。それにより、保守性が高く安全なCI/CDパイプラインを維持できる。

#### 受け入れ基準

1. THE GitHub_Actions SHALL ワークフローファイルを`.github/workflows/release.yml`に配置する
2. THE GitHub_Actions SHALL 実行環境として`ubuntu-latest`を使用する
3. THE GitHub_Actions SHALL Node.jsのバージョンとしてプロジェクトの互換性に適した安定版（LTS）を使用する
4. THE GitHub_Actions SHALL GitHub Releaseの作成に必要な最小限の権限（`contents: write`）のみをワークフローに付与する
5. THE GitHub_Actions SHALL vsceをワークフロー内でグローバルインストールせず、`npx`経由で実行する
