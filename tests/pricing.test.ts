import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_COMMISSION,
  IVA_RATE,
  RETENTION_RATE,
  STRIPE_RATE,
  calculateFamilyPrice,
  calculateNurseNet,
  calculatePlatformRevenue,
  calculateShiftPrice,
  getSuggestedRate,
  getAllSpecializations,
} from '../src/data/standardRates';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOLERANCE = 1e-9;

function closeTo(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < TOLERANCE,
    `${label}: expected ${expected}, got ${actual}`
  );
}

test('constantes de pricing', () => {
  assert.equal(PLATFORM_COMMISSION, 5);
  assert.equal(IVA_RATE, 0.13);
  assert.equal(RETENTION_RATE, 0.1);
  assert.equal(STRIPE_RATE, 0.035);
});

test('calculateFamilyPrice', () => {
  closeTo(calculateFamilyPrice(20, true), 25.65, 'family(20, invoiced)');
  assert.equal(calculateFamilyPrice(20, false), 20);
  closeTo(calculateFamilyPrice(25, true), 30.65, 'family(25, invoiced)');
});

test('calculateNurseNet', () => {
  closeTo(calculateNurseNet(20, true), 18, 'nurseNet(20, invoiced)');
  assert.equal(calculateNurseNet(20, false), 20);
  closeTo(calculateNurseNet(28, true), 25.2, 'nurseNet(28, invoiced)');
});

test('calculatePlatformRevenue', () => {
  closeTo(calculatePlatformRevenue(20, true, false), 3.0, 'revenue(20, invoiced, sin tarjeta)');
  closeTo(calculatePlatformRevenue(20, true, true), 3.0 - 25.65 * 0.035, 'revenue(20, invoiced, con tarjeta)');
  assert.equal(calculatePlatformRevenue(20, false, false), 0);
  assert.equal(calculatePlatformRevenue(20, false, true), 0);
});

test('calculateShiftPrice', () => {
  closeTo(calculateShiftPrice(20, 3, true), 76.95, 'shift(20, 3, invoiced)');
  assert.equal(calculateShiftPrice(20, 2, false), 40);
  assert.equal(calculateShiftPrice(20, 1), 20);
  assert.equal(calculateShiftPrice(20), 20);
});

test('getSuggestedRate', () => {
  assert.equal(getSuggestedRate('Geriatría'), 25);
  assert.equal(getSuggestedRate('no-existe'), 20);
});

test('getAllSpecializations', () => {
  const specs = getAllSpecializations();
  assert.equal(specs.length, 12);
  assert.equal(new Set(specs).size, specs.length, 'especializaciones duplicadas');
});

test('paridad con migración SQL (comisión e IVA)', () => {
  const sql = readFileSync(
    join(ROOT, 'supabase/migrations/20260731_multislot_accept_offer_and_perf.sql'),
    'utf8'
  );
  const commissionMatch = sql.match(/v_platform_commission\s+NUMERIC\s*:=\s*([0-9.]+)/);
  const ivaMatch = sql.match(/v_iva_rate\s+NUMERIC\s*:=\s*([0-9.]+)/);
  assert.ok(commissionMatch, 'No se encontró v_platform_commission NUMERIC := <num> en la migración');
  assert.ok(ivaMatch, 'No se encontró v_iva_rate NUMERIC := <num> en la migración');
  closeTo(parseFloat(commissionMatch[1]), PLATFORM_COMMISSION, 'v_platform_commission vs PLATFORM_COMMISSION');
  closeTo(parseFloat(ivaMatch[1]), IVA_RATE, 'v_iva_rate vs IVA_RATE');
});

test('sin literales 5.65 hardcodeados en src', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (full === join(ROOT, 'src', 'data', 'standardRates.ts')) continue;
      if (readFileSync(full, 'utf8').includes('5.65')) {
        offenders.push(full);
      }
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(
    offenders,
    [],
    `Literales 5.65 hardcodeados (usar PLATFORM_COMMISSION * (1 + IVA_RATE)) en:\n${offenders.join('\n')}`
  );
});
