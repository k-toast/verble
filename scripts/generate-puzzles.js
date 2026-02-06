#!/usr/bin/env node
/**
 * Generates puzzles.json with 170 puzzles: 1 adjective + 1 noun per puzzle.
 * Reads from scripts/wordish-puzzles.csv (format: NOUN,ADJECTIVE per row).
 * Puzzle #001 is fixed as APPEALING CANNOLI. Remaining pairs are chosen by
 * greedy minimization of (len(adj)+len(noun)-15)^2 with no repeated words.
 * Puzzle #010 is set to today (Helsinki timezone); #001-#009 are past, #011+ future.
 */

const fs = require('fs');
const path = require('path');

const NUM_PUZZLES = 170;
const TARGET_LEN = 15;
const PUZZLE_010_INDEX = 9; // 0-based index of "today's" puzzle

function getHelsinkiDate() {
  const now = new Date();
  const helsinki = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
  const y = helsinki.getFullYear();
  const m = String(helsinki.getMonth() + 1).padStart(2, '0');
  const d = String(helsinki.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function deviation(adjLen, nounLen) {
  const total = adjLen + nounLen;
  const diff = total - TARGET_LEN;
  return diff * diff;
}

// Parse CSV: rows with both noun and adjective (first 173), rows with noun only (rest)
function parseCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const adjectives = [];
  const nounsFromPairs = [];
  const nounsOnly = [];
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim().toUpperCase());
    const noun = parts[0] || '';
    const adj = parts[1] || '';
    if (!noun) continue;
    if (adj) {
      nounsFromPairs.push(noun);
      adjectives.push(adj);
    } else {
      nounsOnly.push(noun);
    }
  }
  return { adjectives, nounsFromPairs, nounsOnly };
}

function main() {
  const csvPath = path.join(__dirname, 'wordish-puzzles.csv');
  const { adjectives, nounsFromPairs } = parseCsv(csvPath);

  // Use first 173 rows only: 173 adjectives, 173 nouns. We need 170 of each.
  // Fixed: #001 = APPEALING CANNOLI. So we need 169 more pairs from 172 adj + 172 nouns.
  const FIXED_ADJ = 'APPEALING';
  const FIXED_NOUN = 'CANNOLI';

  const adjPool = adjectives.filter((a) => a !== FIXED_ADJ);
  const nounPool = nounsFromPairs.filter((n) => n !== FIXED_NOUN);

  if (adjPool.length < 169 || nounPool.length < 169) {
    throw new Error('CSV does not have enough adjectives/nouns after fixing APPEALING CANNOLI');
  }

  // Greedy: repeatedly pick (adj, noun) with smallest deviation from 15 among unused
  const usedAdj = new Set([FIXED_ADJ]);
  const usedNoun = new Set([FIXED_NOUN]);
  const pairs = [{ adj: FIXED_ADJ, noun: FIXED_NOUN }];

  for (let k = 0; k < 169; k++) {
    let best = null;
    let bestDev = Infinity;
    for (const adj of adjPool) {
      if (usedAdj.has(adj)) continue;
      for (const noun of nounPool) {
        if (usedNoun.has(noun)) continue;
        const d = deviation(adj.length, noun.length);
        if (d < bestDev) {
          bestDev = d;
          best = { adj, noun };
        }
      }
    }
    if (!best) throw new Error('Could not form 169 pairs');
    usedAdj.add(best.adj);
    usedNoun.add(best.noun);
    pairs.push(best);
  }

  // Optional override: node generate-puzzles.js 2026-02-06 or TODAY=2026-02-06
  const today = (process.argv[2] && process.argv[2].trim()) || (process.env.TODAY && process.env.TODAY.trim()) || getHelsinkiDate();
  const puzzles = pairs.map((p, i) => ({
    date: offsetDate(today, i - PUZZLE_010_INDEX),
    adjectives: [p.adj],
    noun: p.noun
  }));

  const outPath = path.join(__dirname, '..', 'puzzles.json');
  fs.writeFileSync(outPath, JSON.stringify(puzzles, null, 2), 'utf8');

  // Validation and stats
  const lengths = puzzles.map((p) => p.adjectives[0].length + p.noun.length);
  const minLen = Math.min(...lengths);
  const maxLen = Math.max(...lengths);
  const meanLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const usedAdjs = new Set(puzzles.map((p) => p.adjectives[0]));
  const usedNouns = new Set(puzzles.map((p) => p.noun));

  console.log(`Wrote ${puzzles.length} puzzles to ${outPath}`);
  console.log(`Puzzle #001: ${puzzles[0].adjectives[0]} ${puzzles[0].noun}`);
  console.log(`Puzzle #010 (today) date: ${puzzles[PUZZLE_010_INDEX].date}`);
  console.log(`Combined length: min=${minLen} max=${maxLen} mean=${meanLen.toFixed(1)}`);
  console.log(`Unique adjectives: ${usedAdjs.size}, unique nouns: ${usedNouns.size}`);

  if (puzzles[0].adjectives[0] !== FIXED_ADJ || puzzles[0].noun !== FIXED_NOUN) {
    throw new Error('Puzzle #001 must be APPEALING CANNOLI');
  }
  if (puzzles[PUZZLE_010_INDEX].date !== today) {
    console.warn(`Note: Puzzle #010 date is ${puzzles[PUZZLE_010_INDEX].date}; today (Helsinki) is ${today}. Re-run on the desired day if needed.`);
  }
  if (usedAdjs.size !== NUM_PUZZLES || usedNouns.size !== NUM_PUZZLES) {
    throw new Error('Every adjective and noun must be used exactly once');
  }
}

main();
