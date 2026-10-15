export const DEFAULT_SPEC = Object.freeze({
  widthMm: 1200, depthMm: 400, heightMm: 1500, shelves: 3, material: 'birch', quantity: 1,
});

export const MATERIAL_RATES = Object.freeze({
  framePerMeter: 18000, birchPerSquareMeter: 75000, steelPerSquareMeter: 96000,
  bracket: 650, bolt: 120, foot: 1500, laborBase: 35000, laborPerShelf: 15000,
  marginRate: 0.25, vatRate: 0.1,
});

export class DomainError extends Error {
  constructor(code, message, fields, status = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.fields = fields;
    this.status = status;
  }
}

const RANGES = { widthMm: [400, 2400], depthMm: [250, 900], heightMm: [600, 2400], shelves: [2, 8], quantity: [1, 100] };
const LABELS = { widthMm: '폭', depthMm: '깊이', heightMm: '높이', shelves: '선반 수', quantity: '제작 수량' };

export function validateSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DomainError('INVALID_SPEC', '규격을 입력해 주세요.', { spec: '규격은 객체여야 합니다.' });
  }
  const fields = {};
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
      fields[key] = `${LABELS[key]}은 ${min}~${max} 범위의 정수여야 합니다${key.endsWith('Mm') ? ' (mm)' : ''}.`;
    }
  }
  if (!['birch', 'steel'].includes(input.material)) fields.material = '선반 재료는 자작합판 또는 강판을 선택해 주세요.';
  if (!Object.keys(fields).length) {
    const panelThickness = input.material === 'birch' ? 18 : 2;
    const clearGap = (input.heightMm - 100 - input.shelves * panelThickness) / (input.shelves - 1) - 40;
    if (clearGap < 180) fields.shelves = '선반 사이의 간격을 180 mm 이상 확보해 주세요.';
    if (input.heightMm / input.depthMm > 6) fields.depthMm = '높이 대비 깊이가 너무 작습니다. 높이의 1/6 이상으로 설정해 주세요.';
  }
  if (Object.keys(fields).length) throw new DomainError('INVALID_SPEC', '제작 규격을 확인해 주세요.', fields);
  return Object.fromEntries([...Object.keys(RANGES), 'material'].map(key => [key, input[key]]));
}

export function calculatePreview(input) {
  const spec = validateSpec(input);
  const { widthMm, depthMm, heightMm, shelves, material, quantity } = spec;
  const clearWidth = widthMm - 80;
  const clearDepth = depthMm - 80;
  const centerSupport = widthMm > 1400;
  const feet = centerSupport ? 6 : 4;
  const brackets = (centerSupport ? 6 : 4) * shelves;
  const bom = [];
  function part(id, name, category, perUnitQuantity, dimensions, unitCost, dimensionLabel) {
    const orderQuantity = perUnitQuantity * quantity;
    bom.push({ id, name, category, quantity: orderQuantity, perUnitQuantity, unit: '개', dimensions,
      dimensionLabel, unitCost, lineTotal: orderQuantity * unitCost });
  }
  function frame(id, name, count, lengthMm) {
    part(id, name, 'frame', count, { lengthMm, sectionMm: 40 },
      Math.ceil(lengthMm * MATERIAL_RATES.framePerMeter / 1000), `40 × 40 × ${lengthMm} mm`);
  }
  frame('legs', '프레임 기둥', feet, heightMm);
  frame('width-rails', '전·후면 가로 프레임', shelves * 2, clearWidth);
  frame('depth-rails', '좌·우 깊이 프레임', shelves * 2, clearDepth);
  if (centerSupport) frame('center-rails', '중앙 지지 프레임', shelves, clearDepth);
  const thicknessMm = material === 'birch' ? 18 : 2;
  const panelRate = material === 'birch' ? MATERIAL_RATES.birchPerSquareMeter : MATERIAL_RATES.steelPerSquareMeter;
  part('shelf-panels', material === 'birch' ? '자작합판 선반' : '강판 선반', 'panel', shelves,
    { widthMm: clearWidth, depthMm: clearDepth, thicknessMm },
    Math.ceil(clearWidth * clearDepth * panelRate / 1000000), `${clearWidth} × ${clearDepth} × ${thicknessMm} mm`);
  part('brackets', '프레임 연결 브래킷', 'hardware', brackets, {}, MATERIAL_RATES.bracket, '40 mm 프레임용');
  part('bolts', '체결 볼트', 'hardware', brackets * 4, {}, MATERIAL_RATES.bolt, 'M6');
  part('feet', '높이 조절 받침', 'hardware', feet, {}, MATERIAL_RATES.foot, 'M8');
  const materialCost = bom.reduce((total, line) => total + line.lineTotal, 0);
  const laborCost = (MATERIAL_RATES.laborBase + shelves * MATERIAL_RATES.laborPerShelf) * quantity;
  const manufacturingCost = materialCost + laborCost;
  // Round the unit quote first so integer unit price × quantity always equals the supply total.
  const marginAmount = Math.ceil((manufacturingCost / quantity) * MATERIAL_RATES.marginRate) * quantity;
  const supplyPrice = manufacturingCost + marginAmount;
  const vatAmount = Math.round(supplyPrice * MATERIAL_RATES.vatRate);
  const pricing = {
    currency: 'KRW', quantity, materialCost, laborCost, manufacturingCost,
    marginRate: MATERIAL_RATES.marginRate, marginAmount, supplyPrice,
    vatRate: MATERIAL_RATES.vatRate, vatAmount, total: supplyPrice + vatAmount,
    unitSupplyPrice: supplyPrice / quantity,
    assumptions: [
      '40 × 40 mm 강재 프레임과 자작합판 18 mm / 강판 2 mm 선반을 기준으로 계산합니다.',
      '폭 1,400 mm를 초과하면 중앙 기둥과 지지 프레임을 추가합니다.',
      '자재·공임 단가는 데모 가정이며 공급사 실견적, 도장·배송·설치 비용은 반영하지 않습니다.',
      '구조 안전성·하중·공차를 검증한 제조 도면이 아닙니다. 제작 전 담당자의 검토가 필요합니다.',
    ],
  };
  return { spec, bom, pricing, geometry: {
    frameSectionMm: 40, panelThicknessMm: thicknessMm, bottomShelfMm: 100, centerSupport,
    minimumClearanceMm: Math.floor((heightMm - 100 - shelves * thicknessMm) / (shelves - 1) - 40),
  } };
}

const numberWords = { 한: 1, 하나: 1, 일: 1, 두: 2, 둘: 2, 이: 2, 세: 3, 셋: 3, 삼: 3, 네: 4, 넷: 4, 사: 4,
  다섯: 5, 오: 5, 여섯: 6, 육: 6, 일곱: 7, 칠: 7, 여덟: 8, 팔: 8, 아홉: 9, 구: 9, 열: 10, 십: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numberPattern = String.raw`[+-]?\d+(?:\.\d+)?`;
const countPattern = `${numberPattern}|${Object.keys(numberWords).sort((a, b) => b.length - a.length).join('|')}`;
const unitPattern = String.raw`밀리미터|밀리|센티미터|센티|미터|mm\b|cm\b|m\b`;
const fieldsPattern = '폭|가로|너비|넓이|깊이|앞뒤|높이|width|depth|height|선반|shel(?:f|ves)|수량|quantity';
const increasePattern = /추가|늘려|늘리|증가|확장|높여|높이기|더해|더하|\b(?:increase|add|extend|enlarge|raise)\b/i;
const decreasePattern = /줄여|줄이|감소|축소|낮춰|낮추|빼|제거|삭제|\b(?:decrease|reduce|remove|subtract|lower)\b/i;

function convertMm(value, unit) {
  const scale = /^(cm|센티)/i.test(unit) ? 10 : /^(m|미터)$/i.test(unit) ? 1000 : 1;
  return Number(value) * scale;
}

function countValue(value) { return Object.hasOwn(numberWords, value.toLowerCase()) ? numberWords[value.toLowerCase()] : Number(value); }

function contextFor(text, match, label) {
  const before = text.slice(Math.max(0, match.index - 24), match.index);
  const after = text.slice(match.index + match[0].length);
  const nextField = new RegExp(fieldsPattern, 'i').exec(after);
  const suffix = after.slice(0, Math.min(nextField?.index ?? after.length, 22));
  // Korean usually puts the action after the measurement, English puts it before the field.
  const englishPrefix = /\b(?:increase|add|extend|enlarge|raise|decrease|reduce|remove|subtract|lower)\b[^,.;]*$/i.exec(before)?.[0] ?? '';
  const prefixKorean = /(?:추가|제거|삭제)\s*$/.exec(before)?.[0] ?? '';
  return `${englishPrefix} ${prefixKorean} ${suffix} ${label}`;
}

function explicitTarget(text, match) {
  // "100cm로 줄여" / "increase width to 1400mm" specify the final measurement.
  // "10cm 줄여" / "reduce width by 100mm" specify a relative amount.
  const suffix = text.slice(match.index + match[0].length, match.index + match[0].length + 16);
  return /\bto\b/i.test(match[0]) || /^\s*(?:으로|로|까지)(?:\s|[가-힣]|[,.]|$)/.test(suffix);
}

export function interpretText(text, currentSpec) {
  const current = validateSpec(currentSpec);
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) {
    throw new DomainError('INVALID_TEXT', '요청 내용을 1~4,000자로 입력해 주세요.', { text: '문자열이 필요합니다.' });
  }
  const changes = {};
  const warnings = [];
  const normalized = text.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1').replace(/[−–]/g, '-');
  const dimensions = {
    widthMm: '폭|가로|너비|넓이|width', depthMm: '깊이|앞뒤|depth', heightMm: '높이|height',
  };
  for (const [field, labels] of Object.entries(dimensions)) {
    const regex = new RegExp(`(?:${labels})(?:을|를|은|는|이|가)?\\s*(?:[:=]|(?:to|by)\\b)?\\s*(${numberPattern})\\s*(${unitPattern})?`, 'gi');
    const matches = [...normalized.matchAll(regex)];
    if (!matches.length) continue;
    if (matches.length > 1) warnings.push(`${LABELS[field]}이 여러 번 언급되어 마지막 값을 적용했습니다.`);
    const match = matches.at(-1);
    const amount = convertMm(match[1], match[2] ?? 'mm');
    const context = contextFor(normalized, match, '');
    const signedRelative = match[1].startsWith('+');
    const isDecrease = decreasePattern.test(context);
    const isIncrease = increasePattern.test(context);
    if (isDecrease && isIncrease) throw new DomainError('AMBIGUOUS_TEXT', `${LABELS[field]}의 변경 방향이 모호합니다.`, { text: '늘릴지 줄일지 하나만 명시해 주세요.' });
    changes[field] = explicitTarget(normalized, match) ? amount : isDecrease ? current[field] - Math.abs(amount) : (isIncrease || signedRelative) ? current[field] + amount : amount;
    if (!match[2]) warnings.push(`${LABELS[field]}의 단위가 없어 mm로 해석했습니다.`);
    if (!Number.isInteger(changes[field])) throw new DomainError('INVALID_TEXT', '치수는 정수 mm 단위로 입력해 주세요.', { [field]: '1 mm보다 작은 단위는 지원하지 않습니다.' });
  }
  // Only use an unlabeled W × D × H expression when no labeled dimension was found.
  if (!Object.keys(changes).some(key => key.endsWith('Mm'))) {
    const triple = new RegExp(`(${numberPattern})\\s*[x×*]\\s*(${numberPattern})\\s*[x×*]\\s*(${numberPattern})\\s*(${unitPattern})?`, 'i').exec(normalized);
    if (triple) {
      [changes.widthMm, changes.depthMm, changes.heightMm] = triple.slice(1, 4).map(value => convertMm(value, triple[4] ?? 'mm'));
      warnings.push('세 치수는 폭 × 깊이 × 높이 순서로 해석했습니다. 순서를 확인해 주세요.');
      if (!triple[4]) warnings.push('치수의 단위가 없어 mm로 해석했습니다.');
    }
  }
  const shelfRegex = new RegExp(`(?:선반|shel(?:f|ves))(?:을|를|은|는|이|가)?\\s*(?:[:=]|(?:to|by)\\b)?\\s*(${countPattern})\\s*(?:개|단|층|장|s)?`, 'gi');
  const shelfMatches = [...normalized.matchAll(shelfRegex)];
  let shelfMatch = shelfMatches.at(-1);
  let shelfContext = shelfMatch ? contextFor(normalized, shelfMatch, '') : '';
  if (!shelfMatch) {
    // English: "add one shelf", Korean: "한 개의 선반을 추가".
    const reverseShelf = new RegExp(`(${countPattern})\\s*(?:개(?:의)?|단|층|장)?\\s*(?:선반|shel(?:f|ves))`, 'gi');
    shelfMatch = [...normalized.matchAll(reverseShelf)].at(-1);
    shelfContext = shelfMatch ? contextFor(normalized, shelfMatch, '') : '';
  }
  if (shelfMatch) {
    const amount = countValue(shelfMatch[1]);
    const decrease = decreasePattern.test(shelfContext);
    const increase = increasePattern.test(shelfContext) || shelfMatch[1].startsWith('+');
    if (decrease && increase) throw new DomainError('AMBIGUOUS_TEXT', '선반 수의 변경 방향이 모호합니다.');
    changes.shelves = explicitTarget(normalized, shelfMatch) ? amount : decrease ? current.shelves - Math.abs(amount) : increase ? current.shelves + amount : amount;
  } else {
    const tiers = new RegExp(`(${countPattern})\\s*(?:단|층)(?![가-힣])`, 'i').exec(normalized);
    if (tiers) changes.shelves = countValue(tiers[1]);
    else if (/선반|shel(?:f|ves)/i.test(normalized) && /추가|제거|삭제|늘려|줄여|\badd\b|\bremove\b/i.test(normalized)) warnings.push('선반을 몇 개 변경할지 입력해 주세요.');
  }
  const materials = [...normalized.matchAll(/자작(?:나무)?(?:합판)?|birch|강판|철제|스틸|steel/gi)];
  if (materials.length) {
    const selected = materials.at(-1)[0].toLowerCase();
    changes.material = /자작|birch/.test(selected) ? 'birch' : 'steel';
    const hasBirch = materials.some(match => /자작|birch/i.test(match[0]));
    const hasSteel = materials.some(match => /강판|철제|스틸|steel/i.test(match[0]));
    if (hasBirch && hasSteel) warnings.push('두 재료가 언급되어 마지막 재료를 선반 재료로 적용했습니다. 프레임은 강재로 고정됩니다.');
  } else if (/목재|wood|원목|알루미늄|aluminum|플라스틱|plastic/i.test(normalized)) {
    warnings.push('지원하는 선반 재료는 자작합판과 강판입니다. 재료를 선택해 주세요.');
  }
  const quantityRegex = new RegExp(`(?:수량|quantity)(?:은|는|을|를)?\\s*[:=]?\\s*(${countPattern})\\s*(?:개|대|세트|units?)?`, 'i');
  const quantityMatch = quantityRegex.exec(normalized) ?? new RegExp(`(${countPattern})\\s*(?:개|대|세트|units?)\\s*(?:제작|주문|생산|만들|order|produce)`, 'i').exec(normalized);
  if (quantityMatch) changes.quantity = countValue(quantityMatch[1]);
  const spec = validateSpec({ ...current, ...changes });
  if (!Object.keys(changes).length) warnings.push('규격 변경을 찾지 못했습니다. 폭·깊이·높이·선반 수·재료·수량을 명시해 주세요.');
  warnings.push('해석 결과는 초안입니다. 저장 전 치수와 재료를 직접 확인해 주세요.');
  return { changes, spec, extractedFields: Object.keys(changes), warnings };
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function validateSources(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_SOURCES', '요청 원본의 형식을 확인해 주세요.', { sources: '객체가 필요합니다.' });
  const sources = {};
  const fields = {};
  for (const key of ['requestText', 'transcript']) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input[key])) fields[key] = '원본 내용은 4,000자 이하의 문자열이어야 합니다.';
    else sources[key] = input[key];
  }
  for (const key of ['imageId', 'imageJobId', 'audioId', 'audioJobId']) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || !UUID_PATTERN.test(input[key])) fields[key] = '서버에 저장된 파일 또는 작업 ID가 필요합니다.';
    else sources[key] = input[key];
  }
  for (const [key, extensions, idKey] of [['imageUrl', 'png|jpg', 'imageId'], ['modelUrl', 'glb', 'imageJobId']]) {
    if (input[key] === undefined) continue;
    const pattern = new RegExp(`^/uploads/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\\.(?:${extensions})$`);
    const matched = typeof input[key] === 'string' && pattern.exec(input[key]);
    if (!matched || matched[1] !== input[idKey]) fields[key] = '원본 ID와 일치하는 로컬 업로드 경로가 필요합니다.';
    else sources[key] = input[key];
  }
  if (input.imageJobId !== undefined && input.imageId === undefined) fields.imageJobId = '생성 작업의 원본 이미지 ID가 필요합니다.';
  if (input.audioJobId !== undefined && input.audioId === undefined) fields.audioJobId = '인식 작업의 원본 오디오 ID가 필요합니다.';
  if (input.transcript !== undefined && input.audioJobId === undefined) fields.transcript = '인식 완료 작업 ID가 필요합니다.';
  if (Object.keys(fields).length) throw new DomainError('INVALID_SOURCES', '요청 원본의 파일과 작업을 확인해 주세요.', fields);
  return sources;
}

export function validateQuoteInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_REQUEST', '요청 형식을 확인해 주세요.');
  const fields = {};
  if (typeof input.customer !== 'string' || !input.customer.trim() || input.customer.trim().length > 120 || /[\x00-\x1f\x7f]/.test(input.customer)) fields.customer = '고객명을 1~120자로 입력해 주세요.';
  if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.notes))) fields.notes = '메모는 2,000자 이하의 문자열이어야 합니다.';
  if (input.confirmed !== true) fields.confirmed = '치수와 재료를 확인한 후 저장해 주세요.';
  if (Object.keys(fields).length) throw new DomainError('INVALID_QUOTE', '견적 정보를 확인해 주세요.', fields);
  return { customer: input.customer.trim(), notes: (input.notes ?? '').trim(), sources: validateSources(input.sources), ...calculatePreview(input.spec) };
}

export function validateExpectedRevision(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new DomainError('INVALID_REVISION', '현재 버전을 함께 보내 주세요.', { expectedRevision: '양의 정수가 필요합니다.' });
  return value;
}

export function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet apps may evaluate leading whitespace/control characters followed by a formula.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportQuoteCsv(quote) {
  const rows = [
    ['견적 ID', quote.id], ['고객', quote.customer], ['버전', quote.revision], ['상태', quote.status],
    ['폭(mm)', quote.spec.widthMm], ['깊이(mm)', quote.spec.depthMm], ['높이(mm)', quote.spec.heightMm],
    ['선반 수', quote.spec.shelves], ['제작 수량', quote.spec.quantity], ['재료', quote.spec.material],
    [], ['부품', '규격', '수량', '단가(KRW)', '금액(KRW)'],
    ...quote.bom.map(line => [line.name, line.dimensionLabel, line.quantity, line.unitCost, line.lineTotal]),
    [], ['자재비', quote.pricing.materialCost], ['공임', quote.pricing.laborCost],
    ['견적 가산액', quote.pricing.marginAmount], ['공급가액', quote.pricing.supplyPrice],
    ['부가세', quote.pricing.vatAmount], ['합계', quote.pricing.total], ['메모', quote.notes],
    [], ...quote.pricing.assumptions.map((assumption) => ['계산 가정', assumption]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
