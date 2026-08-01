// ==UserScript==
// @name         Google Search Vim Navigation
// @namespace    https://github.com/ngmtine
// @version      0.1.1
// @description  Google 検索結果を j/k/h/l で vim ライクに操作する
// @match        https://www.google.com/search*
// @match        https://www.google.co.jp/search*
// @downloadURL  https://raw.githubusercontent.com/ngmtine/google-search-vim/master/google-search-vim.user.js
// @updateURL    https://raw.githubusercontent.com/ngmtine/google-search-vim/master/google-search-vim.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    "use strict";

    const FOCUS_ATTR = "data-gsv-focus";
    const GG_INTERVAL_MS = 500;
    const PAGE_SIZE = 10;

    /** 現在フォーカス中の結果アンカー。インデックスではなく要素参照で持つ (DOM 差し替えで番号がずれるため) */
    let focusedAnchor = null;
    /** gg 判定用。直近に g を押した時刻 (ms) */
    let lastGTime = 0;

    // ---------------------------------------------------------------------
    // ハイライト
    // ---------------------------------------------------------------------

    const injectStyle = () => {
        const style = document.createElement("style");
        // Google 側のスタイルに負けないよう !important を付ける
        style.textContent = `a[${FOCUS_ATTR}] {
    outline: 2px solid #ff6d00 !important;
    outline-offset: 2px !important;
    border-radius: 3px !important;
    background-color: rgba(255, 109, 0, 0.08) !important;
}`;
        (document.head || document.documentElement).appendChild(style);
    };

    /** blur してもハイライトだけが残らないようにする */
    const onAnchorBlur = (e) => {
        e.currentTarget.removeAttribute(FOCUS_ATTR);
    };

    // ---------------------------------------------------------------------
    // 検索結果の列挙
    // ---------------------------------------------------------------------

    // Google の class 名は難読化されており予告なく変わるため、`div.g` 等には一切依存しない。
    // 比較的安定している id (#search / #rso) と、結果タイトルが h3 である構造だけを頼りにする。
    const getResultRoot = () => document.querySelector("#search") || document.querySelector("#rso") || document;

    // Google は結果を非同期に差し替える (無限スクロール的な追加・広告の遅延挿入など)。
    // MutationObserver でキャッシュを保守するより、キー入力のたびに素直に取り直す方が壊れにくい。
    const collectResults = () => {
        const root = getResultRoot();
        const anchors = [];
        const seenAnchors = new Set();
        const seenHrefs = new Set();

        for (const h3 of root.querySelectorAll("h3")) {
            const anchor = h3.closest("a");
            if (!anchor) continue;

            const href = anchor.href;
            if (!/^https?:\/\//i.test(href)) continue;

            // 折りたたみ内や display:none の要素を除く
            if (anchor.offsetParent === null) continue;

            if (seenAnchors.has(anchor) || seenHrefs.has(href)) continue;

            seenAnchors.add(anchor);
            seenHrefs.add(href);
            anchors.push(anchor);
        }

        return anchors;
    };

    /** 現在位置を返す。未選択・見失った場合は -1 */
    const getCurrentIndex = (results) => {
        const active = document.activeElement;
        if (active) {
            const activeIndex = results.indexOf(active);
            if (activeIndex !== -1) return activeIndex;
        }
        if (focusedAnchor) return results.indexOf(focusedAnchor);
        return -1;
    };

    // ---------------------------------------------------------------------
    // フォーカス移動
    // ---------------------------------------------------------------------

    const focusResult = (anchor) => {
        if (!anchor) return;

        if (focusedAnchor && focusedAnchor !== anchor) {
            focusedAnchor.removeAttribute(FOCUS_ATTR);
        }
        focusedAnchor = anchor;
        anchor.setAttribute(FOCUS_ATTR, "");

        // 同一の関数参照なので、重ねて呼んでもリスナは重複登録されない
        anchor.addEventListener("blur", onAnchorBlur);

        // focus() 由来のスクロールは端に寄るだけなので抑止し、自前で中央に寄せる
        anchor.focus({ preventScroll: true });
        anchor.scrollIntoView({ block: "center" });
    };

    const moveFocus = (delta) => {
        const results = collectResults();
        if (results.length === 0) return;

        const current = getCurrentIndex(results);
        // 見失った場合は先頭扱い
        const next = current === -1 ? 0 : Math.min(Math.max(current + delta, 0), results.length - 1);
        focusResult(results[next]);
    };

    const focusEdge = (edge) => {
        const results = collectResults();
        if (results.length === 0) return;
        focusResult(edge === "last" ? results[results.length - 1] : results[0]);
    };

    const openFocusedInNewTab = () => {
        const results = collectResults();
        const index = getCurrentIndex(results);
        if (index === -1) return;
        window.open(results[index].href, "_blank", "noopener");
    };

    // ---------------------------------------------------------------------
    // ページネーション
    // ---------------------------------------------------------------------

    const goNextPage = () => {
        const next = document.querySelector("#pnnext");
        // 無ければ最終ページとみなして何もしない
        if (next) next.click();
    };

    const goPrevPage = () => {
        const prev = document.querySelector("#pnprev");
        if (prev) {
            prev.click();
            return;
        }

        // #pnprev が描画されないレイアウトのフォールバック
        const url = new URL(location.href);
        const start = Number.parseInt(url.searchParams.get("start") ?? "", 10);
        if (!Number.isFinite(start) || start <= 0) return;

        url.searchParams.set("start", String(Math.max(0, start - PAGE_SIZE)));
        location.href = url.toString();
    };

    // ---------------------------------------------------------------------
    // 検索ボックス
    // ---------------------------------------------------------------------

    // Google は検索ボックスを textarea に移行したが、レイアウトによっては input のこともある
    const getSearchBox = () => document.querySelector('textarea[name="q"]') || document.querySelector('input[name="q"]');

    const focusSearchBox = () => {
        const box = getSearchBox();
        if (!box) return false;
        box.focus();
        box.select();
        return true;
    };

    // ---------------------------------------------------------------------
    // キーハンドラ
    // ---------------------------------------------------------------------

    const isEditableTarget = (target) => {
        if (!(target instanceof Element)) return false;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (target instanceof HTMLElement && target.isContentEditable) return true;
        return false;
    };

    const onKeyDown = (e) => {
        // IME 変換中の keydown をキーバインドとして扱うと、日本語入力が「j で下移動」等に化ける。
        // keyCode === 229 は isComposing を正しく立てない環境向けのフォールバック。
        if (e.isComposing || e.keyCode === 229) return;

        // ブラウザ/サイト側のショートカットを奪わない。Shift だけは G のために許容する
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        if (isEditableTarget(e.target)) {
            // 入力中は素通し。ただし検索ボックスからの離脱手段として Esc だけ処理する
            if (e.key === "Escape") {
                const box = getSearchBox();
                if (box && document.activeElement === box) {
                    box.blur();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            return;
        }

        const key = e.key;

        if (key === "g") {
            const now = Date.now();
            if (now - lastGTime <= GG_INTERVAL_MS) {
                lastGTime = 0;
                focusEdge("first");
            } else {
                // 1 打目は消費するだけで 2 打目を待つ
                lastGTime = now;
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // g 以外が来たら gg の待ち状態を捨てる
        lastGTime = 0;

        switch (key) {
            case "j":
                moveFocus(1);
                break;
            case "k":
                moveFocus(-1);
                break;
            case "l":
                goNextPage();
                break;
            case "h":
                goPrevPage();
                break;
            case "G":
                focusEdge("last");
                break;
            case "o":
                openFocusedInNewTab();
                break;
            case "/":
                // 検索ボックスが無いときは "/" の入力を奪わない
                if (!focusSearchBox()) return;
                break;
            default:
                return;
        }

        e.preventDefault();
        e.stopPropagation();
    };

    injectStyle();
    // Google 自身のキーハンドラより先に受けたいのでキャプチャフェーズで登録する
    document.addEventListener("keydown", onKeyDown, true);
})();
