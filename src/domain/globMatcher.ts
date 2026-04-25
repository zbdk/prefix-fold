/**
 * GlobMatcher: シンプルなglobパターンマッチング
 *
 * ドメイン層で使用するため、外部ライブラリに依存しない軽量な実装。
 * 対応パターン:
 *   - `*` : 任意の文字列（パス区切り文字を除く）
 *   - `?` : 任意の1文字
 *   - `**` : 任意のパス（ディレクトリを跨ぐ）
 *   - `{a,b}` : aまたはb
 */

/**
 * globパターンを正規表現に変換する
 *
 * @param pattern - globパターン文字列
 * @returns 対応する正規表現
 */
function globToRegExp(pattern: string): RegExp {
  let regExpStr = "^";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*") {
      if (i + 1 < pattern.length && pattern[i + 1] === "*") {
        // ** : 任意のパス（ディレクトリを跨ぐ）
        regExpStr += ".*";
        i += 2;
        // **/ の場合、スラッシュもスキップ
        if (i < pattern.length && pattern[i] === "/") {
          i++;
        }
      } else {
        // * : 任意の文字列（スラッシュを除く）
        regExpStr += "[^/]*";
        i++;
      }
    } else if (char === "?") {
      regExpStr += "[^/]";
      i++;
    } else if (char === "{") {
      // {a,b} パターン
      const closingIndex = pattern.indexOf("}", i);
      if (closingIndex !== -1) {
        const alternatives = pattern.substring(i + 1, closingIndex).split(",");
        regExpStr +=
          "(?:" + alternatives.map(escapeRegExpChars).join("|") + ")";
        i = closingIndex + 1;
      } else {
        regExpStr += escapeRegExpChar(char);
        i++;
      }
    } else {
      regExpStr += escapeRegExpChar(char);
      i++;
    }
  }

  regExpStr += "$";
  return new RegExp(regExpStr);
}

/**
 * 正規表現の特殊文字をエスケープする
 */
function escapeRegExpChar(char: string): string {
  if (".+^$|()[]\\".includes(char)) {
    return "\\" + char;
  }
  return char;
}

/**
 * 文字列中の正規表現特殊文字をエスケープする
 */
function escapeRegExpChars(str: string): string {
  return str.replace(/[.+^$|()[\]\\*?{}]/g, "\\$&");
}

/**
 * ファイル名がglobパターンに一致するかを判定する
 *
 * @param fileName - 判定対象のファイル名
 * @param pattern - globパターン
 * @returns 一致する場合true
 */
export function matchGlob(fileName: string, pattern: string): boolean {
  try {
    const regExp = globToRegExp(pattern);
    return regExp.test(fileName);
  } catch {
    // 不正なパターンの場合はマッチしないとみなす
    return false;
  }
}

/**
 * ファイル名がいずれかの除外パターンに一致するかを判定する
 *
 * @param fileName - 判定対象のファイル名
 * @param patterns - 除外パターンの配列
 * @returns いずれかのパターンに一致する場合true
 */
export function matchesAnyPattern(
  fileName: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => matchGlob(fileName, pattern));
}
