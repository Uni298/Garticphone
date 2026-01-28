const socket = io();
window.socket = socket; // Expose socket for chat.js
const ui = new UIManager();
let drawingCanvas = null;
let guessCanvas = null;
let currentGameState = null;
let timerInterval = null;
let hasSubmittedPrompt = false;
let hasSubmittedGuess = false;
let hasSubmittedDrawing = false;
let hasShownResultsReveal = false;

// Modal confirmation
let modalResolve = null;
function showModal(title, message) {
  return new Promise((resolve) => {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('confirmModal').classList.add('active');
    modalResolve = resolve;
  });
}

document.getElementById('modalConfirm').onclick = () => {
  document.getElementById('confirmModal').classList.remove('active');
  if (modalResolve) modalResolve(true);
};

document.getElementById('modalCancel').onclick = () => {
  document.getElementById('confirmModal').classList.remove('active');
  if (modalResolve) modalResolve(false);
};

// Reaction system
function sendReaction(emoji) {
  if (window.socket && window.socket.connected && ui.roomId) {
    window.socket.emit('reaction', { roomId: ui.roomId, emoji });
  }
}

function showReaction(emoji, playerId) {
  const display = document.getElementById('reactionDisplay');
  const chatBox = document.getElementById('chatBox');
  
  if (!chatBox) return;
  
  const rect = chatBox.getBoundingClientRect();
  const emojiEl = document.createElement('div');
  emojiEl.className = 'reaction-emoji pop-fade';
  
  // Use image for good reaction
  if (emoji === 'good') {
    const img = document.createElement('img');
    img.src = '/images/good.png';
    img.alt = 'Good';
    emojiEl.appendChild(img);
  } else {
    emojiEl.textContent = emoji;
  }
  
  // Position around chat box (random offset)
  // Chat is bottom-right mostly
  const randomX = Math.random() * 100 - 50; // +/- 50px
  const randomY = Math.random() * 100 - 150; // -50 to -150px (above chat)
  
  emojiEl.style.left = `${rect.left + rect.width / 2 + randomX}px`;
  emojiEl.style.top = `${rect.top + randomY}px`;
  
  display.appendChild(emojiEl);
  setTimeout(() => emojiEl.remove(), 2000);
}

if (window.socket) {
  window.socket.on('reaction', (data) => {
    showReaction(data.emoji, data.playerId);
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  drawingCanvas = new DrawingCanvas('drawing-canvas');
  guessCanvas = new DrawingCanvas('guess-canvas');

  // Disable guess canvas (read-only)
  guessCanvas.disable();
});

function initializeEventListeners() {
  // Lobby screen
  document.getElementById('create-room-btn').onclick = createRoom;
  document.getElementById('join-room-btn').onclick = () => {
    document.getElementById('join-room-input').classList.remove('hidden');
  };
  document.getElementById('join-confirm-btn').onclick = joinRoom;

  // Room screen
  document.getElementById('leave-room-btn').onclick = leaveRoom;
  document.getElementById('update-settings-btn').onclick = updateSettings;
  document.getElementById('start-game-btn').onclick = startGame;

  // Drawing screen
  document.getElementById('clear-canvas-btn').onclick = () => {
    drawingCanvas.clear();
  };
  document.getElementById('undo-btn').onclick = () => {
    drawingCanvas.undo();
  };
  document.getElementById('redo-btn').onclick = () => {
    drawingCanvas.redo();
  };
  document.getElementById('pen-thickness-slider').oninput = (e) => {
    const thickness = parseInt(e.target.value);
    drawingCanvas.setLineWidth(thickness);
    document.getElementById('pen-thickness-value').textContent = thickness;
  };
  document.getElementById('end-drawing-btn').onclick = endDrawing;

  // Prompt screen
  document.getElementById('submit-prompt-btn').onclick = submitPrompt;

  // Guessing screen
  document.getElementById('submit-guess-btn').onclick = submitGuess;

  // Results screen
  document.getElementById('next-round-btn').onclick = nextResult;
  const returnLobbyResultsBtn = document.getElementById('return-lobby-btn-results');
  if (returnLobbyResultsBtn) {
    returnLobbyResultsBtn.onclick = () => {
      socket.emit('return-to-lobby', ui.roomId);
    };
  }

  // Finished screen
  document.getElementById('return-lobby-btn').onclick = () => {
    // Request server to reset game to lobby
    socket.emit('return-to-lobby', ui.roomId);
  };

  // Reaction buttons
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.onclick = () => sendReaction(btn.dataset.emoji);
  });
  
  // Room ID copy functionality
  const roomIdValue = document.getElementById('room-id-display-value');
  if (roomIdValue) {
    roomIdValue.onclick = async () => {
      const text = roomIdValue.textContent;
      try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for HTTP
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.error('Fallback copy failed', err);
            }
            document.body.removeChild(textArea);
        }
        ui.showSuccess('ルームIDをコピーしました');
      } catch (err) {
        console.error('Failed to copy id:', err);
      }
    };
  }
  
  
  // Abort Game Buttons
  ['drawing', 'guessing'].forEach(phase => {
      const btn = document.getElementById(`end-game-btn-${phase}`);
      if (btn) {
          btn.onclick = async () => {
              const confirmed = await showModal('ゲーム中断', '本当にゲームを中断してロビーに戻りますか?');
              if (confirmed) {
                  socket.emit('abort-game', ui.roomId);
              }
          };
      }
  });

  // Populate Filter Checkboxes
  // ui.populateCategoryFilters(); // Removed
  
}

// Socket event handlers
socket.on('room-created', (data) => {
  ui.roomId = data.roomId;
  ui.playerId = socket.id;
  ui.setHostControls(true);

  document.getElementById('room-code-display').textContent = data.roomId;
  ui.showScreen('room-screen');

  // Update settings visibility
  updateSettingsVisibility(true);

  // Show room ID in top left
  const roomIdDisplay = document.getElementById('room-id-display-container');
  const roomIdValue = document.getElementById('room-id-display-value');
  if (roomIdDisplay && roomIdValue) {
    roomIdValue.textContent = data.roomId;
    roomIdDisplay.style.display = 'flex';
  }
});

socket.on('room-joined', (data) => {
  ui.roomId = data.roomId;
  ui.playerId = socket.id;
  ui.setHostControls(data.player.isHost);

  ui.showScreen('room-screen');
  ui.update(data);
  
  // Update settings in UI
  if (data.settings) {
      document.getElementById('prompt-time').value = data.settings.promptTimeSeconds;
      document.getElementById('drawing-time').value = data.settings.drawingTimeSeconds;
      document.getElementById('guessing-time').value = data.settings.guessingTimeSeconds;
      document.getElementById('max-players').value = data.settings.maxPlayers || 8;
      document.getElementById('allow-clear-canvas').checked = data.settings.allowClearCanvas;
      
      if (data.settings.penThickness) {
          document.getElementById('pen-thickness').value = data.settings.penThickness;
          if (drawingCanvas) drawingCanvas.setLineWidth(data.settings.penThickness);
      }
      if (data.settings.canvasWidth && data.settings.canvasHeight) {
          document.getElementById('canvas-size').value = `${data.settings.canvasWidth}x${data.settings.canvasHeight}`;
          
          // Resize canvases
          if (drawingCanvas) {
            drawingCanvas.resize(data.settings.canvasWidth, data.settings.canvasHeight);
          }
          if (guessCanvas) {
            guessCanvas.resize(data.settings.canvasWidth, data.settings.canvasHeight);
          }
      }
  }

  // Show room code
  document.getElementById('room-code-display').textContent = data.roomId;
  
  // Show room ID in top left
  const roomIdDisplay = document.getElementById('room-id-display-container');
  const roomIdValue = document.getElementById('room-id-display-value');
  if (roomIdDisplay && roomIdValue) {
    roomIdValue.textContent = data.roomId;
    if (data.player.isHost) {
      roomIdDisplay.style.display = 'flex';
    } else {
      roomIdDisplay.style.display = 'none';
    }
  }
  
  // Hide error
  // ui.hideError(); // Method doesn't exist, remove this line

  // If game is already running, switch to game screen immediately
  if (data.gameState !== 'lobby') {
    ui.setHostControls(data.player.isHost);
    ui.update(data);
  }
});

socket.on('settings-updated', (settings) => {
  document.getElementById('prompt-time').value = settings.promptTimeSeconds;
  document.getElementById('drawing-time').value = settings.drawingTimeSeconds;
  document.getElementById('guessing-time').value = settings.guessingTimeSeconds;
  document.getElementById('max-players').value = settings.maxPlayers || 8;
  document.getElementById('allow-clear-canvas').checked = settings.allowClearCanvas;
  if (settings.penThickness) {
      document.getElementById('pen-thickness').value = settings.penThickness;
      if (drawingCanvas) drawingCanvas.setLineWidth(settings.penThickness);
  }
  if (settings.canvasWidth && settings.canvasHeight) {
      document.getElementById('canvas-size').value = `${settings.canvasWidth}x${settings.canvasHeight}`;
      
      // Resize canvases
      if (drawingCanvas) {
        drawingCanvas.resize(settings.canvasWidth, settings.canvasHeight);
      }
      if (guessCanvas) {
        guessCanvas.resize(settings.canvasWidth, settings.canvasHeight);
      }
  }
  
  ui.showSuccess('設定が更新されました');
});

socket.on('game-state', (state) => {
  currentGameState = state;
  handleGameState(state);

  // no category list needed
});

socket.on('player-guessed', (data) => {
  // Update guessed players list
  if (currentGameState && currentGameState.guessedPlayers) {
    const player = currentGameState.players.find(p => p.id === data.playerId);
    if (player) {
      updateGuessedPlayersList(currentGameState.guessedPlayers, currentGameState.players);
    }
  }
});

socket.on('guess-submitted', () => {
  document.getElementById('guess-status').className = 'guess-status submitted';
  document.getElementById('guess-status').textContent = '✓ 回答を送信しました!';
  document.getElementById('submit-guess-btn').disabled = true;
  document.getElementById('guess-input').disabled = true;
  hasSubmittedGuess = true;
});

socket.on('drawing-submitted', () => {
  const drawingStatus = document.getElementById('drawing-status');
  if (drawingStatus) {
    drawingStatus.className = 'guess-status submitted';
    drawingStatus.textContent = '✓ 描画完了を送信しました!';
  }
  document.getElementById('end-drawing-btn').style.display = 'none';
  hasSubmittedDrawing = true;
  
  // Show waiting animation if others are still submitting
  if (window.showWaitingAnimation) {
    window.showWaitingAnimation();
  }
});

socket.on('prompt-submitted', () => {
  document.getElementById('prompt-status').className = 'guess-status submitted';
  document.getElementById('prompt-status').textContent = '✓ お題を送信しました!';
  document.getElementById('submit-prompt-btn').disabled = true;
  document.getElementById('prompt-input').disabled = true;
  hasSubmittedPrompt = true;
  
  // Show waiting animation if others are still submitting
  if (window.showWaitingAnimation) {
    window.showWaitingAnimation();
  }
});

socket.on('error', (data) => {
  ui.showError(data.message);
});

// Game state handler
function handleGameState(state) {
  if (state.gameState !== currentGameState && state.gameState !== 'results') {
    hasShownResultsReveal = false;
  }
  if (state.gameState !== currentGameState && state.gameState === 'drawing') {
    hasSubmittedDrawing = false;
  }
  currentGameState = state.gameState;
  // Centralized UI update (screens, lists, controls)
  // For 'results', we delay update to handleResults to prevent screen flash before transition
  if (state.gameState !== 'results') {
    ui.update(state, ui.playerId);
  }

  // Update specific elements not covered by ui.update or needing specific logic
  document.getElementById('player-count').textContent = state.players.length;
  document.getElementById('max-rounds-display').textContent = state.maxRounds;
  document.getElementById('guess-max-rounds').textContent = state.maxRounds;
  const promptMax = document.getElementById('prompt-max-rounds');
  if (promptMax) promptMax.textContent = state.maxRounds;
  const promptRound = document.getElementById('prompt-round');
  if (promptRound) promptRound.textContent = state.currentRound;
  const guessRound = document.getElementById('guess-round');
  if (guessRound) guessRound.textContent = state.currentRound;

  // Handle state-specific logic (timers, canvas, etc.)
  switch (state.gameState) {
    case 'prompt':
      handlePrompt(state);
      break;
    case 'drawing':
      handleDrawing(state);
      break;
    case 'guessing':
      handleGuessing(state);
      break;
    case 'results':
      handleResults(state);
      break;
    case 'finished':
      handleFinished(state);
      break;
  }

  // Ensure reaction bar is hidden by default unless in spectator drawing mode
  if (state.gameState !== 'drawing') {
    const reactionBar = document.getElementById('floating-reaction-bar');
    if (reactionBar) reactionBar.style.display = 'none';
  }
}

function handlePrompt(state) {
  ui.showScreen('prompt-screen');
  startTimer('prompt-timer', state.timeRemaining || state.settings.promptTimeSeconds);

  if (state.gameState === 'prompt' && state.timeRemaining === state.settings.promptTimeSeconds) {
    hasSubmittedPrompt = false;
    document.getElementById('prompt-status').textContent = '';
  }

  if (!hasSubmittedPrompt) {
    document.getElementById('prompt-input').disabled = false;
    document.getElementById('submit-prompt-btn').disabled = false;
  } else {
    document.getElementById('prompt-input').disabled = true;
    document.getElementById('submit-prompt-btn').disabled = true;
  }

  // Show waiting animation if others are still submitting
  const submittedCount = state.players ? state.players.filter(p => p.hasSubmittedPrompt).length : 0;
  if (hasSubmittedPrompt && submittedCount < state.players.length) {
    if (window.showWaitingAnimation) {
      window.showWaitingAnimation();
    }
  }
}

function handleDrawing(state) {
  ui.showScreen('drawing-screen');

  hasSubmittedGuess = false;

  // Only clear canvas if we're entering drawing from a different phase
  if (currentGameState !== 'drawing') {
    drawingCanvas.clear();
  }

  // Start timer
  startTimer('drawing-timer', state.timeRemaining);

  const drawingTools = document.getElementById('drawing-tools');
  // const reactionCard = document.getElementById('reaction-card'); // Removed

  const assignment = (state.promptAssignments || []).find(item => item.playerId === ui.playerId);
  const promptText = assignment ? assignment.promptText : '???';
  document.getElementById('current-category').textContent = promptText || '???';

  document.getElementById('spectator-message').classList.add('hidden');
  document.getElementById('drawing-canvas').parentElement.style.display = 'block';
  drawingCanvas.enable();
  drawingTools.style.display = 'flex';
  
  // Show/hide drawing button based on submission status
  const endDrawingBtn = document.getElementById('end-drawing-btn');
  if (hasSubmittedDrawing) {
    endDrawingBtn.style.display = 'none';
  } else {
    endDrawingBtn.style.display = 'block';
  }
  
  const drawingStatus = document.getElementById('drawing-status');
  if (drawingStatus) {
    if (hasSubmittedDrawing) {
      drawingStatus.className = 'guess-status submitted';
      drawingStatus.textContent = '✓ 描画完了を送信しました!';
    } else {
      drawingStatus.className = 'guess-status';
      drawingStatus.textContent = '';
    }
  }

  const allowClear = state.settings && state.settings.allowClearCanvas !== false;
  document.getElementById('clear-canvas-btn').style.display = allowClear ? 'block' : 'none';
  guessCanvas.clear();
  document.getElementById('floating-reaction-bar').style.display = 'none';

  // Show waiting animation if others are still submitting
  const submittedCount = state.players ? state.players.filter(p => p.hasSubmittedDrawing).length : 0;
  if (hasSubmittedDrawing && submittedCount < state.players.length) {
    if (window.showWaitingAnimation) {
      window.showWaitingAnimation();
    }
  }
}

function handleGuessing(state) {
  ui.showScreen('guessing-screen');
  const assignment = (state.drawingAssignments || []).find(item => item.playerId === ui.playerId);
  guessCanvas.setStrokes(assignment ? assignment.drawing : []);

  // Start timer
  startTimer('guessing-timer', state.timeRemaining);

  hasSubmittedGuess = false;
  document.getElementById('guess-input').value = '';
  document.getElementById('guess-input').disabled = false;
  document.getElementById('submit-guess-btn').disabled = false;
  document.getElementById('guess-status').className = 'guess-status';
  document.getElementById('guess-status').textContent = '';

  // Update guessed players
  updateGuessedPlayersList(state.guessedPlayers || [], state.players);

  const guessedCount = (state.guessedPlayers || []).length;
  if (guessedCount === state.players.length) {
    const screen = document.getElementById('guessing-screen');
    screen.style.transition = 'opacity 0.5s ease';
    screen.style.opacity = '0';
  }
}

function handleResults(state) {
  stopTimer();
  const resScreen = document.getElementById('results-screen');
  if (resScreen) resScreen.classList.remove('visible');

  const returnLobbyBtn = document.getElementById('return-lobby-btn-results');
  if (returnLobbyBtn) {
    if (state.resultsComplete) {
      returnLobbyBtn.classList.remove('hidden');
    } else {
      returnLobbyBtn.classList.add('hidden');
    }
  }

  const overlay = document.getElementById('slot-overlay');
  const allText = state.allGameText || [];

  const reveal = () => {
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.classList.add('hidden'), 400);
    }
    const resultsScreen = document.getElementById('results-screen');
    if (resultsScreen) {
      ui.showScreen('results-screen');
      ui.update(state, ui.playerId);
      requestAnimationFrame(() => resultsScreen.classList.add('visible'));
    }
  };

  if (!hasShownResultsReveal) {
    hasShownResultsReveal = true;
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('active');
    }

    if (window.showSlotMachineReveal) {
      window.showSlotMachineReveal(allText, reveal);
    } else {
      setTimeout(reveal, 5000);
    }
  } else {
    reveal();
  }
}

function handleFinished(state) {
  ui.showScreen('finished-screen');
  stopTimer();
}

function updateGuessedPlayersList(guessedPlayerIds, players) {
  const guessedPlayers = guessedPlayerIds
    .map(id => players.find(p => p.id === id))
    .filter(p => p);

  ui.updateGuessedPlayers(guessedPlayers);
}

// Timer management
function startTimer(elementId, initialSeconds) {
  stopTimer();

  let seconds = initialSeconds;
  ui.updateTimer(elementId, seconds);

  timerInterval = setInterval(() => {
    seconds--;
    if (seconds < 0) seconds = 0;
    
    // Update timer display
    ui.updateTimer(elementId, seconds);

    if (elementId === 'guessing-timer' && seconds <= 1) {
      const submitBtn = document.getElementById('submit-guess-btn');
      if (submitBtn && !submitBtn.disabled) {
        submitGuess();
      }
    }

    if (seconds <= 0) {
      stopTimer();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Action functions
function createRoom() {
  const playerName = document.getElementById('player-name').value.trim();

  if (!playerName) {
    ui.showError('プレイヤー名を入力してください');
    return;
  }

  socket.emit('create-room', playerName);
}

function joinRoom() {
  const playerName = document.getElementById('player-name').value.trim();
  const roomCode = document.getElementById('room-code').value.trim().toUpperCase();

  if (!playerName) {
    ui.showError('プレイヤー名を入力してください');
    return;
  }

  if (!roomCode || roomCode.length !== 6) {
    ui.showError('6桁の部屋コードを入力してください');
    return;
  }

  socket.emit('join-room', {
    roomId: roomCode,
    playerName: playerName
  });
}

async function leaveRoom() {
  const confirmed = await showModal('退出確認', '本当に退出しますか?');
  if (confirmed) {
    location.reload();
  }
}

function updateSettings() {
  const settings = {
    promptTimeSeconds: parseInt(document.getElementById('prompt-time').value),
    drawingTimeSeconds: parseInt(document.getElementById('drawing-time').value),
    guessingTimeSeconds: parseInt(document.getElementById('guessing-time').value),
    maxPlayers: parseInt(document.getElementById('max-players').value),
    allowClearCanvas: document.getElementById('allow-clear-canvas').checked,
    penThickness: parseInt(document.getElementById('pen-thickness').value),
    canvasSize: document.getElementById('canvas-size').value // '800x600'
  };
  
  // Parse canvas size
  const [w, h] = settings.canvasSize.split('x').map(Number);
  settings.canvasWidth = w;
  settings.canvasHeight = h;

  socket.emit('update-settings', {
    roomId: ui.roomId,
    settings: settings
  });

  ui.showSuccess('設定を更新しました');
}

function startGame() {
  socket.emit('start-game', ui.roomId);
}

function pauseGame() {
    socket.emit('pause-game', ui.roomId);
}

function resumeGame() {
    socket.emit('resume-game', ui.roomId);
}

async function endDrawing() {
  const confirmed = await showModal('描画終了', '描画を終了しますか?');
  if (confirmed) {
    if (hasSubmittedDrawing) return;
    hasSubmittedDrawing = true;
    const drawingStatus = document.getElementById('drawing-status');
    if (drawingStatus) {
      drawingStatus.className = 'guess-status submitted';
      drawingStatus.textContent = '✓ 描画完了を送信しました!';
    }
    socket.emit('submit-drawing', {
      roomId: ui.roomId,
      drawing: drawingCanvas.getStrokes(),
      png: drawingCanvas.canvas.toDataURL('image/png')
    });
    // Note: Player list will update automatically when server sends new state
  }
}

function submitGuess() {
  if (hasSubmittedGuess) return;
  const guess = document.getElementById('guess-input').value.trim();
  if (!guess) {
    ui.showError('推測を入力してください');
    return;
  }

  socket.emit('submit-guess', {
    roomId: ui.roomId,
    guess: guess
  });
  hasSubmittedGuess = true;
}

function submitPrompt() {
  if (hasSubmittedPrompt) return;
  const prompt = document.getElementById('prompt-input').value.trim();
  if (!prompt) {
    ui.showError('お題を入力してください');
    return;
  }

  socket.emit('submit-prompt', {
    roomId: ui.roomId,
    prompt
  });
  hasSubmittedPrompt = true;
}

function nextResult() {
  socket.emit('next-result', ui.roomId);
}

// Settings visibility
function updateSettingsVisibility(isHost) {
  const inputs = document.querySelectorAll('#settings-card input, #settings-card select');
  const updateBtn = document.getElementById('update-settings-btn');
  const hostBadge = document.getElementById('host-only-badge');
  
  inputs.forEach(input => {
    input.disabled = !isHost;
  });
  
  if (isHost) {
    updateBtn.style.display = 'block';
    hostBadge.classList.remove('hidden');
  } else {
    updateBtn.style.display = 'none';
    hostBadge.classList.add('hidden');
  }
}
