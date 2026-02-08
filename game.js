// Game state
let gameState = {
    adjectives: [],
    noun: '',
    remainingAdjectives: [],
    remainingNoun: '',
    moves: 0,
    history: [],
    isWon: false,
    isLost: false,
    isElegant: false,
    puzzleDate: ''
};

let puzzles = [];
let currentPuzzle = null;
let debugDateOverride = null;
let countdownInterval = null;

let allowedFoods = null;
let blockedFoods = new Set();
let lastRejectedIngredient = null;
let lastAttemptWasNewBest = false;
let currentView = 'game'; // 'game' | 'archive'
let archiveCalendarMonth = 1;   // 1–12, default set when opening archive
let archiveCalendarYear = 2026;

// Animation state for letter-by-letter reveal
let animationState = null; // { ingredient, result, revealedCount, adjArrays, nounArray }
let lastFadedRecipeCount = -1; // so we only fade in a row once per new ingredient
const LETTER_REVEAL_MS = 300;
const MAX_MOVES = 5;
const ELEGANT_MAX_MOVES = 3;
const STAR_MATCH_THRESHOLD = 6;
const TROPHY_WASTE_PERCENT = 25;
const MAX_INGREDIENT_LENGTH = 12;

// Get real Helsinki timezone date string (YYYY-MM-DD) - without debug override
function getRealHelsinkiDate() {
    const now = new Date();
    const helsinkiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
    const year = helsinkiTime.getFullYear();
    const month = String(helsinkiTime.getMonth() + 1).padStart(2, '0');
    const day = String(helsinkiTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Get Helsinki timezone date string (YYYY-MM-DD)
function getHelsinkiDate() {
    if (debugDateOverride) {
        return debugDateOverride;
    }
    return getRealHelsinkiDate();
}

// Offset date by N days (YYYY-MM-DD format)
function offsetDate(dateString, days) {
    if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        console.error('Invalid date string format:', dateString);
        return dateString;
    }
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return dateString;
    }
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function incrementDate(dateString) {
    return offsetDate(dateString, 1);
}

function decrementDate(dateString) {
    return offsetDate(dateString, -1);
}

// Load puzzles from JSON
async function loadPuzzles() {
    try {
        const response = await fetch('puzzles.json');
        if (!response.ok) throw new Error('Failed to load puzzles');
        puzzles = await response.json();
    } catch (error) {
        console.error('Error loading puzzles:', error);
        puzzles = [];
    }
}

// Load food allow/block lists for ingredient validation
async function loadFoodLists() {
    try {
        const [foodsRes, blockedRes] = await Promise.all([
            fetch('foods.json'),
            fetch('foods-blocked.json').catch(() => ({ ok: false }))
        ]);
        if (!foodsRes.ok) throw new Error('No foods list');
        const foods = await foodsRes.json();
        const blocked = blockedRes.ok ? await blockedRes.json() : [];
        allowedFoods = new Set(foods.map(f => String(f).toUpperCase().trim()));
        blockedFoods = new Set((blocked || []).map(b => String(b).toUpperCase().trim()));
    } catch (error) {
        console.warn('Could not load food lists, allowing all:', error);
        allowedFoods = null;
        blockedFoods = new Set();
    }
}

// Find puzzle for today
function findTodayPuzzle() {
    const today = getHelsinkiDate();
    return puzzles.find(p => p.date === today);
}

// Normalize puzzle to new format (adjectives array - 1 adjective)
function getPuzzleAdjectives(puzzle) {
    if (Array.isArray(puzzle.adjectives) && puzzle.adjectives.length >= 1) {
        return puzzle.adjectives.slice(0, 1);
    }
    if (puzzle.adjective) {
        return [puzzle.adjective];
    }
    return [''];
}

// Get 1-based puzzle number from puzzles array
function getPuzzleNumber(puzzle) {
    if (!puzzle || !puzzles.length) return '001';
    const idx = puzzles.findIndex(p => p.date === puzzle.date);
    return String(idx >= 0 ? idx + 1 : 1).padStart(3, '0');
}

// Load saved game state from localStorage for a puzzle, or return null to use fresh state
function loadSavedState(puzzle) {
    const puzzleDate = puzzle.date;
    const adjectives = getPuzzleAdjectives(puzzle);
    const noun = puzzle.noun || '';
    try {
        const savedState = localStorage.getItem(`dish_of_the_day_${puzzleDate}`);
        if (!savedState) return null;

        const parsed = JSON.parse(savedState);
        if (!parsed || typeof parsed !== 'object') return null;

        let remainingAdjectives;
        if (Array.isArray(parsed.remainingAdjectives) && parsed.remainingAdjectives.length >= 1) {
            remainingAdjectives = parsed.remainingAdjectives.slice(0, 1).map((r, i) => r || adjectives[i]);
        } else if (parsed.remainingAdjective !== undefined) {
            remainingAdjectives = [parsed.remainingAdjective || adjectives[0]];
        } else {
            remainingAdjectives = adjectives.slice();
        }

        return {
            adjectives: adjectives,
            noun: parsed.noun || noun,
            remainingAdjectives: remainingAdjectives,
            remainingNoun: parsed.remainingNoun || noun,
            moves: parsed.moves || 0,
            history: Array.isArray(parsed.history) ? parsed.history : [],
            isWon: parsed.isWon || false,
            isLost: parsed.isLost || false,
            isElegant: parsed.isElegant || false,
            puzzleDate: puzzleDate
        };
    } catch (error) {
        console.error('Error loading saved state:', error);
        return null;
    }
}

// Initialize game
function initGame() {
    currentView = 'game';
    document.body.classList.remove('archive-view');
    document.getElementById('archiveContainer').style.display = 'none';
    try {
        const savedDebugDate = localStorage.getItem('dish_of_the_day_debug_date');
        if (savedDebugDate) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(savedDebugDate)) {
                debugDateOverride = savedDebugDate;
            } else {
                localStorage.removeItem('dish_of_the_day_debug_date');
            }
        }
    } catch (error) {
        console.error('Error reading debug date from localStorage:', error);
    }
    
    currentPuzzle = findTodayPuzzle();
    
    if (!currentPuzzle) {
        document.getElementById('noPuzzleMessage').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
        updateReplayViewClass();
        updatePreviousButtonState();
        updateFooterTodayButton();
        startCountdownTimer();
        if (window.posthog) posthog.capture('game_loaded', { puzzle_date: null });
        return;
    }

    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';

    const puzzleDate = currentPuzzle.date;
    document.getElementById('dateDisplay').textContent = `#${getPuzzleNumber(currentPuzzle)}`;
    
    const adjList = getPuzzleAdjectives(currentPuzzle);
    const dishName = [...adjList, currentPuzzle.noun].filter(Boolean).join(' ');
    document.getElementById('dishName').textContent = `"${dishName}"`;

    const loadedState = loadSavedState(currentPuzzle);
    if (loadedState) {
        gameState = loadedState;
    } else {
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    lastFadedRecipeCount = gameState.history.length; /* don't re-fade rows when loading */
    updateReplayViewClass();
    updateDisplay();
    loadRecipe();
    if (gameState.isWon || gameState.isLost) {
        showCompletionView();
    }
    updatePuzzleLabel();
    updateFooterTodayButton();
    startCountdownTimer();
    if (window.posthog) posthog.capture('game_loaded', { puzzle_date: puzzleDate });
}

const PUZZLE_DATE_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatPuzzleDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    const month = PUZZLE_DATE_MONTHS[d.getMonth()] || '???';
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
}

function updatePuzzleLabel() {
    const el = document.getElementById('puzzleLabel');
    const countdownWrap = document.getElementById('countdownInLabel');
    const wrap = document.getElementById('puzzleDateNav') && document.getElementById('puzzleDateNav').parentElement;
    if (!el || !currentPuzzle) return;
    const today = getHelsinkiDate();
    const isToday = currentPuzzle.date === today;
    el.textContent = isToday ? 'DISH OF THE DAY' : formatPuzzleDate(currentPuzzle.date);
    if (countdownWrap) countdownWrap.style.display = isToday ? '' : 'none';
    if (wrap) wrap.classList.toggle('puzzle-date-archive', !isToday);
}

// Keep body.replay-view in sync so archive puzzles get the parchment theme
function updateReplayViewClass() {
    const isReplay = currentView === 'game' && currentPuzzle && currentPuzzle.date !== getHelsinkiDate();
    document.body.classList.toggle('replay-view', !!isReplay);
}

// Show ARCHIVE only in game view (hide on archive screen). Show TODAY on archive screen or when viewing a replay.
function updateFooterTodayButton() {
    const prevBtn = document.getElementById('prevBtn');
    const retryBtn = document.getElementById('retryBtn');
    if (prevBtn) {
        prevBtn.style.display = currentView === 'game' ? '' : 'none';
    }
    if (!retryBtn) return;
    const onArchiveScreen = currentView === 'archive';
    const onReplayPuzzle = currentView === 'game' && currentPuzzle && currentPuzzle.date !== getHelsinkiDate();
    const showToday = onArchiveScreen || onReplayPuzzle;
    retryBtn.style.display = showToday ? '' : 'none';
    retryBtn.textContent = 'TODAY';
    retryBtn.setAttribute('aria-label', 'Today');
    retryBtn.setAttribute('title', 'Today');
    updateFooterReplayControls();
}

// Show/hide and enable/disable prev/next puzzle arrows (in puzzle section, around date)
function updateFooterReplayControls() {
    const prevPuzzleBtn = document.getElementById('prevPuzzleBtn');
    const nextPuzzleBtn = document.getElementById('nextPuzzleBtn');
    if (!prevPuzzleBtn || !nextPuzzleBtn) return;

    const onReplayPuzzle = currentView === 'game' && currentPuzzle && puzzles.length > 0 && currentPuzzle.date !== getRealHelsinkiDate();
    prevPuzzleBtn.style.display = onReplayPuzzle ? '' : 'none';
    nextPuzzleBtn.style.display = onReplayPuzzle ? '' : 'none';
    if (!onReplayPuzzle) return;

    const idx = puzzles.findIndex(p => p.date === currentPuzzle.date);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < puzzles.length - 1;
    const nextPuzzle = hasNext ? puzzles[idx + 1] : null;
    const nextIsToday = nextPuzzle && nextPuzzle.date === getRealHelsinkiDate();

    prevPuzzleBtn.disabled = !hasPrev;
    nextPuzzleBtn.disabled = !hasNext;
    prevPuzzleBtn.setAttribute('aria-label', hasPrev ? 'Previous puzzle' : 'No previous puzzle');
    nextPuzzleBtn.setAttribute('aria-label', hasNext ? (nextIsToday ? 'Today\'s puzzle' : 'Next puzzle') : 'No next puzzle');
    nextPuzzleBtn.setAttribute('title', hasNext ? (nextIsToday ? 'Today\'s puzzle' : 'Next puzzle') : 'No next puzzle');
}

function resetGameState() {
    const adjectives = getPuzzleAdjectives(currentPuzzle);
    gameState = {
        adjectives: adjectives,
        noun: currentPuzzle.noun,
        remainingAdjectives: adjectives.slice(),
        remainingNoun: currentPuzzle.noun,
        moves: 0,
        history: [],
        isWon: false,
        isLost: false,
        isElegant: false,
        puzzleDate: currentPuzzle.date
    };
}

// Save game state to localStorage
function saveGameState() {
    try {
        const key = `dish_of_the_day_${gameState.puzzleDate}`;
        const value = JSON.stringify(gameState);
        localStorage.setItem(key, value);
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            console.error('localStorage quota exceeded. Game state not saved.');
        } else {
            console.error('Error saving game state:', error);
        }
    }
}

const STATS_KEY = 'dish_of_the_day_stats';
const ATTEMPTS_KEY = 'dish_of_the_day_attempts';
const DARK_MODE_KEY = 'dish_of_the_day_dark_mode';

function isDarkMode() {
    try {
        return localStorage.getItem(DARK_MODE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function setDarkMode(enabled) {
    document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    try {
        if (enabled) {
            localStorage.setItem(DARK_MODE_KEY, '1');
        } else {
            localStorage.removeItem(DARK_MODE_KEY);
        }
    } catch (e) {}
}

// Load attempts data (per-puzzle first + best)
function getAttemptsData() {
    try {
        const raw = localStorage.getItem(ATTEMPTS_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        return typeof data === 'object' && data !== null ? data : {};
    } catch (_) {
        return {};
    }
}

// Save attempts data
function setAttemptsData(data) {
    try {
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving attempts:', e);
    }
}

// Returns true if (movesA, wasteA) is strictly better than (movesB, wasteB). Ingredients take priority.
function isBetterRun(movesA, wasteA, movesB, wasteB) {
    return (movesA < movesB) || (movesA === movesB && wasteA < wasteB);
}

// Whether any ingredient in history had 6+ matching letters (star ingredient)
function getHadStarIngredient() {
    if (!gameState.history || !gameState.history.length) return false;
    return gameState.history.some(item => {
        const matches = (item.result || []).filter(r => r.status === 'adj' || r.status === 'noun').length;
        return matches >= STAR_MATCH_THRESHOLD;
    });
}

// Record first/best attempt for this puzzle. Call on game end (win or loss). Returns { isNewBest } for wins.
function recordAttempts() {
    if (!gameState.isWon && !gameState.isLost) return { isNewBest: false };
    const date = gameState.puzzleDate;
    const moves = gameState.moves;
    const waste = getWastePercent();
    const won = gameState.isWon;
    const hadStarIngredient = getHadStarIngredient();

    const data = getAttemptsData();
    const existing = data[date];
    let isNewBest = false;

    if (!existing) {
        data[date] = {
            first: { moves, waste, won },
            best: won ? { moves, waste } : null,
            hadStarIngredient: hadStarIngredient
        };
        if (won) isNewBest = true;
    } else {
        data[date].hadStarIngredient = existing.hadStarIngredient || hadStarIngredient;
        if (won) {
            const prevBest = existing.best;
            const thisRun = { moves, waste };
            if (!prevBest || isBetterRun(moves, waste, prevBest.moves, prevBest.waste)) {
                data[date].best = thisRun;
                isNewBest = true;
            } else {
                data[date].best = prevBest;
            }
        }
    }
    setAttemptsData(data);
    return { isNewBest };
}

// Record a completed game (win or loss) for statistics
function recordGameCompleted() {
    if (!gameState.isWon && !gameState.isLost) return;
    try {
        const wastePercent = getWastePercent();
        const entry = {
            date: gameState.puzzleDate,
            won: gameState.isWon,
            moves: gameState.moves,
            wastePercent,
            elegant: !!gameState.isElegant,
            trophy: wastePercent <= TROPHY_WASTE_PERCENT
        };
        let data = { games: [] };
        try {
            const raw = localStorage.getItem(STATS_KEY);
            if (raw) data = JSON.parse(raw);
            if (!Array.isArray(data.games)) data.games = [];
        } catch (_) {}
        data.games.push(entry);
        localStorage.setItem(STATS_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Error recording stats:', e);
    }
}

// Load and compute stats for the stats modal
function getStats() {
    let games = [];
    try {
        const raw = localStorage.getItem(STATS_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data.games)) games = data.games;
        }
    } catch (_) {}
    const dishesAttempted = games.length;
    const wins = games.filter(g => g.won);
    const dishSuccessesPercent = dishesAttempted > 0 ? Math.round((wins.length / dishesAttempted) * 100) : 0;
    const averageWastePercent = games.length > 0
        ? Math.round(games.reduce((s, g) => s + (g.wastePercent || 0), 0) / games.length)
        : 0;
    const totalTrophies = games.filter(g => g.trophy).length;
    const elegantPercent = wins.length > 0
        ? Math.round((wins.filter(g => g.elegant).length / wins.length) * 100)
        : 0;
    const averageIngredients = games.length > 0
        ? (games.reduce((s, g) => s + (g.moves || 0), 0) / games.length).toFixed(1)
        : '0.0';

    const today = getRealHelsinkiDate();
    const datesPlayed = [...new Set(games.map(g => g.date))].sort().reverse();
    let attemptStreak = 0;
    if (datesPlayed.length > 0) {
        let check = today;
        for (let i = 0; i < datesPlayed.length; i++) {
            if (datesPlayed[i] === check) {
                attemptStreak++;
                check = offsetDate(check, -1);
            } else if (datesPlayed[i] < check) break;
        }
    }

    let successStreak = 0;
    for (let i = games.length - 1; i >= 0; i--) {
        if (games[i].won) successStreak++;
        else break;
    }

    const attemptsData = getAttemptsData();
    const totalStars = Object.keys(attemptsData).filter(dateStr => hadStarIngredientForDate(dateStr)).length;

    return {
        dishesAttempted,
        attemptStreak,
        dishSuccessesPercent,
        successStreak,
        averageWastePercent,
        totalTrophies,
        totalStars,
        elegantPercent,
        averageIngredients
    };
}

// Set of "lineIndex,indexInLine" for positions that have been matched (from history + current animation).
function getMatchedPositionKeys() {
    const keys = new Set();
    for (const item of (gameState.history || [])) {
        if (!item.result) continue;
        for (const r of item.result) {
            if ((r.status === 'adj' || r.status === 'noun') && typeof r.lineIndex === 'number' && typeof r.indexInLine === 'number') {
                keys.add(`${r.lineIndex},${r.indexInLine}`);
            }
        }
    }
    if (animationState && animationState.result) {
        for (const r of animationState.result) {
            if ((r.status === 'adj' || r.status === 'noun') && typeof r.lineIndex === 'number' && typeof r.indexInLine === 'number') {
                keys.add(`${r.lineIndex},${r.indexInLine}`);
            }
        }
    }
    return keys;
}

// Get letter states for puzzle display: active, matched (by position so repeated letters are correct).
function getLetterStatesForDisplay() {
    const adjectives = gameState.adjectives || [];
    const noun = gameState.noun || '';
    const matchedKeys = getMatchedPositionKeys();
    const result = { adj: [], noun: [] };

    function processLine(original, lineIndex) {
        const letters = [];
        const chars = (original || '').trim().split('');
        for (let indexInLine = 0; indexInLine < chars.length; indexInLine++) {
            const key = `${lineIndex},${indexInLine}`;
            const state = matchedKeys.has(key) ? 'matched' : 'active';
            letters.push({ char: chars[indexInLine], state });
        }
        return letters;
    }

    result.adj = processLine(adjectives[0] || '', 0);
    result.noun = processLine(noun, 1);
    return result;
}

// Return the k-th (0-based) "matched" cell position in display order (adj line then noun line, left to right).
// Used so flip tile position matches the cell that is visually "matched" for the k-th submission letter.
function getKthMatchedPosition(letterStates, k) {
    let count = 0;
    for (let lineIndex = 0; lineIndex < 2; lineIndex++) {
        const letters = lineIndex === 0 ? letterStates.adj : letterStates.noun;
        for (let indexInLine = 0; indexInLine < letters.length; indexInLine++) {
            if (letters[indexInLine].state === 'matched') {
                if (count === k) return { lineIndex, indexInLine };
                count++;
            }
        }
    }
    return null;
}

// Victory message lines for puzzle area: ELEGANT DISH! or EXCELLENT DISH!
function getVictoryMessageLines() {
    return gameState.isElegant ? ['ELEGANT', 'DISH!'] : ['EXCELLENT', 'DISH!'];
}

// Loss message lines for puzzle area: HUGE MESS!
function getLossMessageLines() {
    return ['HUGE', 'MESS!'];
}

// Render two lines as static letters in the puzzle stack (e.g. when loading a completed game).
function renderMessageStatic(stack, lines) {
    stack.innerHTML = '';
    (lines || []).forEach((word) => {
        const line = document.createElement('div');
        line.className = 'puzzle-line';
        for (const ch of word) {
            const span = document.createElement('span');
            span.className = 'puzzle-letter';
            span.textContent = ch;
            line.appendChild(span);
        }
        stack.appendChild(line);
    });
}

// Render "ELEGANT DISH!" / "EXCELLENT DISH!" as static letters (e.g. when loading a completed game).
function renderDishCompleteStatic(stack) {
    renderMessageStatic(stack, getVictoryMessageLines());
}

// Flip all current puzzle letters to blank (green) at once; then callback after duration.
function flipAllPuzzleToBlank(stack, onDone) {
    const letterStates = getLetterStatesForDisplay();
    stack.innerHTML = '';
    const FLIP_MS = 550;

    function appendLine(letters) {
        const line = document.createElement('div');
        line.className = 'puzzle-line';
        letters.forEach(({ char }) => {
            const tile = document.createElement('div');
            tile.className = 'puzzle-letter puzzle-flip-tile';
            const inner = document.createElement('div');
            inner.className = 'puzzle-flip-inner';
            const front = document.createElement('div');
            front.className = 'puzzle-flip-front';
            front.textContent = char === ' ' ? '\u00A0' : char;
            const back = document.createElement('div');
            back.className = 'puzzle-flip-back';
            inner.appendChild(front);
            inner.appendChild(back);
            tile.appendChild(inner);
            line.appendChild(tile);
        });
        stack.appendChild(line);
    }
    appendLine(letterStates.adj);
    appendLine(letterStates.noun);

    // Add .flipped immediately so the first paint shows green (avoids flash of puzzle name).
    const tiles = stack.querySelectorAll('.puzzle-flip-tile');
    tiles.forEach((t) => t.classList.add('flipped'));
    if (onDone) setTimeout(onDone, FLIP_MS);
}

// Reveal message lines in puzzle area with staggered card-flip-in (win or loss).
function revealMessageInStack(stack, lines) {
    stack.innerHTML = '';
    const REVEAL_STAGGER_MS = 80;

    function buildLine(word) {
        const line = document.createElement('div');
        line.className = 'puzzle-line';
        for (const ch of word) {
            const tile = document.createElement('div');
            tile.className = 'puzzle-letter puzzle-flip-tile puzzle-flip-tile-reveal';
            const inner = document.createElement('div');
            inner.className = 'puzzle-flip-inner';
            const front = document.createElement('div');
            front.className = 'puzzle-flip-front';
            front.textContent = ch;
            const back = document.createElement('div');
            back.className = 'puzzle-flip-back';
            inner.appendChild(front);
            inner.appendChild(back);
            tile.appendChild(inner);
            line.appendChild(tile);
        }
        return line;
    }
    (lines || []).forEach((word) => stack.appendChild(buildLine(word)));

    const tiles = stack.querySelectorAll('.puzzle-flip-tile-reveal');
    tiles.forEach((t, i) => {
        setTimeout(() => t.classList.add('revealed'), i * REVEAL_STAGGER_MS);
    });
}

// Reveal "ELEGANT DISH!" / "EXCELLENT DISH!" in puzzle area.
function revealDishCompleteInStack(stack) {
    revealMessageInStack(stack, getVictoryMessageLines());
}

// Card-flip reveal for recipe heading (e.g. "AN ELEGANT DISH")
const HEADING_REVEAL_STAGGER_MS = 60;

function buildHeadingFlipReveal(headingEl, text) {
    headingEl.innerHTML = '';
    const wrap = document.createElement('span');
    wrap.className = 'recipe-heading-flip';
    for (const ch of text) {
        const tile = document.createElement('span');
        tile.className = 'recipe-heading-flip-char recipe-heading-flip-reveal';
        const inner = document.createElement('span');
        inner.className = 'recipe-heading-flip-inner';
        const front = document.createElement('span');
        front.className = 'recipe-heading-flip-front';
        front.textContent = ch;
        const back = document.createElement('span');
        back.className = 'recipe-heading-flip-back';
        inner.appendChild(front);
        inner.appendChild(back);
        tile.appendChild(inner);
        wrap.appendChild(tile);
    }
    headingEl.appendChild(wrap);
    const tiles = wrap.querySelectorAll('.recipe-heading-flip-char');
    tiles.forEach((t, i) => {
        setTimeout(() => t.classList.add('revealed'), i * HEADING_REVEAL_STAGGER_MS);
    });
}

// Build puzzle display: two lines — adjective on line 1, noun on line 2, both centered
function renderPuzzleStack() {
    const stack = document.getElementById('puzzleStack');
    if (!stack) return;

    if (gameState.isWon && !gameState.justWon) {
        renderDishCompleteStatic(stack);
        return;
    }
    if (gameState.isLost) {
        renderMessageStatic(stack, getLossMessageLines());
        return;
    }

    const letterStates = getLetterStatesForDisplay();
    const animating = animationState !== null;
    const result = animating ? animationState.result : [];
    const revealedCount = animating ? animationState.revealedCount : 0;
    const currentMatch = revealedCount >= 1 ? result[revealedCount - 1] : null;
    const isMatch = currentMatch && (currentMatch.status === 'adj' || currentMatch.status === 'noun');
    const showFlipAt = isMatch ? { lineIndex: currentMatch.lineIndex, indexInLine: currentMatch.indexInLine } : null;

    function appendLine(letters, lineIndex) {
        const line = document.createElement('div');
        line.className = 'puzzle-line';
        letters.forEach(({ char, state }, indexInLine) => {
            if (state === 'matched') {
                const isThisCellFlipping = showFlipAt && showFlipAt.lineIndex === lineIndex && showFlipAt.indexInLine === indexInLine;
                if (!animating || !isThisCellFlipping) {
                    const box = document.createElement('div');
                    box.className = 'puzzle-letter puzzle-letter-matched puzzle-matched-box';
                    line.appendChild(box);
                } else {
                    const tile = document.createElement('div');
                    tile.className = 'puzzle-letter puzzle-flip-tile puzzle-flip-new';
                    tile.dataset.line = String(lineIndex);
                    tile.dataset.index = String(indexInLine);
                    const inner = document.createElement('div');
                    inner.className = 'puzzle-flip-inner';
                    const front = document.createElement('div');
                    front.className = 'puzzle-flip-front';
                    front.textContent = char === ' ' ? '\u00A0' : char;
                    const back = document.createElement('div');
                    back.className = 'puzzle-flip-back';
                    inner.appendChild(front);
                    inner.appendChild(back);
                    tile.appendChild(inner);
                    line.appendChild(tile);
                }
            } else {
                const span = document.createElement('span');
                span.className = `puzzle-letter puzzle-letter-${state}`;
                span.textContent = char === ' ' ? '\u00A0' : char;
                line.appendChild(span);
            }
        });
        stack.appendChild(line);
    }

    stack.innerHTML = '';
    appendLine(letterStates.adj, 0);
    appendLine(letterStates.noun, 1);

    const newTile = stack.querySelector('.puzzle-flip-new');
    if (newTile) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                newTile.classList.remove('puzzle-flip-new');
                newTile.classList.add('flipped');
            });
        });
    }
}

// During letter-by-letter reveal: mark previous *match* flip tile as flipped, then add the next flip tile only for the current match
function advancePuzzleFlip() {
    const stack = document.getElementById('puzzleStack');
    if (!stack || !animationState || animationState.revealedCount < 2) return;

    const result = animationState.result;
    const revealedCount = animationState.revealedCount;
    const current = result[revealedCount - 1];
    // Only flip when the current letter is a match; skip when it's plain (no flip for this letter)
    if (!current || (current.status !== 'adj' && current.status !== 'noun')) return;

    // Find the most recent previous *match* (not just previous letter), so we mark the right tile flipped when there are plain letters in between
    let prevPosition = null;
    for (let k = revealedCount - 2; k >= 0; k--) {
        const p = result[k];
        if (p && (p.status === 'adj' || p.status === 'noun')) {
            prevPosition = { lineIndex: p.lineIndex, indexInLine: p.indexInLine };
            break;
        }
    }
    const currentPosition = { lineIndex: current.lineIndex, indexInLine: current.indexInLine };

    // Mark the previous match's flip tile as flipped
    if (prevPosition) {
        const prevTile = stack.querySelector(`.puzzle-flip-tile[data-line="${prevPosition.lineIndex}"][data-index="${prevPosition.indexInLine}"]`);
        if (prevTile) prevTile.classList.add('flipped');
    }

    const { lineIndex, indexInLine } = currentPosition;
    const line = stack.children[lineIndex];
    if (!line || indexInLine >= line.children.length) return;

    const letterStates = getLetterStatesForDisplay();
    const letters = lineIndex === 0 ? letterStates.adj : letterStates.noun;
    const puzzleChar = letters[indexInLine] ? letters[indexInLine].char : current.letter;

    const tile = document.createElement('div');
    tile.className = 'puzzle-letter puzzle-flip-tile puzzle-flip-new';
    tile.dataset.line = String(lineIndex);
    tile.dataset.index = String(indexInLine);
    const inner = document.createElement('div');
    inner.className = 'puzzle-flip-inner';
    const front = document.createElement('div');
    front.className = 'puzzle-flip-front';
    front.textContent = puzzleChar === ' ' ? '\u00A0' : puzzleChar;
    const back = document.createElement('div');
    back.className = 'puzzle-flip-back';
    inner.appendChild(front);
    inner.appendChild(back);
    tile.appendChild(inner);

    line.replaceChild(tile, line.children[indexInLine]);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            tile.classList.remove('puzzle-flip-new');
            tile.classList.add('flipped');
        });
    });
}

// Title-case a word for display (e.g. EARTHY -> Earthy)
function titleCase(str) {
    if (!str || typeof str !== 'string') return '';
    const s = str.trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Get indefinite article for a word (a vs an)
function getIndefiniteArticle(word) {
    if (!word || typeof word !== 'string') return 'a';
    const first = (word.trim().toLowerCase())[0];
    return /[aeiou]/.test(first) ? 'an' : 'a';
}

// Build victory grid HTML: numbered list, only used cells (green=matched, grey=unmatched)
function buildVictoryGridHTML() {
    let html = '<ol class="victory-grid">';
    for (let r = 0; r < gameState.history.length; r++) {
        const historyItem = gameState.history[r];
        if (!historyItem || !historyItem.result.length) continue;
        const rowNum = r + 1;
        html += `<li class="victory-grid-row"><span class="victory-row-num">${rowNum}.</span><span class="victory-row-cells">`;
        for (let c = 0; c < historyItem.result.length; c++) {
            const status = historyItem.result[c].status || 'plain';
            const cellClass = status === 'adj' || status === 'noun'
                ? 'victory-cell victory-cell-matched'
                : 'victory-cell victory-cell-unmatched';
            html += `<span class="${cellClass}"></span>`;
        }
        html += `</span></li>`;
    }
    html += '</ol>';
    return html;
}

// Get star ingredient: most matches, then least waste, then earliest
function getStarIngredient() {
    if (!gameState.history.length) return null;
    let best = null;
    let bestMatches = -1;
    let bestWaste = Infinity;
    let bestIndex = Infinity;
    for (let i = 0; i < gameState.history.length; i++) {
        const item = gameState.history[i];
        const matches = item.result.filter(r => (r.status || '') === 'adj' || (r.status || '') === 'noun').length;
        const waste = item.result.filter(r => (r.status || '') === 'plain').length;
        if (matches > bestMatches ||
            (matches === bestMatches && waste < bestWaste) ||
            (matches === bestMatches && waste === bestWaste && i < bestIndex)) {
            best = item.ingredient;
            bestMatches = matches;
            bestWaste = waste;
            bestIndex = i;
        }
    }
    return best;
}

// Match count for the star (top) ingredient
function getStarIngredientMatchCount() {
    const name = getStarIngredient();
    if (!name) return 0;
    const item = gameState.history.find(h => h.ingredient === name);
    if (!item) return 0;
    return item.result.filter(r => (r.status || '') === 'adj' || (r.status || '') === 'noun').length;
}

// Calculate waste percentage (letters not matched)
function getWastePercent() {
    const totalLetters = gameState.history.reduce((sum, item) => sum + item.ingredient.length, 0);
    const wasteLetters = gameState.history.reduce((sum, item) =>
        sum + item.result.filter(r => (r.status || '') === 'plain').length, 0);
    return totalLetters > 0 ? Math.round((wasteLetters / totalLetters) * 100) : 0;
}

// Show playing UI (input bar, YOUR RECIPE, hide completion elements)
function setPlayingView() {
    const completionStatus = document.getElementById('completionStatus');
    const recipeHeading = document.getElementById('recipeHeading');
    const completionActions = document.getElementById('completionActions');
    const footerCompletionActions = document.getElementById('footerCompletionActions');
    const recipeSection = document.getElementById('recipeSection');
    if (completionStatus) {
        completionStatus.setAttribute('aria-hidden', 'true');
        completionStatus.innerHTML = '';
    }
    if (recipeHeading) recipeHeading.textContent = 'YOUR RECIPE';
    if (completionActions) {
        completionActions.hidden = true;
        completionActions.innerHTML = '';
        completionActions.classList.remove('completion-actions-visible');
    }
    if (footerCompletionActions) {
        footerCompletionActions.innerHTML = '';
        footerCompletionActions.classList.remove('completion-actions-visible');
    }
    if (recipeSection) recipeSection.classList.remove('recipe-section-complete', 'recipe-section-stats-instant');
}

// Show completion takeover (heading, stats; SHARE/REPLAY go in footer)
function showCompletionView() {
    updateFooterTodayButton();

    const completionStatus = document.getElementById('completionStatus');
    const recipeHeading = document.getElementById('recipeHeading');
    const completionStatsWrap = document.getElementById('completionStatsWrap');
    const completionActions = document.getElementById('completionActions');
    const footerCompletionActions = document.getElementById('footerCompletionActions');
    const gameStatus = document.getElementById('gameStatus');
    const puzzleStack = document.getElementById('puzzleStack');

    if (completionActions) {
        completionActions.hidden = true;
        completionActions.innerHTML = '';
        completionActions.classList.remove('completion-actions-visible');
    }

    if (gameState.isWon) {
        if (completionStatus) completionStatus.setAttribute('aria-hidden', 'true');
        if (gameState.justWon && puzzleStack) {
            flipAllPuzzleToBlank(puzzleStack, () => {
                revealDishCompleteInStack(puzzleStack);
                gameState.justWon = false;
            });
        }
    } else {
        // Loss: HUGE MESS! in puzzle box (same as ELEGANT/EXCELLENT DISH!)
        if (completionStatus) completionStatus.setAttribute('aria-hidden', 'true');
        if (gameState.justCompleted && puzzleStack) {
            flipAllPuzzleToBlank(puzzleStack, () => {
                revealMessageInStack(puzzleStack, getLossMessageLines());
            });
        }
    }

    // Footer: SHARE + REPLAY (always show Share; same nav-btn style; share gets border fade later)
    if (footerCompletionActions) {
        footerCompletionActions.innerHTML = '';
        footerCompletionActions.classList.remove('completion-actions-visible');
        const shareBtn = document.createElement('button');
        shareBtn.id = 'footerShareBtn';
        shareBtn.type = 'button';
        shareBtn.className = 'nav-btn nav-btn-share';
        shareBtn.textContent = 'SHARE';
        shareBtn.setAttribute('aria-label', 'Share results');
        shareBtn.addEventListener('click', handleShare);
        const replayBtn = document.createElement('button');
        replayBtn.type = 'button';
        replayBtn.className = 'nav-btn';
        replayBtn.textContent = 'REPLAY';
        replayBtn.setAttribute('aria-label', 'Replay this puzzle');
        replayBtn.addEventListener('click', handleRetry);
        footerCompletionActions.appendChild(shareBtn);
        footerCompletionActions.appendChild(replayBtn);
        if (!gameState.justCompleted) footerCompletionActions.classList.add('completion-actions-visible');
    }

    if (gameStatus) {
        gameStatus.textContent = gameState.isWon
            ? (gameState.isElegant ? 'ELEGANT DISH!' : 'EXCELLENT DISH!')
            : 'HUGE MESS!';
    }

    if (recipeHeading && !gameState.isWon) {
        recipeHeading.textContent = 'YOUR RECIPE';
    }
    /* when win: leave recipe heading as YOUR RECIPE (unchanged) */

    /* recipe-section-complete is added by loadRecipe (in rAF when isComplete) so stats fade in */
    if (completionStatsWrap) completionStatsWrap.hidden = gameState.isLost;
}

// Update display
function updateDisplay() {
    renderPuzzleStack();

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    const header = document.getElementById('gameHeader');
    const gameStatus = document.getElementById('gameStatus');

    if (gameState.isWon || gameState.isLost) {
        input.disabled = true;
        input.placeholder = '';
        submitBtn.disabled = true;
        showInputFeedback('');
        if (gameState.isWon) {
            if (header) header.classList.add('solved');
            if (gameStatus) gameStatus.textContent = 'Puzzle solved!';
        } else {
            if (header) header.classList.remove('solved');
            if (gameStatus) gameStatus.textContent = 'Game over. Try again or move to next puzzle.';
        }
    } else {
        setPlayingView();
        input.disabled = false;
        input.placeholder = 'type an ingredient here';
        if (submitBtn) submitBtn.disabled = false;
        if (header) header.classList.remove('solved');
        if (gameStatus) gameStatus.textContent = '';
        updateInputValidationState();
    }

    updatePreviousButtonState();
}

// Update nav button state (ARCHIVE always enabled)
function updatePreviousButtonState() {
    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.disabled = false;
}

// Show inline feedback near input
// style: '' (default), 'error', or 'highlight' (blue)
const SUBMIT_FOR_REVIEW_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdAPkSeB_acSdPLHas0YJFrj4-nlYGqhXSt72PZpghnTOLMNw/viewform?usp=sharing&ouid=112269985430641044011';

function showInputFeedback(message, style, includeReviewLink) {
    const el = document.getElementById('inputFeedback');
    if (!el) return;
    el.className = 'input-feedback' + (style ? ' ' + style : '');
    if (!message) {
        el.textContent = '';
        return;
    }
    const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const link = includeReviewLink !== false
        ? ` <a href="${SUBMIT_FOR_REVIEW_URL}" target="_blank" rel="noopener noreferrer" class="input-feedback-review-link">Submit for review?</a>`
        : '';
    el.innerHTML = `<span class="input-feedback-text">${escaped}</span>${link}`;
}

// Update input validation state (length limit) and submit button
function updateInputValidationState() {
    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    if (!input || !submitBtn) return;

    const currentValue = (input.value || '').replace(/[^A-Za-z]/g, '').toUpperCase();

    // Clear sticky invalid-food error when player edits the input
    if (lastRejectedIngredient !== null && currentValue !== lastRejectedIngredient) {
        lastRejectedIngredient = null;
    }

    // If sticky error is still active, preserve it and don't overwrite
    if (lastRejectedIngredient !== null && currentValue === lastRejectedIngredient) {
        return;
    }

    const len = currentValue.length;
    if (len > MAX_INGREDIENT_LENGTH) {
        showInputFeedback('That ingredient has more than 12 letters.', 'highlight');
        input.setAttribute('aria-invalid', 'true');
        submitBtn.disabled = true;
    } else {
        showInputFeedback('');
        input.setAttribute('aria-invalid', 'false');
        if (!gameState.isWon && !gameState.isLost) {
            submitBtn.disabled = false;
        }
    }
}

// Sleep helper for animation delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Build active (remaining) letters arrays from display states, preserving original indices.
function buildActiveFromStates(states) {
    const chars = [];
    const indices = [];
    for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (s && s.state === 'active') {
            chars.push(s.char);
            indices.push(i);
        }
    }
    return { chars, indices };
}

// Match one letter against active arrays (adj → noun) in display order; returns original index.
function matchOneLetterActive(letter, activeAdj, activeNoun) {
    for (let j = 0; j < activeAdj.chars.length; j++) {
        if (activeAdj.chars[j] === letter) {
            const originalIndex = activeAdj.indices[j];
            activeAdj.chars.splice(j, 1);
            activeAdj.indices.splice(j, 1);
            return { status: 'adj', lineIndex: 0, indexInLine: originalIndex };
        }
    }
    for (let j = 0; j < activeNoun.chars.length; j++) {
        if (activeNoun.chars[j] === letter) {
            const originalIndex = activeNoun.indices[j];
            activeNoun.chars.splice(j, 1);
            activeNoun.indices.splice(j, 1);
            return { status: 'noun', lineIndex: 1, indexInLine: originalIndex };
        }
    }
    return { status: 'plain' };
}

// Process an ingredient - letters match against combined puzzle left-to-right (adj → noun)
// Returns a Promise that resolves to true if accepted, false if rejected (validation failure)
async function processIngredient(ingredient) {
    if (gameState.isWon || gameState.isLost) return false;

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    ingredient = ingredient.toUpperCase().trim();
    showInputFeedback('');

    if (ingredient.length > MAX_INGREDIENT_LENGTH) {
        showInputFeedback('That ingredient has more than 12 letters.', 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    if (!new RegExp(`^[A-Z]{2,${MAX_INGREDIENT_LENGTH}}$`).test(ingredient)) {
        showInputFeedback('Enter 2–12 letters', 'error');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    const isDuplicate = gameState.history.some(h => (h.ingredient || '').toUpperCase() === ingredient);
    if (isDuplicate) {
        showInputFeedback('Ingredient already in the dish.', 'error', false);
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    const puzzleNoun = (gameState.noun || '').toUpperCase().trim();
    if (puzzleNoun && ingredient === puzzleNoun) {
        lastRejectedIngredient = ingredient;
        showInputFeedback('The challenge dish may not be used as an ingredient.', 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    if (blockedFoods.has(ingredient)) {
        lastRejectedIngredient = ingredient;
        showInputFeedback(`"${ingredient}" is not a recognized ingredient.`, 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    if (allowedFoods !== null && !allowedFoods.has(ingredient)) {
        lastRejectedIngredient = ingredient;
        showInputFeedback(`"${ingredient}" is not a recognized ingredient.`, 'highlight');
        if (input) input.setAttribute('aria-invalid', 'true');
        return false;
    }

    lastRejectedIngredient = null;
    if (input) input.setAttribute('aria-invalid', 'false');

    const result = [];
    // Build active arrays from current display state so we can match in original-index space.
    const initialStates = getLetterStatesForDisplay();
    const activeAdj = buildActiveFromStates(initialStates.adj);
    const activeNoun = buildActiveFromStates(initialStates.noun);

    if (input) input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    animationState = {
        ingredient,
        result: [],
        revealedCount: 0
    };
    /* First ingredient: loadRecipe() shows one ??? row. 2nd+: leave DOM as-is (slot for next row already shows ??? from previous loadRecipe). */
    if (gameState.history.length === 0) {
        loadRecipe();
    }

    for (let i = 0; i < ingredient.length; i++) {
        const letter = ingredient[i];
        const matchResult = matchOneLetterActive(letter, activeAdj, activeNoun);
        const { status, lineIndex, indexInLine } = matchResult;
        const item = { letter, status };
        if (status === 'adj' || status === 'noun') {
            item.lineIndex = lineIndex;
            item.indexInLine = indexInLine;
        }
        result.push(item);

        gameState.remainingAdjectives = [activeAdj.chars.join('')];
        gameState.remainingNoun = activeNoun.chars.join('');

        animationState.result = result;
        animationState.revealedCount = i + 1;

        if (i === 0) {
            renderPuzzleStack();
        } else {
            advancePuzzleFlip();
        }

        const recipeContainer = document.getElementById('recipeContainer');
        if (recipeContainer && i === 0) {
            const scrollTarget = recipeContainer.children[gameState.history.length] || recipeContainer.lastElementChild;
            scrollTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }

        // Only pause for the reveal interval when we triggered a flip; skip the beat for unmatched letters.
        const didFlip = status === 'adj' || status === 'noun';
        await sleep(didFlip ? LETTER_REVEAL_MS : 0);
    }

    const FLIP_DURATION_MS = 550;
    const lastItem = result[result.length - 1];
    const lastLetterFlipped = lastItem && (lastItem.status === 'adj' || lastItem.status === 'noun');
    await sleep(lastLetterFlipped ? Math.max(0, FLIP_DURATION_MS - LETTER_REVEAL_MS) : 0);

    animationState = null;
    gameState.moves++;
    gameState.history.push({ ingredient, result });

    const allAdjsEmpty = gameState.remainingAdjectives.every(r => r.replace(/\s/g, '') === '');
    const nounEmpty = (gameState.remainingNoun || '').replace(/\s/g, '') === '';
    const allCleared = allAdjsEmpty && nounEmpty;
    if (allCleared) {
        gameState.isWon = true;
        gameState.justWon = true;
        gameState.justCompleted = true;
        gameState.isElegant = gameState.moves <= ELEGANT_MAX_MOVES;
    } else if (gameState.moves >= MAX_MOVES) {
        gameState.isLost = true;
        gameState.justCompleted = true;
    }

    saveGameState();
    if (gameState.isWon || gameState.isLost) {
        if (window.posthog) posthog.capture('puzzle_completed', { puzzle_date: gameState.puzzleDate, won: gameState.isWon });
        recordGameCompleted();
        const result = recordAttempts();
        lastAttemptWasNewBest = result.isNewBest;
    }
    updateDisplay();
    loadRecipe();
    if (gameState.isWon || gameState.isLost) {
        showCompletionView();
    }
    return true;
}

// Load and display recipe (history) — always show all slots; top ingredient / food waste fade in below when complete
function loadRecipe() {
    const container = document.getElementById('recipeContainer');
    const historyCount = gameState.history.length;
    const animating = animationState !== null;
    const isComplete = gameState.isWon || gameState.isLost;

    /* When we just finished adding 2nd+ ingredient: the slot at index (historyCount-1) already shows ???; update only that row in place so existing rows never blink. (First ingredient uses full rebuild.) */
    let updatedInPlace = false;
    if (!animating && !isComplete && historyCount >= 2 && container.children.length >= historyCount) {
        const lastSlot = container.children[historyCount - 1];
        const contentWrap = lastSlot && lastSlot.querySelector('.recipe-slot-content');
        const placeholder = contentWrap && contentWrap.querySelector('.recipe-placeholder');
        if (placeholder && placeholder.textContent.trim() === '???') {
            const item = gameState.history[historyCount - 1];
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recipe-item';
            item.result.forEach(letterData => {
                const box = document.createElement('div');
                const statusClass = letterData.status || 'plain';
                box.className = 'letter-box ' + statusClass;
                box.textContent = letterData.letter;
                itemDiv.appendChild(box);
            });
            contentWrap.textContent = '';
            contentWrap.appendChild(itemDiv);
            /* Disable transition so we snap to opacity 0; then restore and add visible so 0→1 fade runs. */
            contentWrap.classList.add('recipe-slot-content-no-transition', 'recipe-slot-content-animate-in', 'recipe-slot-content-fade-pending');
            contentWrap.classList.remove('recipe-slot-content-visible');
            lastFadedRecipeCount = historyCount;
            void contentWrap.offsetHeight; /* force reflow so opacity 0 is committed */
            requestAnimationFrame(() => {
                contentWrap.classList.remove('recipe-slot-content-no-transition', 'recipe-slot-content-fade-pending');
                requestAnimationFrame(() => {
                    contentWrap.classList.add('recipe-slot-content-visible');
                });
            });
            updatedInPlace = true;
        }
    }

    if (!updatedInPlace) {
    const maxSlots = MAX_MOVES;
    const totalSlots = animating && !isComplete ? historyCount + 1 : historyCount;
    const slotNodes = [];

    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'recipe-slot';

        const numberDiv = document.createElement('div');
        numberDiv.className = 'recipe-number';
        numberDiv.textContent = `${i + 1}.`;
        slotDiv.appendChild(numberDiv);

        const contentWrap = document.createElement('div');
        contentWrap.className = 'recipe-slot-content';

        if (i < historyCount) {
            const item = gameState.history[i];
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recipe-item';

            item.result.forEach(letterData => {
                const box = document.createElement('div');
                const statusClass = letterData.status || 'plain';
                box.className = 'letter-box ' + statusClass;
                box.textContent = letterData.letter;
                itemDiv.appendChild(box);
            });

            contentWrap.appendChild(itemDiv);
            /* New ingredient: only the content (not the number) gets animate-in + fade-pending, rAF adds visible (fade-in). When just completed: last row fades in too. Otherwise when complete: all visible immediately. */
            const isNewIngredientRow = i === historyCount - 1 && historyCount > 0 && !animating && historyCount > lastFadedRecipeCount;
            const isLastRowJustCompleted = isComplete && gameState.justCompleted && i === historyCount - 1;
            const isLoadWithHistory = historyCount > 0 && !animating && historyCount <= lastFadedRecipeCount;
            if (isComplete && !isLastRowJustCompleted) {
                contentWrap.classList.add('recipe-slot-content-visible');
            } else if (isLastRowJustCompleted) {
                contentWrap.classList.add('recipe-slot-content-no-transition', 'recipe-slot-content-animate-in', 'recipe-slot-content-fade-pending');
            } else if (isNewIngredientRow) {
                contentWrap.classList.add('recipe-slot-content-animate-in', 'recipe-slot-content-fade-pending');
            } else if (isLoadWithHistory) {
                contentWrap.classList.add('recipe-slot-content-animate-in');
            } else {
                contentWrap.classList.add('recipe-slot-content-visible');
            }
        } else if (animating && i === historyCount) {
            const placeholder = document.createElement('div');
            placeholder.className = 'recipe-placeholder';
            placeholder.textContent = '???';
            contentWrap.appendChild(placeholder);
            /* Start at opacity 0 so in-place update to real ingredient gets a proper 0→1 fade (no blip). */
            contentWrap.classList.add('recipe-slot-content-animate-in', 'recipe-slot-content-fade-pending');
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'recipe-placeholder';
            placeholder.textContent = '???';
            contentWrap.appendChild(placeholder);
        }

        slotDiv.appendChild(contentWrap);
        slotNodes.push(slotDiv);
    }

    /* Replace in one go so the recipe never flashes empty (avoids previous ingredients disappearing for a frame). */
    container.replaceChildren(...slotNodes);

    /* Just completed: last ingredient row fades in (same as 2nd+ ingredient in-place path). */
    if (isComplete && gameState.justCompleted && historyCount > 0) {
        const lastSlotIndex = historyCount - 1;
        const lastContent = slotNodes[lastSlotIndex] && slotNodes[lastSlotIndex].querySelector('.recipe-slot-content');
        if (lastContent && lastContent.classList.contains('recipe-slot-content-animate-in')) {
            requestAnimationFrame(() => {
                const currentContainer = document.getElementById('recipeContainer');
                if (!currentContainer) return;
                const slot = currentContainer.querySelectorAll('.recipe-slot')[lastSlotIndex];
                const content = slot && slot.querySelector('.recipe-slot-content');
                if (content && content.classList.contains('recipe-slot-content-animate-in')) {
                    content.classList.remove('recipe-slot-content-no-transition', 'recipe-slot-content-fade-pending');
                }
                requestAnimationFrame(() => {
                    const slot2 = currentContainer.querySelectorAll('.recipe-slot')[lastSlotIndex];
                    const content2 = slot2 && slot2.querySelector('.recipe-slot-content');
                    if (content2 && content2.classList.contains('recipe-slot-content-animate-in')) {
                        content2.classList.add('recipe-slot-content-visible');
                    }
                });
            });
        }
    }

    /* New ingredient: one row's content fades in. Double rAF so the row paints one frame at opacity 0 (visibility visible) before adding visible, so the opacity transition actually runs. */
    if (!isComplete && historyCount > lastFadedRecipeCount && historyCount > 0) {
        lastFadedRecipeCount = historyCount;
        const slotIndex = historyCount - 1;
        const newContent = slotNodes[slotIndex] && slotNodes[slotIndex].querySelector('.recipe-slot-content');
        if (newContent && newContent.classList.contains('recipe-slot-content-animate-in')) {
            requestAnimationFrame(() => {
                const currentContainer = document.getElementById('recipeContainer');
                if (!currentContainer) return;
                const currentSlots = currentContainer.querySelectorAll('.recipe-slot');
                const slot = currentSlots[slotIndex];
                const content = slot && slot.querySelector('.recipe-slot-content');
                if (content && content.classList.contains('recipe-slot-content-animate-in')) {
                    content.classList.remove('recipe-slot-content-fade-pending');
                }
                requestAnimationFrame(() => {
                    const slot2 = currentContainer.querySelectorAll('.recipe-slot')[slotIndex];
                    const content2 = slot2 && slot2.querySelector('.recipe-slot-content');
                    if (content2 && content2.classList.contains('recipe-slot-content-animate-in')) {
                        content2.classList.add('recipe-slot-content-visible');
                    }
                });
            });
        }
    }

    /* Loading/replay: all ingredient rows' content fades in. Double rAF so browser paints one frame at opacity 0 before adding visible (same as daily). */
    if (!isComplete && historyCount > 0 && historyCount <= lastFadedRecipeCount) {
        const countToShow = historyCount;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const currentContainer = document.getElementById('recipeContainer');
                if (!currentContainer) return;
                const currentSlots = currentContainer.querySelectorAll('.recipe-slot');
                for (let j = 0; j < countToShow && j < currentSlots.length; j++) {
                    const content = currentSlots[j].querySelector('.recipe-slot-content');
                    if (content && content.classList.contains('recipe-slot-content-animate-in')) {
                        content.classList.add('recipe-slot-content-visible');
                    }
                }
            });
        });
    }
    }

    /* Animation order when just completed: (1) puzzle message, (2) stats fade in, (3) footer buttons fade in, (4) share green border fades in. When viewing already-complete: show all instantly. */
    const recipeSectionEl = document.getElementById('recipeSection');
    const footerCompletionActionsEl = document.getElementById('footerCompletionActions');
    /* Wait for puzzle-box message to finish (win: ELEGANT/EXCELLENT DISH!; loss: HUGE MESS! — same flip + stagger + flip timing). */
    let puzzleRevealMs = 1000;
    if (isComplete && gameState.justCompleted) {
        const lines = gameState.isWon ? getVictoryMessageLines() : getLossMessageLines();
        const totalChars = lines.reduce((s, line) => s + line.length, 0);
        puzzleRevealMs = 550 + (totalChars - 1) * 80 + 550;
    }
    const STATS_FADE_MS = 900;      /* then stats fade in (slower); delay before buttons */
    const BUTTONS_FADE_MS = 800;    /* then footer buttons fade in; delay before share border */
    const SHARE_BORDER_MS = 600;    /* then share button green border fades in */

    if (isComplete) {
        if (gameState.justCompleted) {
            /* Slots already have recipe-slot-content-visible from build; run victory timing for section + stats + footer only. */
            setTimeout(() => {
                if (recipeSectionEl) recipeSectionEl.classList.add('recipe-section-complete');
                gameState.justCompleted = false;
                setTimeout(() => {
                    if (footerCompletionActionsEl) footerCompletionActionsEl.classList.add('completion-actions-visible');
                    setTimeout(() => {
                        const shareBtn = document.getElementById('footerShareBtn');
                        if (shareBtn) shareBtn.classList.add('nav-btn-share-visible');
                    }, SHARE_BORDER_MS);
                }, STATS_FADE_MS);
            }, puzzleRevealMs);
        } else {
            if (recipeSectionEl) recipeSectionEl.classList.add('recipe-section-complete', 'recipe-section-stats-instant');
            if (footerCompletionActionsEl) footerCompletionActionsEl.classList.add('completion-actions-visible');
            const shareBtn = document.getElementById('footerShareBtn');
            if (shareBtn) shareBtn.classList.add('nav-btn-share-visible');
        }
    } else {
        /* During play, only the newly added row gets recipe-slot-content-visible (in rAF above); other rows already have it from build. */
    }

    const hadStar = getHadStarIngredient();
    const starDiv = document.getElementById('starIngredientDisplay');
    const wasteDiv = document.getElementById('foodWasteDisplay');
    const wastePercent = getWastePercent();
    const star = getStarIngredient();

    if (starDiv) {
        starDiv.textContent = 'TOP INGREDIENT: ' + (star || '???');
        if (hadStar) {
            const starIcon = document.createElement('span');
            starIcon.className = 'completion-stat-icon completion-stat-star';
            starIcon.textContent = ' ⭐';
            starIcon.setAttribute('aria-hidden', 'true');
            starDiv.appendChild(starIcon);
        }
    }

    if (wasteDiv) {
        wasteDiv.textContent = `FOOD WASTE: ${wastePercent}%`;
        if (hadStar) {
            const trophyIcon = document.createElement('span');
            trophyIcon.className = 'completion-stat-icon completion-stat-trophy';
            trophyIcon.textContent = ' 🏆';
            trophyIcon.setAttribute('aria-hidden', 'true');
            wasteDiv.appendChild(trophyIcon);
        }
    }
}


// Generate share text — matches victory modal: message, grid (green/black only, no blanks), top ingredient, food waste
function generateShareText() {
    const puzzleNum = getPuzzleNumber(currentPuzzle);
    const moves = gameState.moves;
    const wastePercent = getWastePercent();
    const starIngredient = getStarIngredient() || '???';

    let text = `wordish #${puzzleNum}\n\n`;

    if (gameState.isWon) {
        const adjRaw = gameState.adjectives[0] || '';
        const nounRaw = gameState.noun || '';
        const adj = adjRaw.replace(/\b\w/g, c => c.toUpperCase());
        const noun = nounRaw.replace(/\b\w/g, c => c.toUpperCase());
        if (gameState.isElegant) {
            text += `I prepared an elegant ${adj} ${noun} using only ${moves} ingredients!\n\n`;
        } else {
            text += `I prepared an excellent ${adj} ${noun} using ${moves} ingredients!\n\n`;
        }
    } else {
        text += `The dish, she is ruined. (${moves} ingredients)\n\n`;
    }

    // Grid: only matched (green) and unmatched (black), no blanks, numbered rows
    gameState.history.forEach((item, index) => {
        const boxes = item.result.map(cell => {
            const status = cell.status || 'plain';
            if (status === 'adj' || status === 'noun') return '🟩';
            return '⬛';  // black for unmatched
        }).join('');
        text += `${index + 1}. ${boxes}\n`;
    });

    if (gameState.isWon) {
        const hadStar = getHadStarIngredient();
        text += `\nTop ingredient: ${starIngredient}${hadStar ? ' ⭐' : ''}\n`;
        text += wastePercent <= TROPHY_WASTE_PERCENT ? `Food waste: ${wastePercent}% 🏆` : `Food waste: ${wastePercent}%`;
    }

    return text;
}

// Share button handler
function handleShare() {
    const shareText = generateShareText();
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            showCopiedModal();
        }).catch(() => {
            copyToClipboardFallback(shareText);
        });
    } else {
        copyToClipboardFallback(shareText);
    }
}

function showCopiedModal() {
    const modalEl = document.querySelector('.modal');
    if (modalEl) modalEl.classList.add('modal--copy-success');
    openModal('', '<p class="copy-success-message">RESULTS COPIED TO CLIPBOARD</p>');
    if (window.copiedModalTimeout) clearTimeout(window.copiedModalTimeout);
    window.copiedModalTimeout = setTimeout(() => {
        closeModal();
        window.copiedModalTimeout = null;
    }, 2500);
}

function copyToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showCopiedModal();
    } catch (err) {
        alert('Could not copy to clipboard. Please copy manually:\n\n' + text);
    }
    document.body.removeChild(textarea);
}

// Load a specific puzzle
function loadPuzzle(puzzle) {
    if (!puzzle) return;

    lastRejectedIngredient = null;
    showInputFeedback('');
    const inputEl = document.getElementById('ingredientInput');
    if (inputEl) inputEl.value = '';

    currentPuzzle = puzzle;
    const puzzleDate = puzzle.date;
    document.getElementById('dateDisplay').textContent = `#${getPuzzleNumber(puzzle)}`;
    
    const adjList = getPuzzleAdjectives(puzzle);
    const dishName = [...adjList, puzzle.noun].filter(Boolean).join(' ');
    document.getElementById('dishName').textContent = `"${dishName}"`;

    const loadedState = loadSavedState(puzzle);
    if (loadedState) {
        gameState = loadedState;
    } else {
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateReplayViewClass();
    updateDisplay();
    loadRecipe();
    if (gameState.isWon || gameState.isLost) {
        showCompletionView();
    }
    updatePuzzleLabel();
    updateFooterTodayButton();
    updatePreviousButtonState();
}

// TODAY button: go to today's puzzle (and retry if already on today)
function handleTodayClick() {
    // Always clear debug date override so "today" means real today, not a stored override
    debugDateOverride = null;
    try {
        localStorage.removeItem('dish_of_the_day_debug_date');
    } catch (e) {}

    const today = getRealHelsinkiDate();
    if (currentView === 'archive') {
        const todayPuzzle = findTodayPuzzle();
        if (todayPuzzle) {
            loadPuzzle(todayPuzzle);
            showGameView();
            updatePuzzleLabel();
        }
        return;
    }
    if (currentPuzzle && currentPuzzle.date !== today) {
        resetDebugDate();
        return;
    }
    handleRetry();
}

// Handle retry (same puzzle, clear state)
function handleRetry() {
    if (!currentPuzzle) return;

    lastRejectedIngredient = null;
    showInputFeedback('');
    const inputEl = document.getElementById('ingredientInput');
    if (inputEl) inputEl.value = '';

    try {
        localStorage.removeItem(`dish_of_the_day_${currentPuzzle.date}`);
    } catch (error) {
        console.error('Error removing from localStorage:', error);
    }

    resetGameState();
    updateDisplay();
    loadRecipe();
    
    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');
    input.disabled = false;
    input.placeholder = 'type an ingredient here';
    submitBtn.disabled = false;
    // Don't auto-focus input - let user tap when ready (avoids mobile keyboard popup)
}

// Show archive view and render calendar
function showArchiveView() {
    currentView = 'archive';
    document.body.classList.add('archive-view');
    updateReplayViewClass();
    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('archiveContainer').style.display = 'flex';
    const today = getRealHelsinkiDate();
    const [y, m] = today.split('-').map(Number);
    archiveCalendarYear = y;
    archiveCalendarMonth = m;
    renderArchiveCalendar();
    updateFooterTodayButton();
}

// Show game view (from archive or init)
function showGameView() {
    currentView = 'game';
    document.body.classList.remove('archive-view');
    updateReplayViewClass();
    document.getElementById('archiveContainer').style.display = 'none';
    const hasPuzzle = currentPuzzle && puzzles.find(p => p.date === currentPuzzle.date);
    if (!hasPuzzle) {
        document.getElementById('noPuzzleMessage').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
    } else {
        document.getElementById('noPuzzleMessage').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'flex';
    }
    updateFooterTodayButton();
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
    return new Date(year, month - 1, 1).getDay();
}

function getArchiveYearOptions() {
    const currentYear = new Date().getFullYear();
    if (!puzzles.length) return [currentYear - 1, currentYear, currentYear + 1];
    const fromPuzzles = [...new Set(puzzles.map(p => (p.date || '').slice(0, 4)).filter(Boolean))].map(Number).sort((a, b) => a - b);
    const combined = new Set([...fromPuzzles, currentYear]);
    return [...combined].sort((a, b) => a - b);
}

// Earliest and latest (year, month) that have puzzles; null if no puzzles
function getArchiveMonthRange() {
    if (!puzzles.length) return null;
    const dates = puzzles.map(p => (p.date || '').trim()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!dates.length) return null;
    const minDate = dates.reduce((a, b) => (a <= b ? a : b));
    const maxDate = dates.reduce((a, b) => (a >= b ? a : b));
    return {
        minYear: parseInt(minDate.slice(0, 4), 10),
        minMonth: parseInt(minDate.slice(5, 7), 10),
        maxYear: parseInt(maxDate.slice(0, 4), 10),
        maxMonth: parseInt(maxDate.slice(5, 7), 10)
    };
}

function earnedTrophyForDate(dateStr) {
    const entry = getAttemptsData()[dateStr];
    // best is only set when the player won, so its presence means a completed puzzle; trophy = waste <= TROPHY_WASTE_PERCENT
    return entry && entry.best && entry.best.waste <= TROPHY_WASTE_PERCENT;
}

// Derive star-ingredient from saved game state (for attempts saved before we stored hadStarIngredient)
function getHadStarIngredientFromSavedState(dateStr) {
    try {
        const raw = localStorage.getItem(`dish_of_the_day_${dateStr}`);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.history)) return false;
        return parsed.history.some(item => {
            const matches = (item.result || []).filter(r => r.status === 'adj' || r.status === 'noun').length;
            return matches >= STAR_MATCH_THRESHOLD;
        });
    } catch (_) {
        return false;
    }
}

function hadStarIngredientForDate(dateStr) {
    const entry = getAttemptsData()[dateStr];
    if (entry && entry.hadStarIngredient === true) return true;
    return getHadStarIngredientFromSavedState(dateStr);
}

function getAttemptEntryForDate(dateStr) {
    return getAttemptsData()[dateStr];
}

// Build and render archive calendar (month/year dropdowns + 7-column grid, puzzle # and trophy per tile)
function renderArchiveCalendar() {
    const monthSelect = document.getElementById('archiveMonthSelect');
    const yearSelect = document.getElementById('archiveYearSelect');
    const gridEl = document.getElementById('archiveCalendarGrid');
    const prevBtn = document.getElementById('archivePrevMonthBtn');
    const nextBtn = document.getElementById('archiveNextMonthBtn');
    if (!monthSelect || !yearSelect || !gridEl) return;

    let yearOpts = getArchiveYearOptions();
    if (!yearOpts.includes(archiveCalendarYear)) {
        yearOpts = [...yearOpts, archiveCalendarYear].sort((a, b) => a - b);
    }
    const attempts = getAttemptsData();

    const range = getArchiveMonthRange();
    const canGoPrev = range && (archiveCalendarYear > range.minYear || (archiveCalendarYear === range.minYear && archiveCalendarMonth > range.minMonth));
    const canGoNext = range && (archiveCalendarYear < range.maxYear || (archiveCalendarYear === range.maxYear && archiveCalendarMonth < range.maxMonth));

    if (prevBtn) {
        prevBtn.disabled = !canGoPrev;
        prevBtn.onclick = () => {
            if (!canGoPrev) return;
            if (archiveCalendarMonth === 1) {
                archiveCalendarMonth = 12;
                archiveCalendarYear--;
            } else {
                archiveCalendarMonth--;
            }
            renderArchiveCalendar();
        };
    }
    if (nextBtn) {
        nextBtn.disabled = !canGoNext;
        nextBtn.onclick = () => {
            if (!canGoNext) return;
            if (archiveCalendarMonth === 12) {
                archiveCalendarMonth = 1;
                archiveCalendarYear++;
            } else {
                archiveCalendarMonth++;
            }
            renderArchiveCalendar();
        };
    }

    monthSelect.innerHTML = '';
    MONTH_NAMES.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = String(i + 1);
        opt.textContent = name;
        monthSelect.appendChild(opt);
    });
    monthSelect.value = String(archiveCalendarMonth);
    monthSelect.onchange = () => {
        archiveCalendarMonth = parseInt(monthSelect.value, 10);
        renderArchiveCalendar();
    };

    yearSelect.innerHTML = '';
    yearOpts.forEach(y => {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        yearSelect.appendChild(opt);
    });
    yearSelect.value = String(archiveCalendarYear);
    yearSelect.onchange = () => {
        archiveCalendarYear = parseInt(yearSelect.value, 10);
        renderArchiveCalendar();
    };

    const firstDay = getFirstDayOfMonth(archiveCalendarYear, archiveCalendarMonth);
    const daysInMonth = getDaysInMonth(archiveCalendarYear, archiveCalendarMonth);
    const pad = n => String(n).padStart(2, '0');
    const today = getRealHelsinkiDate();

    const rowsNeeded = Math.ceil((firstDay + daysInMonth) / 7);
    const totalCells = rowsNeeded * 7;

    gridEl.innerHTML = '';
    for (let i = 0; i < totalCells; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'archive-cell-wrapper';
        const tile = document.createElement('div');
        tile.className = 'archive-calendar-tile';
        const dayIndex = i - firstDay;
        if (dayIndex < 0 || dayIndex >= daysInMonth) {
            tile.classList.add('archive-calendar-tile-empty');
            wrapper.appendChild(tile);
            const emptyNum = document.createElement('span');
            emptyNum.className = 'archive-tile-num archive-tile-num-placeholder';
            emptyNum.setAttribute('aria-hidden', 'true');
            wrapper.appendChild(emptyNum);
            gridEl.appendChild(wrapper);
            continue;
        }
        const day = dayIndex + 1;
        const dateStr = `${archiveCalendarYear}-${pad(archiveCalendarMonth)}-${pad(day)}`;
        const isPastOrToday = dateStr <= today;
        const puzzle = isPastOrToday ? puzzles.find(p => p.date === dateStr) : null;
        if (puzzle) {
            tile.classList.add('archive-calendar-tile-filled');
            const num = getPuzzleNumber(puzzle);
            const entry = getAttemptEntryForDate(dateStr);
            const completed = !!entry;
            const won = entry && entry.first && (entry.best || entry.first.won);
            const trophy = earnedTrophyForDate(dateStr);
            const star = hadStarIngredientForDate(dateStr);

            if (!completed) {
                const q = document.createElement('span');
                q.className = 'archive-tile-main archive-tile-q';
                q.textContent = '?';
                tile.appendChild(q);
            } else {
                const main = document.createElement('span');
                main.className = 'archive-tile-main';
                const movesVal = entry.first ? (won ? (entry.best ? entry.best.moves : entry.first.moves) : 'X') : '?';
                main.textContent = String(movesVal);
                tile.appendChild(main);
                if (won && (trophy || star)) {
                    const bottom = document.createElement('div');
                    bottom.className = 'archive-tile-bottom';
                    if (trophy) {
                        const ll = document.createElement('span');
                        ll.className = 'archive-tile-ll';
                        ll.textContent = '🏆';
                        bottom.appendChild(ll);
                    }
                    if (star) {
                        const lr = document.createElement('span');
                        lr.className = 'archive-tile-lr';
                        lr.textContent = '⭐';
                        bottom.appendChild(lr);
                    }
                    tile.appendChild(bottom);
                }
            }
            tile.dataset.date = dateStr;
            tile.setAttribute('role', 'button');
            tile.setAttribute('tabindex', '0');
            const ariaParts = [`Puzzle ${num}`];
            if (completed) ariaParts.push(entry.first ? (won ? `${entry.best ? entry.best.moves : entry.first.moves} ingredients` : 'Not completed') : '?');
            if (trophy) ariaParts.push('food waste trophy');
            if (star) ariaParts.push('star ingredient');
            tile.setAttribute('aria-label', ariaParts.join(', '));
            tile.addEventListener('click', () => {
                if (dateStr === today) {
                    debugDateOverride = null;
                    try { localStorage.removeItem('dish_of_the_day_debug_date'); } catch (e) {}
                    const todayPuzzle = findTodayPuzzle();
                    if (todayPuzzle) {
                        loadPuzzle(todayPuzzle);
                        showGameView();
                        updatePuzzleLabel();
                        updateReplayViewClass();
                    }
                } else {
                    loadPuzzle(puzzle);
                    showGameView();
                    updatePuzzleLabel();
                }
            });
            tile.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tile.click();
                }
            });
            wrapper.appendChild(tile);
            const numEl = document.createElement('span');
            numEl.className = 'archive-tile-num';
            numEl.textContent = `#${num}`;
            wrapper.appendChild(numEl);
        } else {
            tile.classList.add('archive-calendar-tile-empty');
            wrapper.appendChild(tile);
            const emptyNum = document.createElement('span');
            emptyNum.className = 'archive-tile-num archive-tile-num-placeholder';
            emptyNum.setAttribute('aria-hidden', 'true');
            wrapper.appendChild(emptyNum);
        }
        gridEl.appendChild(wrapper);
    }
}

// ARCHIVE button: show archive view
function handleArchive() {
    showArchiveView();
}

// Footer: previous puzzle in archive (when viewing a replay)
function handlePrevPuzzle() {
    if (!currentPuzzle || !puzzles.length) return;
    const idx = puzzles.findIndex(p => p.date === currentPuzzle.date);
    if (idx <= 0) return;
    loadPuzzle(puzzles[idx - 1]);
}

// Footer: next puzzle in archive; if next is today, go to today's puzzle (not archive version)
function handleNextPuzzle() {
    if (!currentPuzzle || !puzzles.length) return;
    const idx = puzzles.findIndex(p => p.date === currentPuzzle.date);
    if (idx < 0 || idx >= puzzles.length - 1) return;
    const nextPuzzle = puzzles[idx + 1];
    if (nextPuzzle.date === getRealHelsinkiDate()) {
        debugDateOverride = null;
        try { localStorage.removeItem('dish_of_the_day_debug_date'); } catch (e) {}
        const todayPuzzle = findTodayPuzzle();
        if (todayPuzzle) loadPuzzle(todayPuzzle);
    } else {
        loadPuzzle(nextPuzzle);
    }
}

// Footer: replay current puzzle (reset and play again)
function handleReplayClick() {
    if (!currentPuzzle) return;
    const puzzle = currentPuzzle;
    try {
        localStorage.removeItem(`dish_of_the_day_${puzzle.date}`);
    } catch (_) {}
    loadPuzzle(puzzle);
}

// Reset debug date override
function resetDebugDate() {
    debugDateOverride = null;
    try {
        localStorage.removeItem('dish_of_the_day_debug_date');
    } catch (error) {
        console.error('Error removing debug date from localStorage:', error);
    }
    initGame();
}

// Handle reset to today button
function handleResetToToday() {
    resetDebugDate();
}

// Countdown timer to midnight Helsinki time
function startCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    function updateCountdown() {
        const now = new Date();
        const helsinkiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
        
        // Get midnight Helsinki time tomorrow
        const midnightHelsinki = new Date(helsinkiNow);
        midnightHelsinki.setDate(midnightHelsinki.getDate() + 1);
        midnightHelsinki.setHours(0, 0, 0, 0);
        
        const diff = midnightHelsinki - helsinkiNow;
        
        if (diff <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            debugDateOverride = null;
            try {
                localStorage.removeItem('dish_of_the_day_debug_date');
            } catch (e) {}
            closeModal();
            initGame();
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('countdownTimer').textContent = display;
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// Help modal: build puzzle-stack HTML using game tile classes (no images)
// lines = array of strings (e.g. ['APPEALING', 'CANNOLI']); matchedIndices = set of flat indices to show as green
function buildHelpPuzzleStack(lines, matchedIndices) {
    let flatIndex = 0;
    const lineHtml = lines.map((line) => {
        const cells = [];
        for (let i = 0; i < line.length; i++) {
            const isMatched = matchedIndices && matchedIndices.has(flatIndex);
            const char = line[i];
            flatIndex++;
            if (isMatched) {
                cells.push('<div class="puzzle-letter puzzle-letter-matched puzzle-matched-box"></div>');
            } else {
                const esc = char === ' ' ? '\u00A0' : char;
                cells.push(`<span class="puzzle-letter puzzle-letter-active">${esc}</span>`);
            }
        }
        return `<div class="puzzle-line">${cells.join('')}</div>`;
    });
    return `<div class="puzzle-stack help-puzzle-example" role="img" aria-label="Dish: ${lines.join(' ')}">${lineHtml.join('')}</div>`;
}

// Help modal content (shared by help button and first-time auto-show)
function getHelpContent() {
    const line0 = 'APPEALING';
    const line1 = 'CANNOLI';
    const lines = [line0, line1];
    // BANANA matches left-to-right: B discarded, then A,N,A,N,A → positions 0,7,4,11,10 (flat)
    const matchedAfterBanana = new Set([0, 4, 7, 10, 11]);
    const beforeHtml = buildHelpPuzzleStack(lines, null);
    const afterHtml = buildHelpPuzzleStack(lines, matchedAfterBanana);

    const scoringTileHtml = `
        <div class="help-example help-archive-example">
            <div class="archive-cell-wrapper help-archive-tile-wrapper">
                <div class="archive-calendar-tile archive-calendar-tile-filled help-archive-tile" role="img" aria-label="Example archive tile: 3 ingredients, food waste trophy, star ingredient, puzzle 001">
                    <span class="archive-tile-main">3</span>
                    <div class="archive-tile-bottom">
                        <span class="archive-tile-ll">🏆</span>
                        <span class="archive-tile-lr">⭐</span>
                    </div>
                </div>
                <span class="archive-tile-num">#001</span>
            </div>
        </div>`;

    return `
        <div class="help-pages">
            <div class="help-page help-page-1">
                <div class="help-content">
                    <p>Complete the puzzle by entering ingredients that share letters with the dish of the day.</p>
                    <p>Each time you submit a valid ingredient, its letters will match against the dish one at a time, left to right.</p>
                    <p>A valid ingredient is a food, a single word, and 12 letters or less.</p>
                    <p class="help-label">Example</p>
                    <p>Adding the ingredient <strong>BANANA</strong> to this:</p>
                    <div class="help-example">${beforeHtml}</div>
                    <p>Would produce this:</p>
                    <div class="help-example">${afterHtml}</div>
                    <p>With the <strong>A</strong>, <strong>N</strong>, <strong>A</strong>, <strong>N</strong>, and <strong>A</strong> matching and the <strong>B</strong> discarded.</p>
                    <p>A dish is prepared successfully if all of its letters are matched using five ingredients or fewer.</p>
                </div>
                <div class="help-pagination">
                    <button type="button" class="help-nav help-nav-prev" disabled aria-label="Previous page">←</button>
                    <span class="help-page-indicator">1/2</span>
                    <button type="button" class="help-nav help-nav-next" aria-label="Next page">→</button>
                </div>
            </div>
            <div class="help-page help-page-2" hidden>
                <div class="help-content">
                    <p>Try to complete the dish using as few ingredients as possible.</p>
                    <p>Earn a star if at least one ingredient matches 6 or more letters.</p>
                    <p>Earn a trophy if your food waste (the percent of unmatched letters) is 25% or less.</p>
                    <p>See your best dishes in the archive, which shows all three judging criteria for every puzzle you've completed.</p>
                    ${scoringTileHtml}
                </div>
                <div class="help-pagination">
                    <button type="button" class="help-nav help-nav-prev" aria-label="Previous page">←</button>
                    <span class="help-page-indicator">2/2</span>
                    <button type="button" class="help-nav help-nav-next" disabled aria-label="Next page">→</button>
                </div>
            </div>
        </div>
    `;
}

function showHelpModal() {
    openModal('How to Play', getHelpContent());
    const modalContent = document.getElementById('modalContent');
    const modalTitle = document.getElementById('modalTitle');
    const pagesContainer = modalContent.querySelector('.help-pages');
    const page1 = modalContent.querySelector('.help-page-1');
    const page2 = modalContent.querySelector('.help-page-2');
    const prevBtns = modalContent.querySelectorAll('.help-nav-prev');
    const nextBtns = modalContent.querySelectorAll('.help-nav-next');

    function setHelpPagesHeight() {
        if (!pagesContainer || !page1) return;
        page1.hidden = false;
        page2.hidden = true;
        requestAnimationFrame(() => {
            const h = page1.offsetHeight;
            pagesContainer.style.height = h + 'px';
        });
    }

    function goToPage(page) {
        if (page === 1) {
            page1.hidden = false;
            page2.hidden = true;
            if (modalTitle) modalTitle.textContent = 'How to Play';
        } else {
            page1.hidden = true;
            page2.hidden = false;
            if (modalTitle) modalTitle.textContent = 'SCORING';
        }
    }

    setHelpPagesHeight();
    goToPage(1);

    prevBtns.forEach((btn) => {
        btn.addEventListener('click', () => goToPage(1));
    });
    nextBtns.forEach((btn) => {
        btn.addEventListener('click', () => goToPage(2));
    });
}

function getSettingsContent() {
    return `
        <div class="settings-content">
            <div class="settings-dark-mode">
                <div class="settings-dark-mode-label">
                    <span class="settings-dark-mode-title">Dark mode</span>
                    <span class="settings-dark-mode-hint">Use a dark theme.</span>
                </div>
                <label class="settings-toggle">
                    <input type="checkbox" id="settingsDarkModeCheckbox" role="switch" aria-label="Dark mode">
                    <span class="settings-toggle-track"></span>
                </label>
            </div>
            <div class="stats-reset">
                <p class="stats-reset-hint">To reset your profile, type "RESET" into the box below and confirm. <span class="stats-reset-underline">This action cannot be undone.</span></p>
                <div class="stats-reset-row">
                    <input type="text" id="settingsResetInput" placeholder="type here" autocomplete="off" aria-label="Type RESET to confirm">
                    <button type="button" id="settingsResetBtn" class="stats-reset-btn">CONFIRM</button>
                </div>
            </div>
        </div>
    `;
}

function showSettingsModal() {
    openModal('Settings', getSettingsContent());
    setTimeout(() => {
        const darkCheckbox = document.getElementById('settingsDarkModeCheckbox');
        if (darkCheckbox) {
            darkCheckbox.checked = isDarkMode();
            darkCheckbox.setAttribute('aria-checked', darkCheckbox.checked);
            darkCheckbox.addEventListener('change', () => {
                setDarkMode(darkCheckbox.checked);
                darkCheckbox.setAttribute('aria-checked', darkCheckbox.checked);
            });
        }
        const input = document.getElementById('settingsResetInput');
        const btn = document.getElementById('settingsResetBtn');
        const modalContent = document.getElementById('modalContent');
        if (btn) btn.addEventListener('click', handleProfileReset);
        if (input) {
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleProfileReset(); });
            if (window.matchMedia('(max-width: 768px)').matches && modalContent && window.visualViewport) {
                function scrollResetInputAboveKeyboard() {
                    const vv = window.visualViewport;
                    const rect = input.getBoundingClientRect();
                    const marginAboveKeyboard = 220;
                    const visibleBottom = vv.height - marginAboveKeyboard;
                    if (rect.bottom > visibleBottom) {
                        modalContent.scrollTop += (rect.bottom - visibleBottom);
                    }
                }
                input.addEventListener('focus', () => {
                    setTimeout(scrollResetInputAboveKeyboard, 100);
                    setTimeout(scrollResetInputAboveKeyboard, 400);
                    window.visualViewport.addEventListener('resize', scrollResetInputAboveKeyboard);
                    window.visualViewport.addEventListener('scroll', scrollResetInputAboveKeyboard);
                });
                input.addEventListener('blur', () => {
                    window.visualViewport.removeEventListener('resize', scrollResetInputAboveKeyboard);
                    window.visualViewport.removeEventListener('scroll', scrollResetInputAboveKeyboard);
                });
            }
        }
    }, 0);
}

// Stats modal content and open
function getStatsContent() {
    const s = getStats();
    return `
        <div class="stats-content">
            <div class="stats-grid">
                <div class="stats-cell">
                    <div class="stats-label">Dishes Prepared</div>
                    <div class="stats-value">${s.dishesAttempted}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Win Streak</div>
                    <div class="stats-value">${s.successStreak}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Total Trophies</div>
                    <div class="stats-value">${s.totalTrophies} 🏆</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Total Stars</div>
                    <div class="stats-value">${s.totalStars} ⭐</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Av. Ingredients</div>
                    <div class="stats-value">${s.averageIngredients}</div>
                </div>
                <div class="stats-cell">
                    <div class="stats-label">Av. Waste</div>
                    <div class="stats-value">${s.averageWastePercent}%</div>
                </div>
            </div>
        </div>
    `;
}

function showStatsModal() {
    openModal('My Stats', getStatsContent());
}

function handleProfileReset() {
    const input = document.getElementById('settingsResetInput');
    if (!input || (input.value || '').trim().toUpperCase() !== 'RESET') return;
    try {
        localStorage.removeItem(STATS_KEY);
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('dish_of_the_day_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        closeModal();
        initGame();
    } catch (e) {
        console.error('Error resetting profile:', e);
    }
}

// About modal contact form — submit via Web3Forms API, show result in modal
async function handleAboutFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const statusEl = document.getElementById('aboutContactStatus');
    if (!form || !statusEl) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
    }
    statusEl.style.display = 'block';
    statusEl.textContent = '';
    statusEl.classList.remove('about-contact-status--error');
    const formData = new FormData(form);
    try {
        const res = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            statusEl.textContent = 'Thanks, your message was sent.';
            form.style.display = 'none';
        } else {
            statusEl.textContent = data.message || 'Something went wrong. Please try again.';
            statusEl.classList.add('about-contact-status--error');
        }
    } catch (err) {
        statusEl.textContent = 'Could not send. Please try again later.';
        statusEl.classList.add('about-contact-status--error');
    }
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send';
    }
}

// Modal functions
function openModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    const modalContent = document.getElementById('modalContent');
    modalContent.innerHTML = content || '<p style="color: #8080a4; text-align: center;">Coming soon...</p>';
    modalContent.scrollTop = 0;
    document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    const modalEl = document.querySelector('.modal');
    if (modalEl) modalEl.classList.remove('modal--copy-success');
    if (window.copiedModalTimeout) {
        clearTimeout(window.copiedModalTimeout);
        window.copiedModalTimeout = null;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    setDarkMode(isDarkMode());
    await loadPuzzles();
    await loadFoodLists();
    initGame();

    // Show help modal for first-time players
    try {
        const helpShown = localStorage.getItem('dish_of_the_day_help_shown');
        if (!helpShown) {
            showHelpModal();
            localStorage.setItem('dish_of_the_day_help_shown', '1');
        }
    } catch (e) {
        // localStorage may be unavailable (private browsing, etc.)
    }

    const input = document.getElementById('ingredientInput');
    const submitBtn = document.getElementById('submitBtn');

    submitBtn.addEventListener('click', async () => {
        const ingredient = input.value.trim();
        if (ingredient) {
            const accepted = await processIngredient(ingredient);
            if (accepted) {
                input.value = '';
                if (!gameState.isWon && !gameState.isLost) input.focus();
            }
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    function normalizeIngredientInput(inputEl) {
        if (!inputEl) return;
        inputEl.value = (inputEl.value || '').replace(/[^A-Za-z]/g, '').toUpperCase();
        updateInputValidationState();
    }

    input.addEventListener('input', (e) => {
        // Don't overwrite value while IME/composition is active (e.g. iOS spell-check suggestion).
        // Otherwise tapping a suggestion won't replace the word in the field.
        if (e.isComposing) return;
        normalizeIngredientInput(e.target);
    });

    input.addEventListener('compositionend', (e) => {
        // After suggestion is committed, normalize (letters only, uppercase).
        normalizeIngredientInput(e.target);
    });

    // Navigation buttons
    const prevBtn = document.getElementById('prevBtn');
    const retryBtn = document.getElementById('retryBtn');

    prevBtn.addEventListener('click', handleArchive);
    retryBtn.addEventListener('click', handleTodayClick);

    // Footer replay controls (when viewing an archive puzzle; REPLAY is in completion section)
    const prevPuzzleBtn = document.getElementById('prevPuzzleBtn');
    const nextPuzzleBtn = document.getElementById('nextPuzzleBtn');
    if (prevPuzzleBtn) prevPuzzleBtn.addEventListener('click', handlePrevPuzzle);
    if (nextPuzzleBtn) nextPuzzleBtn.addEventListener('click', handleNextPuzzle);

    // Reset to Today button
    const resetToTodayBtn = document.getElementById('resetToTodayBtn');
    if (resetToTodayBtn) {
        resetToTodayBtn.addEventListener('click', handleResetToToday);
    }

    // Modal buttons
    document.getElementById('statsBtn').addEventListener('click', showStatsModal);
    document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
    document.getElementById('helpBtn').addEventListener('click', showHelpModal);

    const WEB3FORMS_ACCESS_KEY = '0f17baa3-f330-4950-9e12-bddefff7b16a';
    const PANTRY_SUBMIT_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdAPkSeB_acSdPLHas0YJFrj4-nlYGqhXSt72PZpghnTOLMNw/viewform?usp=sharing&ouid=112269985430641044011';
    const aboutContent = `<div class="about-content">
            <p>Wordish was made by Mike Kayatta.</p>
            <p>If you're looking for a fantastic first ingredient for <a href="#" id="aboutPuzzle001Link" class="about-content-link">puzzle #001</a>, why not try <strong>ANGELICA</strong>?</p>
            <p>If you'd like to submit an ingredient for possible inclusion, you can <a href="${PANTRY_SUBMIT_URL}" target="_blank" rel="noopener noreferrer" class="about-content-link">do so here</a>. For other inquiries and comments, use the contact form below.</p>
            <form id="aboutContactForm" class="about-contact-form" action="https://api.web3forms.com/submit" method="POST">
                <input type="hidden" name="access_key" value="${WEB3FORMS_ACCESS_KEY}">
                <input type="hidden" name="subject" value="Wordish contact">
                <label class="about-form-label" for="aboutContactName">Name</label>
                <input type="text" id="aboutContactName" name="name" class="about-form-input" required autocomplete="name">
                <label class="about-form-label" for="aboutContactEmail">Email</label>
                <input type="email" id="aboutContactEmail" name="email" class="about-form-input" required autocomplete="email">
                <label class="about-form-label" for="aboutContactMessage">Message</label>
                <textarea id="aboutContactMessage" name="message" class="about-form-textarea" required rows="4"></textarea>
                <button type="submit" class="about-form-submit">Send</button>
            </form>
            <p id="aboutContactStatus" class="about-contact-status" aria-live="polite" style="display: none;"></p>
        </div>`;
    function attachAboutModalHandlers() {
        const form = document.getElementById('aboutContactForm');
        const statusEl = document.getElementById('aboutContactStatus');
        if (form) {
            form.style.display = '';
            if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
            form.onsubmit = null;
            form.onsubmit = handleAboutFormSubmit;
        }
        const puzzle001Link = document.getElementById('aboutPuzzle001Link');
        if (puzzle001Link) {
            puzzle001Link.onclick = (e) => {
                e.preventDefault();
                closeModal();
                if (puzzles.length > 0) {
                    loadPuzzle(puzzles[0]);
                    showGameView();
                }
            };
        }
        // On mobile: keep focused input/textarea above keyboard when About form is used
        const modalContent = document.getElementById('modalContent');
        if (window.matchMedia('(max-width: 768px)').matches && modalContent && window.visualViewport) {
            const aboutInputs = [
                document.getElementById('aboutContactName'),
                document.getElementById('aboutContactEmail'),
                document.getElementById('aboutContactMessage')
            ].filter(Boolean);
            const MARGIN_ABOVE_KEYBOARD = 280;
            function scrollFocusedAboveKeyboard() {
                const active = document.activeElement;
                if (!active || !aboutInputs.includes(active)) return;
                const vv = window.visualViewport;
                const modalRect = modalContent.getBoundingClientRect();
                const visibleBottom = vv.height - MARGIN_ABOVE_KEYBOARD;
                const visibleHeight = visibleBottom - modalRect.top;
                if (visibleHeight <= 0) return;
                const elBottomInContent = active.offsetTop + active.offsetHeight;
                const scrollToShowBottom = elBottomInContent - visibleHeight;
                const maxScroll = Math.max(0, modalContent.scrollHeight - modalContent.clientHeight);
                const targetScroll = Math.max(0, Math.min(scrollToShowBottom, maxScroll));
                modalContent.scrollTop = targetScroll;
            }
            aboutInputs.forEach((el) => {
                el.addEventListener('focus', () => {
                    setTimeout(scrollFocusedAboveKeyboard, 100);
                    setTimeout(scrollFocusedAboveKeyboard, 400);
                    setTimeout(scrollFocusedAboveKeyboard, 800);
                    window.visualViewport.addEventListener('resize', scrollFocusedAboveKeyboard);
                    window.visualViewport.addEventListener('scroll', scrollFocusedAboveKeyboard);
                });
                el.addEventListener('blur', () => {
                    window.visualViewport.removeEventListener('resize', scrollFocusedAboveKeyboard);
                    window.visualViewport.removeEventListener('scroll', scrollFocusedAboveKeyboard);
                });
            });
        }
    }
    document.getElementById('infoBtn').addEventListener('click', () => {
        openModal('About Wordish', aboutContent);
        attachAboutModalHandlers();
    });

    // Mobile hamburger menu: toggle dropdown and menu item actions
    const menuMobileBtn = document.getElementById('menuMobileBtn');
    const menuMobileDropdown = document.getElementById('menuMobileDropdown');
    function closeMobileMenu() {
        if (menuMobileDropdown && !menuMobileDropdown.hasAttribute('hidden')) {
            menuMobileDropdown.setAttribute('hidden', '');
            if (menuMobileBtn) menuMobileBtn.setAttribute('aria-expanded', 'false');
        }
    }
    function openMobileMenu() {
        if (menuMobileDropdown && menuMobileBtn) {
            menuMobileDropdown.removeAttribute('hidden');
            menuMobileBtn.setAttribute('aria-expanded', 'true');
        }
    }
    if (menuMobileBtn && menuMobileDropdown) {
        menuMobileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menuMobileDropdown.hasAttribute('hidden')) openMobileMenu();
            else closeMobileMenu();
        });
        document.getElementById('menuMobileAbout').addEventListener('click', () => {
            openModal('About Wordish', aboutContent);
            attachAboutModalHandlers();
            closeMobileMenu();
        });
        document.getElementById('menuMobileHelp').addEventListener('click', () => {
            showHelpModal();
            closeMobileMenu();
        });
        document.getElementById('menuMobileStats').addEventListener('click', () => {
            showStatsModal();
            closeMobileMenu();
        });
        document.getElementById('menuMobileSettings').addEventListener('click', () => {
            showSettingsModal();
            closeMobileMenu();
        });
        document.addEventListener('click', (e) => {
            if (menuMobileDropdown && !menuMobileDropdown.hasAttribute('hidden') &&
                !menuMobileDropdown.contains(e.target) && e.target !== menuMobileBtn) {
                closeMobileMenu();
            }
        });
    }
    document.getElementById('modalClose').addEventListener('click', closeModal);
    
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalOverlay')) {
            closeModal();
        }
    });
    
    // Close modal and mobile menu on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
            closeModal();
        }
    });

    // Handle mobile keyboard — hide footer when open to free space; allow scroll so input stays visible
    if (window.visualViewport && window.matchMedia('(max-width: 768px)').matches) {
        const footer = document.querySelector('.game-footer');
        let initialHeight = window.visualViewport.height;
        let keyboardOpen = false;

        function updateKeyboardState() {
            const vv = window.visualViewport;
            const currentHeight = vv.height;
            const heightDiff = initialHeight - currentHeight;

            if (heightDiff > 100) {
                if (!keyboardOpen) {
                    keyboardOpen = true;
                    document.documentElement.classList.add('keyboard-open');
                    if (footer) footer.style.display = 'none';
                    document.body.style.overflowY = 'auto';
                }
                // Scroll input into view above keyboard
                requestAnimationFrame(() => {
                    input.scrollIntoView({ block: 'center', behavior: 'auto' });
                });
            } else if (keyboardOpen) {
                keyboardOpen = false;
                document.documentElement.classList.remove('keyboard-open');
                if (footer) footer.style.display = '';
                document.body.style.overflowY = '';
                initialHeight = vv.height;
                window.scrollTo(0, 0);
            } else {
                initialHeight = currentHeight;
            }
        }

        window.visualViewport.addEventListener('resize', updateKeyboardState);
        window.visualViewport.addEventListener('scroll', updateKeyboardState);
    }

    // Prevent scroll on mobile when keyboard closed; allow pull-to-refresh (pull down at top)
    if (window.matchMedia('(max-width: 768px)').matches) {
        let touchStartY = 0;
        let touchStartX = 0;
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length) {
                touchStartY = e.touches[0].clientY;
                touchStartX = e.touches[0].clientX;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (document.documentElement.classList.contains('keyboard-open')) return;
            if (e.target.closest('.modal-content')) return;
            const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const deltaY = currentY - touchStartY;
            const deltaX = currentX - touchStartX;
            const wouldScrollDown = scrollTop > 0 || (scrollTop === 0 && deltaY < 0);
            const wouldScrollHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
            if (wouldScrollDown || wouldScrollHorizontal) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    // Blur input when tapping outside to close keyboard
    document.addEventListener('touchstart', (e) => {
        const input = document.getElementById('ingredientInput');
        if (document.activeElement === input && !e.target.closest('.input-section')) {
            input.blur();
        }
    });
});
