import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DomainError, validateQuoteInput, validateExpectedRevision } from './domain.mjs';

const STATUS_FROM = { sent: 'draft', approved: 'sent', ordered: 'approved' };

export function createQuoteStore(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL CHECK(revision > 0),
      status TEXT NOT NULL CHECK(status IN ('draft','sent','approved','ordered')),
      customer TEXT NOT NULL,
      notes TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      bom_json TEXT NOT NULL,
      pricing_json TEXT NOT NULL,
      geometry_json TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '{}',
      approved_revision INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quote_revisions (
      quote_id TEXT NOT NULL REFERENCES quotes(id),
      revision INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      customer TEXT NOT NULL,
      notes TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      bom_json TEXT NOT NULL,
      pricing_json TEXT NOT NULL,
      geometry_json TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      PRIMARY KEY(quote_id, revision)
    );
    CREATE TABLE IF NOT EXISTS quote_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id TEXT NOT NULL REFERENCES quotes(id),
      revision INTEGER NOT NULL,
      event TEXT NOT NULL,
      created_at TEXT NOT NULL,
      details_json TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS immutable_quote_revision_update
      BEFORE UPDATE ON quote_revisions BEGIN SELECT RAISE(ABORT, 'Quote history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_quote_revision_delete
      BEFORE DELETE ON quote_revisions BEGIN SELECT RAISE(ABORT, 'Quote history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_quote_audit_update
      BEFORE UPDATE ON quote_audit BEGIN SELECT RAISE(ABORT, 'Quote audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_quote_audit_delete
      BEFORE DELETE ON quote_audit BEGIN SELECT RAISE(ABORT, 'Quote audit is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_approved_quote
      BEFORE UPDATE ON quotes
      WHEN OLD.approved_revision IS NOT NULL AND (
        NEW.spec_json != OLD.spec_json OR NEW.bom_json != OLD.bom_json OR
        NEW.pricing_json != OLD.pricing_json OR NEW.geometry_json != OLD.geometry_json OR NEW.customer != OLD.customer OR
        NEW.notes != OLD.notes OR NEW.approved_revision != OLD.approved_revision OR
        NEW.approved_revision IS NULL
      ) BEGIN SELECT RAISE(ABORT, 'Approved quote is immutable'); END;
  `);
  // Additive migration keeps the first MVP's existing quotes and history intact.
  for (const table of ['quotes', 'quote_revisions']) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === 'sources_json')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN sources_json TEXT NOT NULL DEFAULT '{}'`);
    }
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_approved_quote_sources
    BEFORE UPDATE OF sources_json ON quotes
    WHEN OLD.approved_revision IS NOT NULL AND NEW.sources_json != OLD.sources_json
    BEGIN SELECT RAISE(ABORT, 'Approved quote sources are immutable'); END;`);
  const getRow = db.prepare('SELECT * FROM quotes WHERE id = ?');
  const historyRows = db.prepare('SELECT * FROM quote_revisions WHERE quote_id = ? ORDER BY revision DESC');
  const insertRevision = db.prepare(`INSERT INTO quote_revisions (
    quote_id, revision, event_type, status, customer, notes, spec_json, bom_json, pricing_json, geometry_json, sources_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAudit = db.prepare('INSERT INTO quote_audit (quote_id,revision,event,created_at,details_json) VALUES (?,?,?,?,?)');

  function serialize(row, withHistory = true) {
    const quote = {
      id: row.id, revision: row.revision, status: row.status, customer: row.customer, notes: row.notes,
      spec: JSON.parse(row.spec_json), bom: JSON.parse(row.bom_json), pricing: JSON.parse(row.pricing_json),
      geometry: JSON.parse(row.geometry_json),
      sources: JSON.parse(row.sources_json),
      approvedRevision: row.approved_revision, createdAt: row.created_at, updatedAt: row.updated_at,
    };
    if (withHistory) {
      quote.history = historyRows.all(row.id).map(history => ({
        revision: history.revision, type: history.event_type, status: history.status,
        customer: history.customer, notes: history.notes, spec: JSON.parse(history.spec_json),
        bom: JSON.parse(history.bom_json), pricing: JSON.parse(history.pricing_json), at: history.created_at,
        geometry: JSON.parse(history.geometry_json),
        sources: JSON.parse(history.sources_json),
      }));
      quote.audit = db.prepare('SELECT revision,event,created_at,details_json FROM quote_audit WHERE quote_id=? ORDER BY id DESC').all(row.id)
        .map(item => ({ revision: item.revision, event: item.event, at: item.created_at, details: JSON.parse(item.details_json) }));
    }
    return quote;
  }
  function requiredRow(id) {
    const row = getRow.get(id);
    if (!row) throw new DomainError('QUOTE_NOT_FOUND', '견적을 찾을 수 없습니다.', undefined, 404);
    return row;
  }
  function checkRevision(row, expected) {
    validateExpectedRevision(expected);
    if (row.revision !== expected) throw new DomainError('REVISION_CONFLICT', '견적이 다른 화면에서 변경되었습니다. 최신 버전을 불러와 주세요.', { currentRevision: row.revision }, 409);
  }
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function record(row, type, details = {}) {
    insertRevision.run(row.id, row.revision, type, row.status, row.customer, row.notes,
      row.spec_json, row.bom_json, row.pricing_json, row.geometry_json, row.sources_json, row.updated_at);
    insertAudit.run(row.id, row.revision, type, row.updated_at, JSON.stringify({ ...details, sources: JSON.parse(row.sources_json) }));
  }
  function create(input) {
    const validated = validateQuoteInput(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    return transaction(() => {
      db.prepare(`INSERT INTO quotes (id,revision,status,customer,notes,spec_json,bom_json,pricing_json,geometry_json,sources_json,created_at,updated_at)
        VALUES (?,1,'draft',?,?,?,?,?,?,?,?,?)`).run(id, validated.customer, validated.notes,
        JSON.stringify(validated.spec), JSON.stringify(validated.bom), JSON.stringify(validated.pricing), JSON.stringify(validated.geometry), JSON.stringify(validated.sources), now, now);
      const row = requiredRow(id);
      record(row, 'created', { dimensionsConfirmed: true });
      return serialize(row);
    });
  }
  function revise(id, input) {
    const validated = validateQuoteInput(input);
    validateExpectedRevision(input.expectedRevision);
    return transaction(() => {
      const row = requiredRow(id);
      checkRevision(row, input.expectedRevision);
      if (row.approved_revision !== null || ['approved', 'ordered'].includes(row.status)) throw new DomainError('QUOTE_LOCKED', '승인된 견적은 수정할 수 없습니다. 새 견적으로 작성해 주세요.', undefined, 409);
      const now = new Date().toISOString();
      // A new design invalidates the sent offer and requires another send/approval.
      db.prepare(`UPDATE quotes SET revision=revision+1,status='draft',customer=?,notes=?,spec_json=?,bom_json=?,pricing_json=?,geometry_json=?,sources_json=?,updated_at=? WHERE id=? AND revision=?`)
        .run(validated.customer, validated.notes, JSON.stringify(validated.spec), JSON.stringify(validated.bom), JSON.stringify(validated.pricing), JSON.stringify(validated.geometry), JSON.stringify(validated.sources), now, id, input.expectedRevision);
      const updated = requiredRow(id);
      record(updated, 'revised', { previousRevision: row.revision, previousStatus: row.status, dimensionsConfirmed: true });
      return serialize(updated);
    });
  }
  function transition(id, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.hasOwn(STATUS_FROM, input.status)) throw new DomainError('INVALID_STATUS', '발송, 승인, 발주 중 다음 상태를 선택해 주세요.', { status: 'sent | approved | ordered' });
    validateExpectedRevision(input.expectedRevision);
    return transaction(() => {
      const row = requiredRow(id);
      checkRevision(row, input.expectedRevision);
      if (row.status !== STATUS_FROM[input.status]) throw new DomainError('INVALID_TRANSITION', '견적은 초안 → 발송 → 승인 → 발주 순서로 진행합니다.', { currentStatus: row.status }, 409);
      if (input.expectedStatus !== undefined && input.expectedStatus !== row.status) throw new DomainError('STATUS_CONFLICT', '견적 상태가 변경되었습니다. 최신 버전을 불러와 주세요.', { currentStatus: row.status }, 409);
      const nextRevision = row.revision + 1;
      const approvedRevision = input.status === 'approved' ? nextRevision : row.approved_revision;
      db.prepare('UPDATE quotes SET revision=?,status=?,approved_revision=?,updated_at=? WHERE id=? AND revision=?')
        .run(nextRevision, input.status, approvedRevision, new Date().toISOString(), id, input.expectedRevision);
      const updated = requiredRow(id);
      record(updated, input.status, { previousStatus: row.status, previousRevision: row.revision, approvedRevision });
      return serialize(updated);
    });
  }
  return {
    db, create, revise, transition,
    get: id => serialize(requiredRow(id)),
    list: () => db.prepare('SELECT * FROM quotes ORDER BY updated_at DESC, id LIMIT 200').all().map(row => serialize(row, false)),
    close: () => db.close(),
  };
}
