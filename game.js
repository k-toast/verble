// Game state
let gameState = {
    adjective: '',
    noun: '',
    remainingAdjective: '',
    remainingNoun: '',
    health: 10,
    injuries: 0,
    moves: 0,
    history: [],
    isWon: false,
    isLost: false,
    puzzleDate: ''
};

let puzzles = [];
let currentPuzzle = null;

// Get Helsinki timezone date string (YYYY-MM-DD)
function getHelsinkiDate() {
    const now = new Date();
    const helsinkiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
    const year = helsinkiTime.getFullYear();
    const month = String(helsinkiTime.getMonth() + 1).padStart(2, '0');
    const day = String(helsinkiTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Load puzzles from JSON
async function loadPuzzles() {
    try {
        const response = await fetch('puzzles.json');
        puzzles = await response.json();
    } catch (error) {
        console.error('Error loading puzzles:', error);
        puzzles = [];
    }
}

// Find puzzle for today
function findTodayPuzzle() {
    const today = getHelsinkiDate();
    return puzzles.find(p => p.date === today);
}

// Initialize game
function initGame() {
    currentPuzzle = findTodayPuzzle();
    
    if (!currentPuzzle) {
        document.getElementById('noPuzzleMessage').style.display = 'block';
        document.getElementById('gameContainer').style.display = 'none';
        return;
    }

    document.getElementById('noPuzzleMessage').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'block';

    const puzzleDate = currentPuzzle.date;
    document.getElementById('dateDisplay').textContent = puzzleDate;

    // Try to load saved state
    const savedState = localStorage.getItem(`verble_${puzzleDate}`);
    
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            gameState = {
                adjective: parsed.adjective || currentPuzzle.adjective,
                noun: parsed.noun || currentPuzzle.noun,
                remainingAdjective: parsed.remainingAdjective || currentPuzzle.adjective,
                remainingNoun: parsed.remainingNoun || currentPuzzle.noun,
                health: parsed.health !== undefined ? parsed.health : 10,
                injuries: parsed.injuries || 0,
                moves: parsed.moves || 0,
                history: parsed.history || [],
                isWon: parsed.isWon || false,
                isLost: parsed.isLost || false,
                puzzleDate: puzzleDate
            };
        } catch (e) {
            console.error('Error loading saved state:', e);
            resetGameState();
        }
    } else {
        resetGameState();
    }

    gameState.puzzleDate = puzzleDate;
    updateDisplay();
    loadHistory();
}

function resetGameState() {
    gameState = {
        adjective: currentPuzzle.adjective,
        noun: currentPuzzle.noun,
        remainingAdjective: currentPuzzle.adjective,
        remainingNoun: currentPuzzle.noun,
        health: 10,
        injuries: 0,
        moves: 0,
        history: [],
        isWon: false,
        isLost: false,
        puzzleDate: currentPuzzle.date
    };
}

// Save game state to localStorage
function saveGameState() {
    localStorage.setItem(`verble_${gameState.puzzleDate}`, JSON.stringify(gameState));
}

// Update display
function updateDisplay() {
    // Update puzzle display with underscores
    const adjDisplay = gameState.remainingAdjective.split('').map(c => c === ' ' ? ' ' : '_').join('');
    const nounDisplay = gameState.remainingNoun.split('').map(c => c === ' ' ? ' ' : '_').join('');
    document.getElementById('puzzleText').textContent = `${adjDisplay} ${nounDisplay}`;

    // Update stats
    document.getElementById('healthValue').textContent = gameState.health;
    document.getElementById('injuriesValue').textContent = gameState.injuries;
    document.getElementById('movesValue').textContent = gameState.moves;

    // Update input state
    const input = document.getElementById('verbInput');
    const submitBtn = document.getElementById('submitBtn');
    
    if (gameState.isWon || gameState.isLost) {
        input.disabled = true;
        submitBtn.disabled = true;
        showGameOver();
    } else {
        input.disabled = false;
        submitBtn.disabled = false;
        document.getElementById('gameOverMessage').style.display = 'none';
    }
}

// Process a verb
function processVerb(verb) {
    if (gameState.isWon || gameState.isLost) return;

    verb = verb.toUpperCase().trim();
    
    // Validate: 2-20 letters, A-Z only
    if (!/^[A-Z]{2,20}$/.test(verb)) {
        alert('Please enter a verb with 2-20 letters (A-Z only)');
        return;
    }

    const result = [];
    let newAdjective = gameState.remainingAdjective;
    let newNoun = gameState.remainingNoun;
    let newHealth = gameState.health;
    let newInjuries = gameState.injuries;

    // Process each letter left-to-right
    for (let i = 0; i < verb.length; i++) {
        const letter = verb[i];
        let found = false;

        // Check adjective first (left-to-right)
        const adjIndex = newAdjective.indexOf(letter);
        if (adjIndex !== -1) {
            newAdjective = newAdjective.substring(0, adjIndex) + newAdjective.substring(adjIndex + 1);
            result.push('🟩');
            found = true;
        } else {
            // Check noun
            const nounIndex = newNoun.indexOf(letter);
            if (nounIndex !== -1) {
                newNoun = newNoun.substring(0, nounIndex) + newNoun.substring(nounIndex + 1);
                result.push('🟩');
                found = true;
            } else {
                // Injury
                newHealth--;
                newInjuries++;
                result.push('🟥');
                found = false;
            }
        }
    }

    // Update game state
    gameState.remainingAdjective = newAdjective;
    gameState.remainingNoun = newNoun;
    gameState.health = newHealth;
    gameState.injuries = newInjuries;
    gameState.moves++;
    gameState.history.push({
        verb: verb,
        result: result.join('')
    });

    // Check win condition (noun fully removed)
    if (newNoun.replace(/\s/g, '') === '') {
        gameState.isWon = true;
    }

    // Check lose condition (health <= 0)
    if (newHealth <= 0) {
        gameState.isLost = true;
    }

    saveGameState();
    updateDisplay();
    loadHistory();
}

// Load and display history
function loadHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';

    if (gameState.history.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">No moves yet</p>';
        return;
    }

    gameState.history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <span class="history-verb">${item.verb}</span>
            <span class="history-emoji">${item.result}</span>
        `;
        container.appendChild(div);
    });
}

// Show game over message
function showGameOver() {
    const gameOverDiv = document.getElementById('gameOverMessage');
    const gameOverText = document.getElementById('gameOverText');
    const shareBtn = document.getElementById('shareBtn');

    if (gameState.isWon) {
        gameOverDiv.className = 'game-over win';
        gameOverText.textContent = 'You won! 🎉';
        shareBtn.style.display = 'inline-block';
    } else if (gameState.isLost) {
        gameOverDiv.className = 'game-over lose';
        gameOverText.textContent = 'You lost! 😢';
        shareBtn.style.display = 'inline-block';
    } else {
        gameOverDiv.style.display = 'none';
        shareBtn.style.display = 'none';
    }
}

// Generate share text
function generateShareText() {
    const result = gameState.isWon ? 'Win' : 'Loss';
    const puzzleDate = gameState.puzzleDate;
    const moves = gameState.moves;
    const injuries = gameState.injuries;
    
    let text = `Verble ${puzzleDate}\n`;
    text += `${result} - ${moves} moves, ${injuries} injuries\n\n`;
    
    gameState.history.forEach(item => {
        text += `${item.verb} ${item.result}\n`;
    });

    return text;
}

// Share button handler
function handleShare() {
    const shareText = generateShareText();
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Results copied to clipboard!');
        }).catch(() => {
            // Fallback
            copyToClipboardFallback(shareText);
        });
    } else {
        copyToClipboardFallback(shareText);
    }
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
        alert('Results copied to clipboard!');
    } catch (err) {
        alert('Could not copy to clipboard. Please copy manually:\n\n' + text);
    }
    document.body.removeChild(textarea);
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    await loadPuzzles();
    initGame();

    const input = document.getElementById('verbInput');
    const submitBtn = document.getElementById('submitBtn');
    const shareBtn = document.getElementById('shareBtn');

    submitBtn.addEventListener('click', () => {
        const verb = input.value.trim();
        if (verb) {
            processVerb(verb);
            input.value = '';
            input.focus();
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    // Only allow A-Z letters
    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
    });

    shareBtn.addEventListener('click', handleShare);
});
