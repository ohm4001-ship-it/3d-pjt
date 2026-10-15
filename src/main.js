import './styles.css';
import { createShelfViewer } from './viewer.js';

const icon = (name, size = 16) => {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-5-5L5 21"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    rotate: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M7 5l10 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
    pointer: '<path d="m4 3 7 18 2-8 8-2L4 3Z"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cube}</svg>`;
};

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div class="brand" aria-label="Formworks 폼웍스"><div class="brand-mark" aria-hidden="true"></div><div class="brand-name">formworks<span>폼웍스</span></div></div>
    <nav class="topnav" aria-label="작업 공간"><span class="nav-current">제작 견적</span><div id="connection" class="connection" data-online="false"><span class="connection-dot"></span><span id="connection-text">서비스 연결 중</span></div><div class="avatar" aria-label="제작 담당자">FW</div></nav>
  </header>
  <main class="main">
    <div class="workspace-heading"><div><div class="eyebrow">MAKER WORKSPACE / SHELVING</div><h1>요구사항에서 제작 견적까지.</h1><p>진열대의 형태를 확인하고, 자재와 견적을 함께 결정하세요.</p></div><button id="new-quote" class="heading-action">${icon('plus',14)}새 견적</button></div>
    <div id="notice" class="notice" role="status" aria-live="polite" hidden><span id="notice-text"></span><button id="notice-close" aria-label="알림 닫기">×</button></div>
    <div class="workspace-grid">
      <section class="panel request-panel" aria-labelledby="request-heading">
        <div class="panel-head"><h2 id="request-heading">제작 요청</h2><span class="eyebrow">INPUT</span></div>
        <div class="panel-body">
          <label class="field-label" for="request-text">어떤 진열대를 만들까요?</label>
          <div class="request-box"><textarea id="request-text" placeholder="폭 120cm, 깊이 45cm, 높이 150cm, 선반 3개, 자작나무로 만들어 주세요."></textarea></div>
          <div class="request-buttons"><button id="apply-request" class="primary">${icon('sparkle',14)}요청 반영</button><button id="voice-request" class="secondary voice-button" aria-label="음성 요청 시작" aria-pressed="false" title="음성 요청">${icon('mic',14)}</button></div>
          <p id="request-status" class="inline-status" role="status" aria-live="polite">텍스트 또는 음성으로 규격을 변경할 수 있습니다.</p>
          <ul id="request-warnings" class="warning-list" hidden></ul>
          <label class="audio-upload">${icon('mic',13)}음성 파일에서 요청 가져오기<input id="audio-upload" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a" aria-label="음성 파일 업로드" disabled /></label><p id="audio-status" class="image-status" role="status" aria-live="polite">음성 파일 인식 서비스 연결 상태를 확인하고 있습니다.</p>
          <div class="section-rule"></div>
          <div class="section-label">제작 규격<span class="tag">mm</span></div>
          <form id="spec-form" novalidate><div class="dimension-fields">
            <div><label class="field-label" for="widthMm">폭</label><div class="input-unit"><input id="widthMm" name="widthMm" type="number" min="400" max="2400" step="1" value="1200" required /><span>mm</span></div></div>
            <div><label class="field-label" for="depthMm">깊이</label><div class="input-unit"><input id="depthMm" name="depthMm" type="number" min="250" max="900" step="1" value="450" required /><span>mm</span></div></div>
            <div><label class="field-label" for="heightMm">높이</label><div class="input-unit"><input id="heightMm" name="heightMm" type="number" min="600" max="2400" step="1" value="1500" required /><span>mm</span></div></div>
            <div><label class="field-label" for="shelves">선반</label><div class="input-unit"><input id="shelves" name="shelves" type="number" min="2" max="8" step="1" value="3" required /><span>개</span></div></div>
          </div>
          <fieldset class="material-options" style="padding:0;border:0;margin-left:0;margin-right:0"><legend class="sr-only">재료</legend><label class="material-option"><input type="radio" name="material" value="birch" checked /><span class="material-choice"><span class="swatch"></span>자작나무</span></label><label class="material-option"><input type="radio" name="material" value="steel" /><span class="material-choice"><span class="swatch steel"></span>스틸</span></label></fieldset>
          <div style="margin-top:14px"><label class="field-label" for="quantity">제작 수량</label><div class="input-unit"><input id="quantity" name="quantity" type="number" min="1" max="100" step="1" value="1" required /><span>대</span></div></div></form>
          <p id="spec-status" class="inline-status" role="status" aria-live="polite">규격을 바꾸면 3D와 견적이 함께 업데이트됩니다.</p>
          <div class="section-rule"></div>
          <div class="section-label">참고 이미지<span class="tag">선택</span></div>
          <label class="upload-zone">${icon('image',22)}<span>이미지를 추가하세요<small>JPG, PNG · 최대 8MB</small></span><input id="image-upload" type="file" accept="image/jpeg,image/png" aria-label="참고 이미지 업로드" /></label>
          <div id="image-reference" class="image-reference" hidden><img id="reference-thumbnail" alt="업로드한 진열대 참고 이미지" /><span id="reference-name"></span><button id="remove-image" class="export-button" aria-label="참고 이미지 제거">×</button></div>
          <button id="generate-image" class="secondary generate-button" disabled>${icon('cube',14)}이미지로 3D 시안 생성</button>
          <p id="image-status" class="image-status" role="status" aria-live="polite">이미지 생성 서비스 연결 상태를 확인하고 있습니다.</p>
        </div>
      </section>
      <div class="model-column">
        <section class="panel model-panel" aria-labelledby="model-heading">
          <div class="panel-head model-head"><h2 id="model-heading">3D 제작 시안</h2><span id="model-status" class="model-status"><i></i>규격 기반 설계</span></div>
          <div class="view-tabs" role="tablist" aria-label="3D 모델 종류"><button id="cad-tab" class="view-tab" role="tab" aria-selected="true" aria-controls="viewer">제작 모델</button><button id="reference-tab" class="view-tab" role="tab" aria-selected="false" aria-controls="viewer" disabled>이미지 시안</button></div>
          <div id="viewer" class="viewer" role="tabpanel" aria-labelledby="cad-tab">
            <div class="viewer-overlay"><div id="model-name" class="model-name">모듈형 진열대</div><div id="model-desc" class="model-desc">BIRCH PLYWOOD / 3 SHELVES</div></div>
            <div id="viewer-empty" class="viewer-empty" hidden></div>
            <div class="viewer-help">${icon('pointer',12)}드래그로 회전 · 스크롤로 확대</div>
            <div class="viewer-controls"><button id="reset-camera" aria-label="3D 시점 초기화" title="시점 초기화">${icon('rotate',14)}</button><button id="toggle-dimensions" aria-label="치수 표시" aria-pressed="true" title="치수 표시">${icon('expand',14)}</button></div>
          </div>
          <div class="viewer-footer"><div id="model-dimensions" class="model-dimensions">1,200 × 450 × 1,500<span>mm</span></div><button id="export-glb" class="export-button">${icon('download',13)}3D 모델 내려받기</button></div>
          <div id="model-note" class="model-note">확인한 치수로 구성한 제작 시안입니다. 최종 제작 전 하중·접합 방식과 공차를 검토하세요.</div>
        </section>
        <div class="panel workflow-panel" aria-label="견적 처리 과정"><div class="workflow-step"><span class="workflow-icon">${icon('cube',14)}</span><div><strong>규격 확인</strong><small>형태와 재료 결정</small></div></div><div class="workflow-step"><span class="workflow-icon">${icon('list',14)}</span><div><strong>견적 저장</strong><small>자재·원가 기록</small></div></div><div class="workflow-step"><span class="workflow-icon">${icon('check',14)}</span><div><strong>승인 후 발주</strong><small>확정 규격으로 진행</small></div></div></div>
      </div>
      <section class="panel quote-panel" aria-labelledby="quote-heading">
        <div class="panel-head"><h2 id="quote-heading">자재 · 제작 견적</h2><span id="bom-count" class="tag">BOM</span></div>
        <div class="panel-body"><table class="bom-table" aria-label="진열대 자재 목록"><thead><tr><th scope="col">부품 / 규격</th><th scope="col">수량</th><th scope="col">금액</th></tr></thead><tbody id="bom-body"><tr><td colspan="3">견적을 불러오는 중입니다.</td></tr></tbody></table>
          <dl class="pricing"><div class="price-row"><dt>자재비</dt><dd id="material-cost">—</dd></div><div class="price-row"><dt>제작 인건비</dt><dd id="labor-cost">—</dd></div><div class="price-row"><dt>견적 가산액 <span id="margin-rate"></span></dt><dd id="margin-cost">—</dd></div><div class="price-row"><dt>부가세 <span id="vat-rate"></span></dt><dd id="vat-cost">—</dd></div></dl>
          <div class="total"><div class="total-label">총 견적 금액<small id="total-quantity">1대 · 부가세 포함</small></div><div class="total-price"><span id="total-price">—</span><small>원</small></div></div>
          <p class="field-help">데모 단가로 계산한 예상 견적입니다. 배송·설치비는 별도입니다.</p>
        </div>
        <div class="quote-form"><div class="customer-row"><label class="field-label" for="customer">고객 / 프로젝트명 <span aria-hidden="true">*</span></label><input id="customer" maxlength="100" required placeholder="예: 성수 쇼룸 진열대" /></div><label class="field-label" for="notes">견적 메모</label><input id="notes" maxlength="1000" placeholder="요청사항 또는 납기 메모" />
          <label class="confirm-label"><input id="confirmed" type="checkbox" /><span>치수·재료·수량과 견적 금액을 확인했습니다.</span></label>
          <button id="save-quote" class="primary save-button">${icon('check',14)}견적 저장</button>
          <div id="quote-status-row" class="quote-status-row" hidden><span id="active-quote-id"></span><span id="active-status" class="status-badge"></span></div>
          <button id="status-action" class="secondary status-action" hidden></button><p id="lock-note" class="lock-note" hidden>고객이 승인한 규격입니다. 변경이 필요하면 새 견적을 작성하세요.</p>
        </div>
      </section>
    </div>
    <section class="saved-section" aria-labelledby="saved-heading"><div class="saved-heading"><div><h2 id="saved-heading">저장된 견적<span id="quotes-count">—</span></h2><p>견적을 선택하면 당시 규격과 변경 이력을 확인할 수 있습니다.</p></div><button id="refresh-quotes" class="refresh-button">${icon('rotate',12)}새로고침</button></div><div id="quotes-list" class="quotes-list" aria-live="polite"><div class="empty-quotes">저장된 견적을 불러오는 중입니다.</div></div>
      <div id="revision-panel" class="revision-panel" hidden><div class="revision-heading"><strong>견적 변경 이력</strong><a id="export-csv" class="export-csv">${icon('download',12)}견적 CSV 내려받기</a></div><ol id="history-list" class="history-list"></ol></div>
    </section>
    <footer class="page-footer"><span>FORMWORKS · 제작 담당자를 위한 견적 작업 공간</span><span>진열대 규격 설계 / 자재 산출 / 견적 승인 · MVP</span></footer>
  </main>`;

const $ = (id) => document.getElementById(id);
const money = (value) => Number(value || 0).toLocaleString('ko-KR');
const initialSpec = { widthMm: 1200, depthMm: 450, heightMm: 1500, shelves: 3, material: 'birch', quantity: 1 };
const state = { preview: null, spec: { ...initialSpec }, quote: null, dirty: false, previewPending: false, capability: false, audioCapability: false, audio: null, audioJob: null, image: null, imageJob: null, referenceJobId: null, transcriptionJobId: null, imageUploading: false, audioUploading: false, mode: 'cad', busy: false, online: false };
let previewTimer;
let previewSequence = 0;
let interpretSequence = 0;
let quoteSequence = 0;
let imageSequence = 0;
let workspaceSequence = 0;
let speechWorkspace = 0;
let speechRecognition;
let listening = false;
let viewer;

function notice(message, kind = 'info') { $('notice-text').textContent = message; $('notice').dataset.kind = kind; $('notice').hidden = false; }
$('notice-close').addEventListener('click', () => { $('notice').hidden = true; });
function inline(id, message, error = false) { $(id).textContent = message; $(id).dataset.error = String(error); }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, body: options.body ? JSON.stringify(options.body) : undefined });
  let data;
  try { data = await response.json(); } catch { throw new Error(`서비스 응답을 읽지 못했습니다 (${response.status}).`); }
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message || data.message || `요청을 처리하지 못했습니다 (${response.status}).`;
    const error = new Error(message); error.status = response.status; throw error;
  }
  return data;
}

function readSpec() {
  const result = Object.fromEntries(['widthMm','depthMm','heightMm','shelves','quantity'].map((key) => [key, Number($(key).value)]));
  result.material = document.querySelector('input[name="material"]:checked')?.value || 'birch';
  return result;
}

function writeSpec(spec) {
  for (const key of ['widthMm','depthMm','heightMm','shelves','quantity']) $(key).value = spec[key];
  const material = document.querySelector(`input[name="material"][value="${spec.material === 'steel' ? 'steel' : 'birch'}"]`);
  material.checked = true;
  state.spec = { ...spec };
}

function validateSpec(report = false) {
  const form = $('spec-form');
  if (report) return form.reportValidity();
  return form.checkValidity();
}

function invalidSpecMessage() {
  const ranges = { widthMm: ['폭',400,2400], depthMm: ['깊이',250,900], heightMm: ['높이',600,2400], shelves: ['선반 수',2,8], quantity: ['제작 수량',1,100] };
  for(const [id,[label,min,max]] of Object.entries(ranges)) if(!$(id).validity.valid) return `${label}은 ${money(min)}~${money(max)} ${['shelves','quantity'].includes(id) ? '개의 정수' : 'mm의 정수'}로 입력하세요.`;
  return '제작 규격을 확인하세요.';
}

function refreshSaveState() {
  const locked = state.quote && ['approved','ordered'].includes(state.quote.status);
  const disabled = state.busy || locked;
  const mediaBusy=state.imageUploading || state.audioUploading || Boolean(state.imageJob) || Boolean(state.audioJob);
  $('save-quote').disabled = disabled || state.previewPending || !state.preview || mediaBusy;
  $('new-quote').disabled = state.busy;
  $('save-quote').innerHTML = `${icon('check',14)}${state.busy ? '저장 중…' : state.quote ? '수정본 저장' : '견적 저장'}`;
  document.querySelectorAll('#spec-form input, #customer, #notes, #confirmed, #request-text, #apply-request, #voice-request').forEach((input) => { input.disabled = Boolean(disabled); });
  $('voice-request').disabled = Boolean(disabled) || !speechRecognition;
  $('audio-upload').disabled = Boolean(disabled) || !state.audioCapability || Boolean(state.audioJob) || state.audioUploading;
  $('image-upload').disabled = Boolean(disabled) || state.imageUploading;
  $('remove-image').disabled = Boolean(disabled);
  refreshImageState();
  $('lock-note').hidden = !locked;
  $('quote-status-row').hidden = !state.quote;
  $('status-action').hidden = !state.quote || state.quote.status === 'ordered';
  if (state.quote) {
    $('active-quote-id').textContent = `${state.quote.id} · 버전 ${state.quote.revision}`;
    $('active-status').textContent = statusLabel(state.quote.status);
    $('active-status').dataset.status = state.quote.status;
    $('status-action').textContent = ({ draft: '고객 검토 단계로 변경', sent: '고객 승인 기록', approved: '발주 확정' })[state.quote.status] || '';
    $('status-action').disabled = state.busy || state.dirty || state.previewPending || mediaBusy;
    $('status-action').title = state.dirty ? '수정본을 먼저 저장하세요.' : '';
  }
}

function renderPreview(preview) {
  state.preview = preview;
  state.spec = { ...preview.spec };
  const tbody = $('bom-body'); tbody.replaceChildren();
  for (const part of preview.bom) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const name = document.createElement('span'); name.className = 'part-name'; name.textContent = part.name;
    const size = document.createElement('span'); size.className = 'part-size'; size.textContent = part.dimensionLabel || '';
    nameCell.append(name, size);
    const quantity = document.createElement('td'); quantity.className = 'part-qty'; quantity.textContent = `${part.quantity}${part.unit || '개'}`;
    const cost = document.createElement('td'); cost.className = 'part-cost'; cost.textContent = money(part.lineTotal);
    row.append(nameCell, quantity, cost); tbody.append(row);
  }
  $('bom-count').textContent = `BOM · ${preview.bom.length}`;
  for (const [id, key] of [['material-cost','materialCost'],['labor-cost','laborCost'],['margin-cost','marginAmount'],['vat-cost','vatAmount'],['total-price','total']]) $(id).textContent = money(preview.pricing[key]);
  $('margin-rate').textContent = `${Math.round(preview.pricing.marginRate * 100)}%`;
  $('vat-rate').textContent = `${Math.round(preview.pricing.vatRate * 100)}%`;
  $('total-quantity').textContent = `${preview.spec.quantity}대 · 부가세 포함`;
  $('model-dimensions').replaceChildren(document.createTextNode(`${money(preview.spec.widthMm)} × ${money(preview.spec.depthMm)} × ${money(preview.spec.heightMm)}`));
  const mm = document.createElement('span'); mm.textContent = 'mm'; $('model-dimensions').append(mm);
  $('model-desc').textContent = `${preview.spec.material === 'birch' ? 'BIRCH PLYWOOD' : 'STEEL PANEL'} / ${preview.spec.shelves} SHELVES`;
  viewer?.update(preview.spec, preview.geometry);
  refreshSaveState();
}

async function updatePreview() {
  clearTimeout(previewTimer);
  if (!validateSpec()) { state.previewPending = false; state.preview = null; inline('spec-status',invalidSpecMessage(), true); refreshSaveState(); return false; }
  const sequence = ++previewSequence;
  state.previewPending = true; refreshSaveState();
  inline('spec-status','규격과 견적을 계산하고 있습니다…');
  try {
    const preview = await api('/api/preview', { method: 'POST', body: { spec: readSpec() } });
    if (sequence !== previewSequence) return false;
    state.previewPending = false; renderPreview(preview);
    inline('spec-status',state.dirty ? '변경한 규격을 반영했습니다. 수정본을 저장하세요.' : '현재 규격을 3D와 견적에 반영했습니다.');
    return true;
  } catch (error) {
    if (sequence !== previewSequence) return false;
    state.previewPending = false; state.preview = null;
    inline('spec-status',error.message, true); refreshSaveState();
    return false;
  }
}

function markDirty() { state.dirty = true; $('confirmed').checked = false; refreshSaveState(); }
$('spec-form').addEventListener('submit',(event)=>event.preventDefault());
$('spec-form').addEventListener('input', () => { ++previewSequence; ++interpretSequence; markDirty(); state.previewPending = true; refreshSaveState(); inline('spec-status','규격을 반영하는 중입니다…'); clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 280); });
$('request-text').addEventListener('input',()=>{++interpretSequence;markDirty();});
['customer','notes'].forEach((id) => $(id).addEventListener('input', markDirty));

$('apply-request').addEventListener('click', async () => {
  const text = $('request-text').value.trim();
  if (!text) { inline('request-status','요청 내용을 입력하세요.', true); $('request-text').focus(); return; }
  if (!validateSpec(true)) return;
  const sequence = ++interpretSequence;
  $('apply-request').disabled = true; inline('request-status','요청에서 규격을 확인하고 있습니다…');
  try {
    const result = await api('/api/interpret', { method: 'POST', body: { text, currentSpec: readSpec() } });
    if(sequence !== interpretSequence) { inline('request-status','입력이 변경되어 이전 요청을 반영하지 않았습니다. 요청 반영을 다시 누르세요.'); return; }
    writeSpec(result.spec); markDirty();
    const warnings = $('request-warnings'); warnings.replaceChildren();
    for (const warning of result.warnings || []) { const item = document.createElement('li'); item.textContent = typeof warning === 'string' ? warning : warning.message; warnings.append(item); }
    warnings.hidden = warnings.childElementCount === 0;
    inline('request-status', Object.keys(result.changes || {}).length ? '요청을 반영했습니다. 아래 규격을 확인하세요.' : '변경할 규격을 찾지 못했습니다. 치수와 단위를 포함해 주세요.');
    await updatePreview();
  } catch(error) { inline('request-status',error.message,true); }
  finally { refreshSaveState(); }
});

function statusLabel(status) { return ({ draft: '작성 중', sent: '고객 검토', approved: '승인 완료', ordered: '발주 완료' })[status] || status; }
function resetMediaState() {
  ++workspaceSequence; ++imageSequence;
  if(listening) speechRecognition?.stop();
  state.image=null;state.imageJob=null;state.audio=null;state.audioJob=null;state.referenceJobId=null;state.transcriptionJobId=null;state.imageUploading=false;state.audioUploading=false;
  viewer?.clearReference();$('reference-tab').disabled=true;$('image-reference').hidden=true;$('reference-thumbnail').removeAttribute('src');$('image-upload').value='';$('audio-upload').value='';switchMode('cad');
  inline('audio-status',state.audioCapability?'MP3, WAV, M4A · 최대 8MB · 인식한 문장을 확인 후 반영하세요.':'음성 파일 인식 서비스가 연결되지 않았습니다. 텍스트로 요청을 입력하세요.');
  refreshImageState();
}
function clearActiveQuote() {
  if(state.busy)return;
  ++interpretSequence; ++quoteSequence; resetMediaState();
  state.quote = null; state.dirty = false; $('customer').value = ''; $('notes').value = ''; $('confirmed').checked = false; $('revision-panel').hidden = true;
  writeSpec(initialSpec); $('request-text').value = ''; $('request-warnings').hidden = true;
  inline('request-status','텍스트 또는 음성으로 규격을 변경할 수 있습니다.');
  state.image = null; $('image-reference').hidden = true; $('image-upload').value = ''; $('reference-tab').disabled=true; refreshImageState(); switchMode('cad');
  refreshSaveState(); renderQuoteCards(); updatePreview();
}
$('new-quote').addEventListener('click', () => { clearActiveQuote(); notice('새 견적을 시작했습니다. 고객명과 제작 규격을 입력하세요.'); });

let quotes = [];
async function loadQuotes() {
  $('refresh-quotes').disabled = true;
  try { const result = await api('/api/quotes'); quotes = result.quotes; renderQuoteCards(); }
  catch(error) { const empty = document.createElement('div'); empty.className='empty-quotes'; empty.textContent=`견적 목록을 불러오지 못했습니다. ${error.message}`; $('quotes-list').replaceChildren(empty); }
  finally { $('refresh-quotes').disabled = false; }
}

function renderQuoteCards() {
  const container = $('quotes-list'); container.replaceChildren(); $('quotes-count').textContent = `${quotes.length}개`;
  if (!quotes.length) { const empty = document.createElement('div'); empty.className='empty-quotes'; empty.textContent='아직 저장된 견적이 없습니다. 제작 규격을 확인하고 첫 견적을 저장하세요.'; container.append(empty); return; }
  for(const quote of quotes) {
    const card = document.createElement('button'); card.className='quote-card'; card.dataset.quoteId=quote.id; card.setAttribute('aria-current',String(state.quote?.id===quote.id));
    const top=document.createElement('div'); top.className='quote-card-top'; const id=document.createElement('span'); id.className='quote-card-id'; id.textContent=`${quote.id} · v${quote.revision}`;
    const status=document.createElement('span'); status.className='status-badge'; status.dataset.status=quote.status; status.textContent=statusLabel(quote.status); top.append(id,status);
    const name=document.createElement('strong'); name.textContent=quote.customer;
    const bottom=document.createElement('div'); bottom.className='quote-card-bottom'; const spec=document.createElement('span'); spec.className='quote-card-spec'; spec.textContent=`${quote.spec.widthMm} × ${quote.spec.depthMm} × ${quote.spec.heightMm} mm · ${quote.spec.quantity}대`;
    const cost=document.createElement('span'); cost.className='quote-card-price'; cost.textContent=`${money(quote.pricing.total)}원`; bottom.append(spec,cost); card.append(top,name,bottom);
    card.addEventListener('click',()=>openQuote(quote.id)); container.append(card);
  }
}

function renderHistory(quote) {
  $('revision-panel').hidden=false; $('export-csv').href=`/api/quotes/${encodeURIComponent(quote.id)}/export.csv`; $('export-csv').download=`${quote.id}.csv`;
  const history=$('history-list'); history.replaceChildren();
  for(const entry of quote.history || []) {
    const item=document.createElement('li'); item.className='history-item';
    const title=document.createElement('strong'); title.textContent=`버전 ${entry.revision} · ${entry.type === 'status' || ['sent','approved','ordered'].includes(entry.type) ? statusLabel(entry.status) : entry.type === 'created' || entry.type === 'create' ? '견적 생성' : '규격 저장'}`;
    const time=document.createElement('time'); time.dateTime=entry.at; time.textContent=new Date(entry.at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
    item.append(title,time); history.append(item);
  }
}

function setActiveQuote(quote) {
  ++interpretSequence;
  if(listening) speechRecognition?.stop();
  ++previewSequence; clearTimeout(previewTimer); state.previewPending=false; state.quote=quote; state.dirty=false;
  resetMediaState();
  writeSpec(quote.spec); $('customer').value=quote.customer; $('notes').value=quote.notes || ''; $('confirmed').checked=false;
  const sources=quote.sources || {}; $('request-text').value=sources.requestText || ''; $('request-warnings').hidden=true;
  if(sources.imageId){state.image={id:sources.imageId,url:sources.imageUrl};state.referenceJobId=sources.imageJobId || null;$('reference-thumbnail').src=sources.imageUrl;$('reference-name').textContent='저장된 참고 이미지';$('image-reference').hidden=false;}
  if(sources.audioId){state.audio={id:sources.audioId};state.transcriptionJobId=sources.audioJobId || null;inline('audio-status',sources.transcript?'저장된 음성 전사 결과와 요청 원문을 불러왔습니다.':'저장된 음성 자료가 연결되어 있습니다.');}
  if(sources.modelUrl){const workspace=workspaceSequence;viewer?.loadReference(sources.modelUrl,()=>workspace===workspaceSequence).then((loaded)=>{if(loaded && workspace===workspaceSequence)$('reference-tab').disabled=false;}).catch(()=>{if(workspace===workspaceSequence)inline('image-status','저장된 3D 시안을 읽지 못했습니다. 참고 이미지는 확인할 수 있습니다.',true);});}
  renderPreview({spec:quote.spec,bom:quote.bom,pricing:quote.pricing,geometry:quote.geometry}); renderHistory(quote); refreshSaveState(); renderQuoteCards();
  inline('spec-status', ['approved','ordered'].includes(quote.status) ? '승인된 제작 규격을 불러왔습니다.' : '저장된 규격을 불러왔습니다. 변경 후 수정본을 저장할 수 있습니다.');
}

async function openQuote(id) {
  if(state.busy) return;
  const sequence=++quoteSequence;
  try { const result=await api(`/api/quotes/${encodeURIComponent(id)}`); if(sequence!==quoteSequence)return; setActiveQuote(result.quote); switchMode('cad'); notice(`${result.quote.customer} 견적을 불러왔습니다.`); }
  catch(error){ notice(error.message,'error'); }
}
$('refresh-quotes').addEventListener('click',loadQuotes);

$('save-quote').addEventListener('click',async()=>{
  if(state.busy) return;
  if(!validateSpec(true)) return;
  if(!$('customer').value.trim()) { notice('고객 / 프로젝트명을 입력하세요.','error'); $('customer').focus(); return; }
  if(!$('confirmed').checked) { notice('치수·재료·수량과 견적 금액을 확인한 뒤 체크해 주세요.','error'); $('confirmed').focus(); return; }
  if(!state.preview || state.previewPending) { notice('견적 계산이 완료된 뒤 다시 저장하세요.','error'); return; }
  state.busy=true; refreshSaveState();
  const quote=state.quote;
  const sources={requestText:$('request-text').value,...(state.image?{imageId:state.image.id}:{}),...(state.referenceJobId?{imageJobId:state.referenceJobId}:{}),...(state.audio?{audioId:state.audio.id}:{}),...(state.transcriptionJobId?{audioJobId:state.transcriptionJobId}:{})};
  const body={customer:$('customer').value.trim(),notes:$('notes').value.trim(),spec:readSpec(),confirmed:true,sources,...(quote ? {expectedRevision:quote.revision} : {})};
  try {
    const result=await api(quote ? `/api/quotes/${encodeURIComponent(quote.id)}/revisions` : '/api/quotes',{method:'POST',body});
    setActiveQuote(result.quote); await loadQuotes(); notice(quote ? '수정본을 저장했습니다. 최신 버전에서 고객 검토를 진행하세요.' : '견적을 저장했습니다. 고객 검토 단계로 진행할 수 있습니다.','success');
  }catch(error){ notice(error.status===409 ? `${error.message} 저장된 견적을 다시 불러와 최신 버전을 확인하세요.` : error.message,'error'); }
  finally{state.busy=false;refreshSaveState();}
});

$('status-action').addEventListener('click',async()=>{
  if(!state.quote || state.busy || state.dirty) return;
  const next=({draft:'sent',sent:'approved',approved:'ordered'})[state.quote.status]; if(!next)return;
  state.busy=true;refreshSaveState();
  try { const result=await api(`/api/quotes/${encodeURIComponent(state.quote.id)}/status`,{method:'POST',body:{status:next,expectedRevision:state.quote.revision,expectedStatus:state.quote.status}}); setActiveQuote(result.quote);await loadQuotes();notice(`${statusLabel(next)} 상태로 변경했습니다.`,'success'); }
  catch(error){notice(error.message,'error');}
  finally{state.busy=false;refreshSaveState();}
});

function setupSpeech(){
  const Recognition=window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Recognition){$('voice-request').disabled=true;$('voice-request').title='이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트로 입력하세요.';inline('request-status','음성 인식을 지원하지 않는 브라우저입니다. 텍스트로 요청을 입력하세요.');return;}
  speechRecognition=new Recognition();speechRecognition.lang='ko-KR';speechRecognition.continuous=false;speechRecognition.interimResults=true;
  speechRecognition.onresult=(event)=>{if(speechWorkspace!==workspaceSequence)return;const transcript=Array.from(event.results).map((result)=>result[0].transcript).join(' ');$('request-text').value=transcript;++interpretSequence;markDirty();inline('request-status','인식한 문장을 확인한 뒤 요청 반영을 누르세요.');};
  speechRecognition.onerror=(event)=>{inline('request-status',event.error==='not-allowed'?'마이크 권한을 허용하거나 텍스트로 입력하세요.':'음성을 인식하지 못했습니다. 다시 시작하거나 텍스트로 입력하세요.',true);};
  speechRecognition.onend=()=>{listening=false;$('voice-request').setAttribute('aria-pressed','false');$('voice-request').setAttribute('aria-label','음성 요청 시작');};
  $('voice-request').addEventListener('click',()=>{if(listening){speechRecognition.stop();return;}try{speechWorkspace=workspaceSequence;speechRecognition.start();listening=true;$('voice-request').setAttribute('aria-pressed','true');$('voice-request').setAttribute('aria-label','음성 요청 중지');inline('request-status','듣고 있습니다. 치수와 재료를 말씀해 주세요.');}catch{inline('request-status','음성 인식을 시작할 수 없습니다. 텍스트로 입력하세요.',true);}});
}

function refreshImageState(){
  $('generate-image').disabled=!viewer || !state.capability || !state.image || Boolean(state.imageJob) || state.imageUploading || state.busy || Boolean(state.quote && ['approved','ordered'].includes(state.quote.status));
  if(!state.capability) $('image-status').textContent='3D 생성 서비스가 연결되지 않았습니다. 이미지를 참고하고 제작 규격을 직접 입력하세요.';
  else if(!state.image) $('image-status').textContent='참고 이미지를 올린 뒤 3D 시안을 생성할 수 있습니다.';
}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('이미지 파일을 읽지 못했습니다.'));reader.readAsDataURL(file);});}
$('audio-upload').addEventListener('change',async(event)=>{
  const file=event.target.files?.[0];if(!file || !state.audioCapability || state.audioJob || state.audioUploading)return;
  if(file.size>8*1024*1024){inline('audio-status','8MB 이하의 음성 파일을 선택하세요.',true);event.target.value='';return;}
  const workspace=workspaceSequence;state.audioUploading=true;refreshSaveState();$('audio-upload').disabled=true;inline('audio-status','음성 파일을 업로드하고 있습니다…');
  try{
    const dataUrl=await fileAsDataUrl(file);if(workspace!==workspaceSequence)return;
    const upload=await api('/api/audio',{method:'POST',body:{dataUrl}});if(workspace!==workspaceSequence)return;
    state.audio=upload.audio || upload;state.transcriptionJobId=null;markDirty();
    const jobResult=await api(`/api/audio/${encodeURIComponent(state.audio.id)}/transcribe`,{method:'POST',body:{}});if(workspace!==workspaceSequence)return;
    state.audioJob=(jobResult.job || jobResult).id;state.audioUploading=false;refreshSaveState();await pollAudioJob(state.audioJob,workspace);
  }
  catch(error){if(workspace===workspaceSequence){state.audioJob=null;inline('audio-status',error.message,true);}}
  finally{if(workspace===workspaceSequence){state.audioUploading=false;event.target.value='';refreshSaveState();}}
});
async function pollAudioJob(id,workspace){
  const result=await api(`/api/jobs/${encodeURIComponent(id)}`);const job=result.job || result;
  if(workspace!==workspaceSequence || state.audioJob!==id)return;
  if(job.status==='completed'){state.audioJob=null;state.transcriptionJobId=id;$('request-text').value=job.text || '';++interpretSequence;markDirty();inline('audio-status','음성을 텍스트로 가져왔습니다. 문장을 확인한 뒤 요청 반영을 누르세요.');refreshSaveState();return;}
  if(job.status==='failed'){state.audioJob=null;throw new Error(typeof job.error==='string'?job.error:'음성 인식에 실패했습니다. 다른 파일을 선택하세요.');}
  inline('audio-status',job.status==='queued'?'음성 인식 대기 중입니다…':'음성에서 요청 내용을 인식하고 있습니다…');
  await new Promise((resolve)=>setTimeout(resolve,1800));if(workspace===workspaceSequence && state.audioJob===id)await pollAudioJob(id,workspace);
}
$('image-upload').addEventListener('change',async(event)=>{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>8*1024*1024 || !['image/jpeg','image/png'].includes(file.type)){notice('8MB 이하의 JPG, PNG 이미지를 선택하세요.','error');event.target.value='';return;}
  const sequence=++imageSequence;const workspace=workspaceSequence;state.imageUploading=true;state.imageJob=null;state.referenceJobId=null;viewer?.clearReference();$('reference-tab').disabled=true;switchMode('cad');refreshSaveState();
  inline('image-status','참고 이미지를 업로드하고 있습니다…');$('image-upload').disabled=true;
  try{const dataUrl=await fileAsDataUrl(file);if(sequence!==imageSequence || workspace!==workspaceSequence)return;const result=await api('/api/images',{method:'POST',body:{dataUrl}});if(sequence!==imageSequence || workspace!==workspaceSequence)return;state.image=result.image || result;markDirty();$('reference-thumbnail').src=state.image.url;$('reference-name').textContent=file.name;$('image-reference').hidden=false;inline('image-status',state.capability?'이미지를 추가했습니다. 3D 시안을 생성할 수 있습니다.':'이미지를 추가했습니다. 생성 서비스 연결 후 3D 시안을 만들 수 있습니다.');}
  catch(error){if(sequence===imageSequence && workspace===workspaceSequence)inline('image-status',error.message,true);}
  finally{if(sequence===imageSequence && workspace===workspaceSequence){state.imageUploading=false;refreshSaveState();}}
});
$('remove-image').addEventListener('click',()=>{++imageSequence;state.image=null;state.imageJob=null;state.referenceJobId=null;state.imageUploading=false;viewer?.clearReference();$('reference-tab').disabled=true;switchMode('cad');$('image-reference').hidden=true;$('image-upload').value='';markDirty();refreshImageState();});
$('generate-image').addEventListener('click',async()=>{
  if(!state.image || !state.capability || state.imageJob)return;
  const sequence=imageSequence;const workspace=workspaceSequence;state.imageJob='starting';refreshSaveState();
  try{const job=await api(`/api/images/${encodeURIComponent(state.image.id)}/generate`,{method:'POST',body:{}});if(sequence!==imageSequence || workspace!==workspaceSequence)return;state.imageJob=(job.job || job).id;inline('image-status','3D 시안을 생성하고 있습니다. 생성에는 수 분이 걸릴 수 있습니다.');await pollJob(state.imageJob,workspace,sequence);}
  catch(error){if(sequence===imageSequence && workspace===workspaceSequence){state.imageJob=null;inline('image-status',error.message,true);refreshSaveState();}}
});
async function pollJob(id,workspace,sequence){
  const result=await api(`/api/jobs/${encodeURIComponent(id)}`);const job=result.job || result;
  if(workspace!==workspaceSequence || sequence!==imageSequence || state.imageJob!==id)return;
  if(job.status==='completed'){
    if(!job.modelUrl)throw new Error('생성한 모델 주소가 없습니다. 생성 서비스 응답을 확인하세요.');
    const loaded=await viewer?.loadReference(job.modelUrl,()=>workspace===workspaceSequence && sequence===imageSequence && state.imageJob===id);
    if(!loaded || workspace!==workspaceSequence || sequence!==imageSequence || state.imageJob!==id)return;
    state.imageJob=null;state.referenceJobId=id;markDirty();$('reference-tab').disabled=false;switchMode('reference');inline('image-status','3D 시안을 생성했습니다. 제작 규격은 제작 모델에서 확인하세요.');refreshSaveState();return;
  }
  if(job.status==='failed'){state.imageJob=null;throw new Error(typeof job.error==='string'?job.error:'3D 생성에 실패했습니다. 이미지를 바꾸거나 다시 시도하세요.');}
  inline('image-status',job.status==='queued'?'3D 생성 대기 중입니다…':'3D 시안을 생성하고 있습니다…');
  await new Promise((resolve)=>setTimeout(resolve,2500));
  if(workspace===workspaceSequence && sequence===imageSequence && state.imageJob===id) await pollJob(id,workspace,sequence);
}
function switchMode(mode){
  state.mode=mode;viewer?.setMode(mode);$('cad-tab').setAttribute('aria-selected',String(mode==='cad'));$('reference-tab').setAttribute('aria-selected',String(mode==='reference'));$('viewer').setAttribute('aria-labelledby',mode==='cad'?'cad-tab':'reference-tab');
  $('model-name').textContent=mode==='cad'?'모듈형 진열대':'이미지 기반 참고 시안';$('model-status').lastChild.textContent=mode==='cad'?'규격 기반 설계':'외형 참고용';
  $('model-note').textContent=mode==='cad'?'확인한 치수로 구성한 제작 시안입니다. 최종 제작 전 하중·접합 방식과 공차를 검토하세요.':'이미지에서 생성한 외형 참고용 시안입니다. 치수와 자재·견적은 제작 모델에 입력한 규격을 사용합니다.';
  $('toggle-dimensions').disabled=mode!=='cad';
}
$('cad-tab').addEventListener('click',()=>switchMode('cad'));$('reference-tab').addEventListener('click',()=>switchMode('reference'));
document.querySelector('.view-tabs').addEventListener('keydown',(event)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[$('cad-tab'),$('reference-tab')].filter((tab)=>!tab.disabled);const current=tabs.indexOf(document.activeElement);if(current<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();});
$('reset-camera').addEventListener('click',()=>viewer?.resetCamera());
$('toggle-dimensions').addEventListener('click',()=>{const shown=$('toggle-dimensions').getAttribute('aria-pressed')!=='true';$('toggle-dimensions').setAttribute('aria-pressed',String(shown));viewer?.toggleDimensions(shown);});
$('export-glb').addEventListener('click',async()=>{if(!viewer){notice('3D 화면이 준비되지 않았습니다.','error');return;}try{await viewer.exportGlb();notice('3D 모델을 내려받았습니다.','success');}catch(error){notice(`모델을 내려받지 못했습니다. ${error.message}`,'error');}});

async function initialize(){
  try{viewer=createShelfViewer($('viewer'));}catch(error){$('viewer-empty').hidden=false;$('viewer-empty').textContent='3D 화면을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.';$('export-glb').disabled=true;}
  setupSpeech();
  try{const health=await api('/api/health');state.online=true;$('connection').dataset.online='true';$('connection-text').textContent='서비스 연결됨';state.capability=Boolean(health.capabilities?.imageGeneration || health.imageGeneration);state.audioCapability=Boolean(health.capabilities?.audioTranscription || health.audioTranscription);}catch(error){notice(`서비스에 연결하지 못했습니다. 서버를 시작한 뒤 새로고침하세요. ${error.message}`,'error');$('connection-text').textContent='연결 확인 필요';}
  inline('audio-status',state.audioCapability?'MP3, WAV, M4A · 최대 8MB · 인식한 문장을 확인 후 반영하세요.':'음성 파일 인식 서비스가 연결되지 않았습니다. 텍스트로 요청을 입력하세요.');refreshSaveState();
  refreshImageState();await Promise.all([updatePreview(),loadQuotes()]);
}
initialize();
