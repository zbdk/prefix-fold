/**
 * SegmentSplitter: ファイル名をセグメントに分割する純粋関数
 *
 * 区切り文字リストおよびキャメルケース境界に基づいてファイル名を分割する。
 * 分割されたセグメントを再結合すると元のファイル名が復元される（ラウンドトリップ性）。
 */

/**
 * セグメント分割の結果
 * segments: 分割されたセグメント配列
 * separators: 各セグメント間の区切り文字列（長さは segments.length - 1）
 */
export interface SplitResult {
  segments: string[];
  separators: string[];
}

/**
 * ファイル名をセグメントに分割する
 *
 * @param fileName - 分割対象のファイル名
 * @param delimiters - 区切り文字のリスト（例: ["-", "."]）
 * @param camelCaseSplit - キャメルケース境界で分割するかどうか
 * @returns 分割されたセグメント配列
 */
export function split(
  fileName: string,
  delimiters: string[],
  camelCaseSplit: boolean
): string[] {
  if (fileName === "") {
    return [""];
  }

  // 区切り文字もキャメルケースも無効な場合はそのまま返す
  if (delimiters.length === 0 && !camelCaseSplit) {
    return [fileName];
  }

  // 区切り文字のみの場合
  if (delimiters.length > 0 && !camelCaseSplit) {
    return splitByDelimiters(fileName, delimiters).segments;
  }

  // キャメルケースのみの場合
  if (delimiters.length === 0 && camelCaseSplit) {
    return splitByCamelCase(fileName);
  }

  // 両方有効な場合: まず区切り文字で分割し、各セグメントをさらにキャメルケースで分割
  return splitCombined(fileName, delimiters);
}

/**
 * セグメント分割の詳細結果を返す（ラウンドトリップ検証用）
 *
 * @param fileName - 分割対象のファイル名
 * @param delimiters - 区切り文字のリスト
 * @param camelCaseSplit - キャメルケース境界で分割するかどうか
 * @returns セグメントと区切り文字の詳細結果
 */
export function splitWithSeparators(
  fileName: string,
  delimiters: string[],
  camelCaseSplit: boolean
): SplitResult {
  if (fileName === "") {
    return { segments: [""], separators: [] };
  }

  if (delimiters.length === 0 && !camelCaseSplit) {
    return { segments: [fileName], separators: [] };
  }

  if (delimiters.length > 0 && !camelCaseSplit) {
    return splitByDelimiters(fileName, delimiters);
  }

  if (delimiters.length === 0 && camelCaseSplit) {
    const segments = splitByCamelCase(fileName);
    // キャメルケース分割では区切り文字は空文字列
    const separators = segments.length > 1
      ? new Array<string>(segments.length - 1).fill("")
      : [];
    return { segments, separators };
  }

  // 両方有効な場合
  return splitCombinedWithSeparators(fileName, delimiters);
}

/**
 * 分割結果を再結合して元のファイル名を復元する
 *
 * @param result - splitWithSeparators の結果
 * @returns 復元されたファイル名
 */
export function join(result: SplitResult): string {
  if (result.segments.length === 0) {
    return "";
  }

  let joined = result.segments[0];
  for (let i = 1; i < result.segments.length; i++) {
    joined += result.separators[i - 1] + result.segments[i];
  }
  return joined;
}

/**
 * 区切り文字に基づいてファイル名を分割する
 * 区切り文字自体は結果のセグメントに含まれず、separatorsとして保持される
 */
function splitByDelimiters(fileName: string, delimiters: string[]): SplitResult {
  const segments: string[] = [];
  const separators: string[] = [];
  let current = "";

  // 区切り文字を長さの降順でソート（長いものを優先マッチ）
  const sortedDelimiters = [...delimiters].sort((a, b) => b.length - a.length);

  let i = 0;
  while (i < fileName.length) {
    let matched = false;
    for (const delimiter of sortedDelimiters) {
      if (delimiter.length > 0 && fileName.startsWith(delimiter, i)) {
        segments.push(current);
        separators.push(delimiter);
        current = "";
        i += delimiter.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      current += fileName[i];
      i++;
    }
  }
  segments.push(current);

  return { segments, separators };
}

/**
 * キャメルケース境界でファイル名を分割する
 * 大文字の出現位置を区切りポイントとして扱う
 *
 * 例:
 *   "AppCode" → ["App", "Code"]
 *   "HTMLParser" → ["HTML", "Parser"]
 *   "myApp" → ["my", "App"]
 *   "ABC" → ["ABC"]
 */
function splitByCamelCase(fileName: string): string[] {
  if (fileName.length === 0) {
    return [""];
  }

  const segments: string[] = [];
  let current = fileName[0];

  for (let i = 1; i < fileName.length; i++) {
    const char = fileName[i];
    const prevChar = fileName[i - 1];

    // 大文字の境界を検出
    if (isCamelCaseBoundary(fileName, i, prevChar, char)) {
      segments.push(current);
      current = char;
    } else {
      current += char;
    }
  }

  segments.push(current);
  return segments;
}

/**
 * キャメルケース境界かどうかを判定する
 *
 * 境界条件:
 * 1. 小文字→大文字: "myApp" の "A" の前
 * 2. 大文字→大文字→小文字: "HTMLParser" の "P" の前（連続大文字の最後の手前）
 */
function isCamelCaseBoundary(
  str: string,
  index: number,
  prevChar: string,
  currentChar: string
): boolean {
  // 小文字 → 大文字
  if (isLowerCase(prevChar) && isUpperCase(currentChar)) {
    return true;
  }

  // 大文字 → 大文字 → 小文字（連続大文字の末尾境界）
  if (
    isUpperCase(prevChar) &&
    isUpperCase(currentChar) &&
    index + 1 < str.length &&
    isLowerCase(str[index + 1])
  ) {
    return true;
  }

  return false;
}

/**
 * 区切り文字とキャメルケースの両方で分割する（統合分割）
 * まず区切り文字で分割し、各セグメントをさらにキャメルケースで分割する
 */
function splitCombined(fileName: string, delimiters: string[]): string[] {
  const delimResult = splitByDelimiters(fileName, delimiters);
  const result: string[] = [];

  for (const segment of delimResult.segments) {
    if (segment === "") {
      result.push(segment);
    } else {
      const camelSegments = splitByCamelCase(segment);
      result.push(...camelSegments);
    }
  }

  return result;
}

/**
 * 区切り文字とキャメルケースの両方で分割する（区切り文字情報付き）
 */
function splitCombinedWithSeparators(
  fileName: string,
  delimiters: string[]
): SplitResult {
  const delimResult = splitByDelimiters(fileName, delimiters);
  const segments: string[] = [];
  const separators: string[] = [];

  for (let i = 0; i < delimResult.segments.length; i++) {
    const segment = delimResult.segments[i];

    if (segment === "") {
      segments.push(segment);
    } else {
      const camelSegments = splitByCamelCase(segment);
      // キャメルケース分割のセグメント間は空文字列の区切り
      for (let j = 0; j < camelSegments.length; j++) {
        segments.push(camelSegments[j]);
        if (j < camelSegments.length - 1) {
          separators.push(""); // キャメルケース境界は空文字列
        }
      }
    }

    // 元の区切り文字を追加（最後のセグメント以外）
    if (i < delimResult.separators.length) {
      separators.push(delimResult.separators[i]);
    }
  }

  return { segments, separators };
}

/**
 * 文字が大文字かどうかを判定する
 */
function isUpperCase(char: string): boolean {
  return char >= "A" && char <= "Z";
}

/**
 * 文字が小文字かどうかを判定する
 */
function isLowerCase(char: string): boolean {
  return char >= "a" && char <= "z";
}
