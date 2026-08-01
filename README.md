# 🔍 Google Search Vim Navigation

Google 検索結果ページを vim ライクなキーバインドで操作する userscript。⌨️
`j` / `k` で検索結果を辿り、`h` / `l` でページを移動し、`/` で検索ボックスに戻る。
Tampermonkey / Violentmonkey での利用を想定した単一ファイル・依存ゼロのスクリプト。📄

## 📦 インストール

`google-search-vim.user.js` をユーザースクリプトマネージャに読み込む。

### 🔗 raw URL からインストール (推奨)

Tampermonkey / Violentmonkey を導入済みのブラウザで以下の URL を開くと、インストール画面が表示される。⬇️

```
https://raw.githubusercontent.com/ngmtine/google-search-vim/master/google-search-vim.user.js
```

メタデータの `@updateURL` / `@downloadURL` がこの URL を指しているため、master を更新すれば各ブラウザに自動更新が配信される。🔄

### 🐒 Tampermonkey

1. 🧭 Tampermonkey の管理画面を開く。
2. ✏️ 「新規スクリプトを作成」を選び、エディタの内容を `google-search-vim.user.js` の全文で置き換える。
3. 💾 保存する (Ctrl+S)。

リポジトリを clone 済みなら、`file://` の URL を直接開いてインストールすることもできる。📂
その場合は Tampermonkey の拡張機能設定で「ファイルの URL へのアクセスを許可する」を有効にする必要がある。🔓

### 🐵 Violentmonkey

1. 🧭 Violentmonkey のダッシュボードを開く。
2. ✏️ 「+」から「新規スクリプト」を選び、エディタの内容を `google-search-vim.user.js` の全文で置き換える。
3. 💾 保存する。

## ⌨️ キーバインド

| キー | 動作 |
|---|---|
| j / k | ⬇️⬆️ 次/前の検索結果アンカーへフォーカス移動 |
| h / l | ◀️▶️ 前/次ページへ遷移 (ページネーション) |
| gg | ⏫ 先頭の結果へ (g 2 連打、間隔 500ms 以内) |
| G (Shift+g) | ⏬ 末尾の結果へ |
| o | 🆕 フォーカス中の結果を新規タブで開く |
| / | 🔎 検索ボックスへフォーカスし全選択 |
| Esc | 🚪 検索ボックスにフォーカス中なら blur |

フォーカス中の結果を現在のタブで開く操作は用意していない。🚫
アンカーに実際のフォーカスを当てているため、Enter で開く・Ctrl+Enter で新規タブに開くというブラウザ標準の挙動がそのまま使える。↩️

入力欄 (input / textarea / select / contenteditable) にフォーカスがあるときは、Esc を除いてキー入力を横取りしない。🛡️
IME 変換中の keydown も横取りしない。🇯🇵

## 🌐 対応ドメイン

`@match` で以下の 2 つを対象にしている。

- 🇺🇸 `https://www.google.com/search*`
- 🇯🇵 `https://www.google.co.jp/search*`

他の TLD で使いたい場合は、スクリプト冒頭のメタデータブロックに `@match` を自分で追加する。✍️

```js
// @match        https://www.google.de/search*
```

## 🧩 Vimium との共存

Vimium (Vimium C も同様) は拡張機能としてページより先にキー入力を受け取り、マップ済みのキーはそこで止める。🚧
そのため Vimium 側で `j` などをマップしていると、本スクリプトにはキーが届かない。
これは userscript 側では回避できないため、Vimium の設定 (Options → Excluded URLs and keys) で検索結果ページのキーを素通しさせる。🔧

| Patterns | Passed keys |
|---|---|
| `https?://www.google.com/search*` | `jkhlgG` |
| `https?://www.google.co.jp/search*` | `jkhlgG` |

`/` を Vimium 側でマップしている場合 (既定ではページ内検索) は、`/` も Passed keys に足す。🔎
`g` を素通しさせると、そのページでは Vimium の `g` 系シーケンス (`gi` / `gf` など) が効かなくなる。⚖️
`o` を Vimium のリンクヒントに残す場合でも、フォーカス中の結果は Enter / Ctrl+Enter (ブラウザ標準) で開ける。↩️
`o` を本スクリプトに譲るなら Passed keys に `o` を足す。

## 🧠 設計メモ

### 🚫 難読化された class 名に依存しない

Google 検索結果の class 名 (`div.g` など) は難読化されており、予告なく変わる。🎲
そのため class 名は一切参照せず、比較的安定している要素だけを手がかりにしている。

- 🏁 結果領域は `#search`、無ければ `#rso`、それも無ければ `document` を起点にする。
- 🔗 結果アンカーは、起点配下の `h3` を列挙して `h3.closest("a")` で取得する。
- 👀 href が http(s) で始まり、`offsetParent !== null` で可視なものだけを、document order のまま採用する。

id ベースであっても Google 側の変更で壊れる可能性は残る。⚠️
class 名よりは寿命が長いだろうという判断であって、安定性が保証されているわけではない。

### 🔄 キー入力のたびに毎回スキャンする

検索結果の一覧はキャッシュせず、キーが押されるたびに DOM を走査し直す。
Google は結果を非同期に差し替えたり追加したりするため、キャッシュを持つと実 DOM とずれる。🔀
MutationObserver でキャッシュを保守する方法も取らず、状態を持たないことで壊れにくさを優先した。🪶

現在位置はインデックスではなく要素参照で保持する。📌
走査結果の配列に `indexOf` で現在位置を求め、見つからなければ先頭扱いにフォールバックする。
`document.activeElement` が結果アンカーであれば、そちらを優先して現在位置とみなす。

### 🎯 アンカーに実 focus を当てる

移動先のアンカーには `focus({ preventScroll: true })` で実際のフォーカスを与え、スクロールするかどうかは自前で判断する。🖱️
上下 80px の余白を残して画面内に収まっているときはスクロールしない。
画面外にあるか端に近いときだけ `scrollIntoView({ block: "center" })` で中央に寄せる。
移動のたびに中央寄せするとビューポートが毎回跳ねて追いにくいため、vim の scrolloff に近い挙動にしている。🪟
擬似的な選択状態ではなく実 focus なので、Enter や Ctrl+Enter といったブラウザ標準のキー操作をそのまま利用できる。↩️

フォーカスリングだけでは視認しにくいため、`a[data-gsv-focus]` に対するアウトラインを `<style>` で注入して併用する。🖍️
data 属性は移動時と blur 時に除去し、ページ上にゴミが残らないようにしている。🧹

## ⚠️ 既知の制約

- 🏗️ Google が DOM 構造を変えると動作しなくなる可能性がある。特に `h3` を結果タイトルに使う構造や、`#search` / `#rso` / `#pnnext` / `#pnprev` といった id に変更が入った場合の影響が大きい。
- 🖼️ 対象は通常のウェブ検索タブのみ。画像・ニュース・動画などのタブは結果の DOM 構造が異なり、対象外。
- 🔢 `h` によるページ戻りは、`#pnprev` が無い場合に URL の `start` パラメータを 10 減らして遷移する。1 ページあたりの表示件数を既定の 10 件から変更している場合、想定どおりのページに戻らない。
- 📐 `offsetParent === null` を不可視の判定に使っているため、`position: fixed` で配置された結果アンカーがあれば取りこぼす。現在の検索結果ページでそのような配置は確認していない。
