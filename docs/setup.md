# セットアップガイド

## アーキテクチャ概要

```
space/
├── engine/   ← Rust 製 WASM ライブラリ（物理計算）
└── web/      ← Vite + TypeScript フロントエンド
```

`web` は `npm run dev` / `npm run build` 時に自動で `engine` を WASM ビルドし、  
`web/pkg/` に出力されたファイルをそのまま import して使います。

---

## 前提条件

以下のツールがホスト環境に必要です。npm パッケージとしてではなく、OS にインストールするものです。

| ツール | 最低バージョン | 備考 |
|--------|--------------|------|
| Rust (cargo) | `1.85.0+` | `Cargo.toml` の `edition = "2024"` が要件 |
| wasm-pack | `0.14.0+` | cargo に同梱されない。別途インストールが必要 |
| Node.js | `20.19.0+` または `22.12.0+` | `vite@8` の `engines` 要件 |
| npm | `10.x+` | Node.js に同梱。個別インストール不要 |

インストール済みかどうかは以下で確認できます：

```bash
rustc --version
cargo --version
wasm-pack --version
node --version
npm --version
```

---

## Step 1 ｜ Rust のインストール

Rust は `rustup` 経由でインストールすることを推奨します（WASM ターゲットの管理が容易なため）。

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# インストール後、シェルに反映
source ~/.cargo/env

# 確認
rustc --version
cargo --version
```

途中でオプションを聞かれた場合は `1) Proceed with standard installation` を選択してください。

### wasm32 ターゲットの確認

WASM ビルドに必要なターゲットが追加されているか確認します：

```bash
rustc --print target-list | grep wasm32-unknown-unknown
```

出力がない場合は以下で追加します：

```bash
rustup target add wasm32-unknown-unknown
```

---

## Step 2 ｜ wasm-pack のインストール

Rust コードを WASM にコンパイルするためのツールです。

```bash
cargo install wasm-pack

# 確認
wasm-pack --version
```

インストールに 3〜5 分かかることがあります。

---

## Step 3 ｜ Node.js のバージョン確認

```bash
node --version  # 20.19.0 以上、または 22.x 以上であること
```

バージョンが古い場合は `nvm` でアップグレードできます：

```bash
# nvm が未インストールの場合
brew install nvm

# Node.js 22 をインストールして切り替え
nvm install 22
nvm use 22
```

---

## Step 4 ｜ リポジトリを clone する

```bash
git clone https://github.com/mtmt-btline/space.git
cd space
```

---

## Step 5 ｜ フロントエンドの依存パッケージをインストール

```bash
cd web
npm ci
```

---

## Step 6 ｜ 開発サーバーを起動する

```bash
cd web
npm run dev
```

内部の実行フロー：

1. `wasm-pack build ../engine --target web --out-dir ../web/pkg`（WASM ビルド）
2. Vite 開発サーバーを起動

初回は `wasm-bindgen-cli` のインストールが自動で走るため、完了まで数分かかる場合があります。

ブラウザで `http://localhost:5173` を開いて表示を確認してください。


---

## リント・フォーマット

このプロジェクトは、TypeScript では **Google TypeScript Style Guide に沿う方針** で lint/format を行います。

| ツール | 対象 | 管理元 |
|--------|------|--------|
| **rustfmt** | Rust のフォーマット | Rust 公式チーム |
| **Clippy** | Rust の静的解析 (lint) | Rust 公式チーム |
| **ESLint** | TypeScript の静的解析 (lint) | OpenJS Foundation |
| **Prettier** | TypeScript / CSS のフォーマット | Prettier OSS コミュニティ |

### TypeScript（web/ で実行）

```bash
cd web

# lint チェック（エラーのみ表示）
npm run lint

# lint エラーを自動修正
npm run lint:fix

# フォーマットチェック（差分表示のみ。ファイル変更なし）
npm run format:check

# フォーマット適用（ファイルを上書き）
npm run format
```

### Rust（engine/ 対象、web/ から実行）

```bash
cd web

# Clippy による静的解析
npm run lint:rs

# rustfmt でフォーマット適用（ファイルを上書き）
npm run fmt:rs

# フォーマットチェック（差分表示のみ。ファイル変更なし）
npm run fmt:rs:check
```

> **Note**: `lint:rs` は WASM ターゲット向けにコンパイルするため、`wasm32-unknown-unknown` ターゲットが必要です（Step 1 で追加済みのはずです）。
>
> **補足**: TypeScript 側は ESLint ルール（single quote / semicolon など）で Google スタイルに寄せ、
> 仕上げの整形は Prettier で一貫させています。

---

## 本番ビルド（任意）

```bash
cd web
npm run build   # wasm:build → tsc → vite build
npm run preview # ビルド結果をローカルで確認
```

---

## コマンドリファレンス

| コマンド | 実行場所 | 内容 |
|---------|---------|------|
| `cargo check` | `engine/` | Rust コードの型チェック（WASM ビルドなし） |
| `npm ci` | `web/` | 依存パッケージのクリーンインストール |
| `npm run wasm:build` | `web/` | WASM のみ手動ビルド |
| `npm run dev` | `web/` | WASM ビルド → 開発サーバー起動 |
| `npm run build` | `web/` | WASM ビルド → 本番ビルド |
| `npm run preview` | `web/` | 本番ビルドをローカルでプレビュー |
| `npm run lint` | `web/` | TypeScript の ESLint チェック |
| `npm run lint:fix` | `web/` | TypeScript の ESLint 自動修正 |
| `npm run format:check` | `web/` | TypeScript の Prettier フォーマットチェック |
| `npm run format` | `web/` | TypeScript の Prettier フォーマット適用 |
| `npm run lint:rs` | `web/` | Rust の Clippy 静的解析 |
| `npm run fmt:rs` | `web/` | Rust の rustfmt フォーマット適用 |
| `npm run fmt:rs:check` | `web/` | Rust の rustfmt フォーマットチェック |

---

## トラブルシューティング

### `command not found: wasm-pack`

```bash
source ~/.cargo/env
cargo install wasm-pack
```

### `npm run dev` / `npm run build` が Node バージョンエラーで失敗する

`vite@8` は Node.js `20.19+` または `22.12+` を要求します。  
`node --version` を確認し、古い場合は Step 3 の手順でアップグレードしてください。

### WASM ビルド後に `npm run build` がまだ失敗する場合

`node_modules` を再構築すると解消することがあります：

```bash
cd web
rm -rf node_modules package-lock.json
npm install
npm run build
```

### `Linking with 'cc' failed`（macOS）

Xcode Command Line Tools が未インストールの場合に発生します：

```bash
xcode-select --install
```
