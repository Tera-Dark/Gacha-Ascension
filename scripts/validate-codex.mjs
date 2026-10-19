#!/usr/bin/env node
/**
 * Validate design-only codex v0.4 content and synchronized CSV indexes.
 * Requires Node >=18. Usage: node scripts/validate-codex.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const data = JSON.parse(read("data/codex/codex.v0.4.json"));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

function parseCSV(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.map((line) => {
    const fields = []; let value = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) {
        fields.push(value); value = "";
      } else value += c;
    }
    check(!quoted, "Unclosed CSV quotation");
    fields.push(value);
    return fields;
  });
}

function csvRows(path) {
  const [header, ...rows] = parseCSV(read(path));
  return rows.map((cells, i) => {
    check(cells.length === header.length, path + " line " + (i + 2) + " column count mismatch");
    return Object.fromEntries(header.map((k, j) => [k, cells[j]]));
  });
}

const rarities = new Set(["huang", "xuan", "di", "tian", "xian"]);
const validEffects = new Set([
  "attackFlat", "hpFlat", "defenseFlat", "stoneGainPct", "cultivationGainPct",
  "petExpGainPct", "attackPct", "hpPct", "defensePct", "caveYieldPct",
  "petDamagePct", "techniqueEffectPct", "armorPenPct", "damageReductionPct",
  "bossDamagePct", "breakthroughBonusPct", "trainingCostReductionPct",
  "runPackExpGainPct", "petFirstTurnShieldPct", "allBaseStatsPct", "allResourceGainPct"
]);
const sections = ["relics", "packs", "prototypes", "enemies", "stages", "realms"];
const all = sections.flatMap((section) => data[section] || []);
check(data.schemaVersion === "0.4", "Invalid schemaVersion");
check(new Set(all.map(x => x.id)).size === all.length, "Duplicate catalog ID");
check(all.every(x => x.id && x.name), "Missing id/name");
check(data.relics.length === 30, "Expected 30 proposed relics");
check(data.fateChest.tierWeightsPct.length === 5, "Five rarity weights required");
check(Math.abs(data.fateChest.tierWeightsPct.reduce((sum, n) => sum + n, 0) - 100) < 1e-9, "Rarity weights must sum to 100");
check(data.fateChest.cost > 0, "Relic chest cost must be positive");
check(data.fateChest.pityHeavenAt > 0 && data.fateChest.pityImmortalAt > data.fateChest.pityHeavenAt, "Pity milestones invalid");

for (const r of data.relics) {
  check(rarities.has(r.rarity), r.id + " invalid rarity");
  check(validEffects.has(r.effectKey), r.id + " unregistered effect");
  check(r.valuePerStack > 0 && Number.isInteger(r.maxStacks) && r.maxStacks > 0, r.id + " invalid growth/cap");
  check(Math.abs(r.valuePerStack * r.maxStacks - r.maxRawValue) < 1e-7, r.id + " maxRawValue drift");
}
check(data.stages.every(s => data.enemies.some(e => e.id === s.enemyId)), "Stage references missing enemy");
check(data.stages.every(s => s.baseAttack > 0 && s.baseHp > 0 && s.baseDefense > 0 && s.stones > 0 && s.cultivationXp > 0), "Nonpositive stage stats");
check(data.prototypes.every(p => rarities.has(p.rarity)), "Prototype rarity invalid");

const maps = [
  ["relics", "data/codex/relics.v0.4.csv"],
  ["prototypes", "data/codex/prototypes.v0.4.csv"],
  ["enemies", "data/codex/enemies.v0.4.csv"],
  ["stages", "data/codex/stages.v0.4.csv"]
];
for (const [section, path] of maps) {
  const rows = csvRows(path);
  check(rows.length === data[section].length, path + " row count mismatch");
  const jsonById = new Map(data[section].map(x => [x.id, x]));
  for (const row of rows) {
    const src = jsonById.get(row.id);
    check(!!src, path + " unknown id " + row.id);
    if (!src) continue;
    for (const [key, value] of Object.entries(row)) {
      if (key in src) check(String(src[key]) === value, path + " " + row.id + "." + key + " drift: " + value + " != " + src[key]);
    }
  }
}
const master = csvRows("data/codex/catalog.v0.4.csv");
check(master.length === all.length, "Master catalog row count mismatch");
check(new Set(master.map(r => r.id)).size === all.length, "Master catalog duplicate IDs");
for (const id of all.map(r => r.id)) check(master.some(x => x.id === id), "Master catalog missing " + id);

if (errors.length) {
  process.stderr.write("Codex validation FAILED:\n" + errors.map(s => "- " + s).join("\n") + "\n");
  process.exit(1);
}
assert.equal(data.relics.reduce((sum, relic) => sum + relic.maxStacks, 0), 498);
process.stdout.write("Codex v0.4 valid: " + all.length + " total entries / " + data.relics.length + " relics / 498 collectible layers.\n");
