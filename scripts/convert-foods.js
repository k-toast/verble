#!/usr/bin/env node
/**
 * Converts food_dictionary.csv to foods.json.
 * Usage: node scripts/convert-foods.js [path/to/food_dictionary.csv]
 * Output: foods.json in project root
 */

const fs = require('fs');
const path = require('path');

const csvPath = process.argv[2] || path.join(__dirname, '..', 'food_dictionary.csv');
const outPath = path.join(__dirname, '..', 'foods.json');

let csv;
try {
  csv = fs.readFileSync(csvPath, 'utf8');
} catch (err) {
  console.error('Could not read CSV:', csvPath, err.message);
  process.exit(1);
}

const lines = csv.split(/\r?\n/);
const foods = lines
  .map((line) => line.trim())
  .filter(Boolean)
  .map((word) => word.toUpperCase().replace(/[^A-Z]/g, ''))
  .filter((word) => word.length >= 2 && word.length <= 12);

const unique = [...new Set(foods)].sort();

try {
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2), 'utf8');
  console.log(`Wrote ${unique.length} foods to ${outPath}`);
} catch (err) {
  console.error('Could not write foods.json:', err.message);
  process.exit(1);
}
