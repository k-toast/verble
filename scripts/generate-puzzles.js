#!/usr/bin/env node
/**
 * Generates puzzles.json with 1 adjective + 1 noun per puzzle.
 * Pairs are selected to cluster in a tight character range.
 * Puzzle #001 is set to today (Helsinki timezone).
 */

const fs = require('fs');
const path = require('path');

const adjectives = [
  'robust', 'rich', 'aromatic', 'elegant', 'succulent', 'crisp', 'bright', 'clean',
  'simple', 'classic', 'rustic', 'lush', 'harmonious', 'sumptuous', 'appealing',
  'opulent', 'palatable', 'gentle', 'subtle', 'pleasing', 'tempting', 'immaculate',
  'soothing', 'timeless', 'indelible', 'serious', 'luscious', 'indulgent', 'comforting',
  'silken', 'fragrant', 'irresistible', 'soulful', 'ambrosial', 'glorious', 'bold',
  'balanced', 'sinful', 'ecstatic', 'magnetic', 'grand', 'intense', 'plush', 'radiant',
  'epicurean', 'theatrical', 'dramatic', 'charismatic', 'alluring', 'rapturous'
];

const nouns = [
  'tacos', 'nachos', 'paella', 'lasagna', 'risotto', 'sauce', 'salsa', 'pasta',
  'cannoli', 'gelato', 'sorbet', 'tiramisu', 'crepe', 'omelet', 'ramen', 'chili',
  'burrito', 'tamale', 'panini', 'pita', 'bruschetta', 'sundae', 'minestrone',
  'couscous', 'cassoulet', 'ratatouille', 'bolognese', 'pesto', 'aioli', 'carpaccio',
  'sashimi', 'sushi', 'soup', 'stew', 'cake', 'pancakes', 'cookies', 'falafel',
  'donut', 'pudding', 'parfait', 'curry', 'tandoori', 'gyro', 'onigiri', 'tempura',
  'poutine', 'pierogi', 'carbonara', 'marinara'
];

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

// Use all 50 adjectives and 50 nouns exactly once. Pair adj[i] with noun[i] after shuffling.
const NUM_PUZZLES = 50;

// Shuffle (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Try random pairings until we get 50 pairs all <= 20 chars
const MAX_ATTEMPTS = 1000;
let selected = [];
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const shuffledAdj = shuffle(adjectives);
  const shuffledNoun = shuffle(nouns);
  const pairs = shuffledAdj.map((adj, i) => ({
    adj,
    noun: shuffledNoun[i],
    total: adj.length + 1 + shuffledNoun[i].length
  }));
  if (pairs.every(p => p.total <= 20)) {
    selected = pairs;
    break;
  }
}

// If we couldn't get 50 under 20, use best effort and filter/sort to minimize over-20
if (selected.length < NUM_PUZZLES) {
  const allPairs = [];
  for (const adj of adjectives) {
    for (const noun of nouns) {
      const total = adj.length + 1 + noun.length;
      allPairs.push({ adj, noun, total });
    }
  }
  allPairs.sort((a, b) => a.total - b.total);
  const usedAdj = new Set();
  const usedNoun = new Set();
  selected = [];
  for (const p of allPairs) {
    if (selected.length >= NUM_PUZZLES) break;
    if (usedAdj.has(p.adj) || usedNoun.has(p.noun)) continue;
    usedAdj.add(p.adj);
    usedNoun.add(p.noun);
    selected.push(p);
  }
}

// Random order (no sort by length)
const shuffled = shuffle(selected);

const today = getHelsinkiDate();
const puzzles = shuffled.slice(0, NUM_PUZZLES).map((p, i) => ({
  date: offsetDate(today, i),
  adjectives: [p.adj.toUpperCase()],
  noun: p.noun.toUpperCase()
}));

const outPath = path.join(__dirname, '..', 'puzzles.json');
fs.writeFileSync(outPath, JSON.stringify(puzzles, null, 2), 'utf8');
console.log(`Wrote ${puzzles.length} puzzles to ${outPath}`);
console.log(`Puzzle #001 date: ${puzzles[0].date} (today)`);
console.log('Total char range:', puzzles.map(p => p.adjectives[0].length + 1 + p.noun.length).join(', '));
