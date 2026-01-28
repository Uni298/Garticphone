// UI Management
class UIManager {
  constructor() {
    this.currentScreen = 'lobby-screen';
    this.isHost = false;
    this.playerId = null;
    this.roomId = null;
  }

  showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });

    // Show target screen
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      this.currentScreen = screenId;
    }

    // Stop physics animation if leaving category-screen (or generally anytime we switch)
    // We only want it running while actively waiting in category-screen
    // Safest to stop it whenever switching screens, unless it's to the same screen?
    // But showScreen is usually called when switching.
    // However, if we are staying in category selection, we might want to keep it?
    // For simplicity, let's stop it here, and the specific logic in update() will restart it if needed.
    if (window.stopPhysicsAnimation) {
        window.stopPhysicsAnimation();
    }
  }

  updatePlayerList(players, currentDrawerId = null) {
    const lists = [
      document.getElementById('player-list'),
      document.getElementById('game-player-list')
    ];

    lists.forEach(list => {
      if (!list) return;

      list.innerHTML = '';

      if (!players) return; // Add check for players
      
      players.forEach(player => {
        const item = document.createElement('div');
        item.className = 'player-item';

        const icon = document.createElement('div');
        icon.className = 'player-icon';
        icon.textContent = player.name.charAt(0).toUpperCase();

        const name = document.createElement('div');
        name.className = 'player-name';
        name.textContent = player.name;

        item.appendChild(icon);
        item.appendChild(name);

        if (player.isHost) {
          const badge = document.createElement('span');
          badge.className = 'host-badge';
          badge.textContent = 'ホスト';
          item.appendChild(badge);
        }

        if (player.id === currentDrawerId) {
          const badge = document.createElement('span');
          badge.className = 'host-badge';
          badge.style.background = '#4A90E2';
          badge.style.color = 'white';
          badge.textContent = '描画中';
          item.appendChild(badge);
        }

        // Show drawing submitted status
        if (player.hasSubmittedDrawing) {
          const badge = document.createElement('span');
          badge.className = 'host-badge';
          badge.style.background = '#4CAF50';
          badge.style.color = 'white';
          badge.textContent = '完了';
          item.appendChild(badge);
        }

        list.appendChild(item);
      });
    });
  }

  updateScoreList() {
    const lists = [
      document.getElementById('score-list'),
      document.getElementById('results-score-list'),
      document.getElementById('final-score-list')
    ];

    lists.forEach(list => {
      if (!list) return;
      list.innerHTML = '';
    });
  }

  update(state, myPlayerId) {
    this.roomId = state.roomId;

    // Players is already an array from server serialization
    const players = Array.isArray(state.players) ? state.players : [];
    this.updatePlayerList(players, state.currentDrawer);
    this.updateScoreList();

    // Update host controls based on current state
    const me = players.find(p => p.id === myPlayerId);
    if (me) {
      this.setHostControls(me.isHost, state.resultsComplete);
    }

    // Update timers and round info
    const roundSpan = document.getElementById('current-round');
    if (roundSpan) roundSpan.textContent = state.currentRound;
    const guessRoundSpan = document.getElementById('guess-round');
    if (guessRoundSpan) guessRoundSpan.textContent = state.currentRound;

    // Handle Canvas Size
    if (state.settings && state.settings.canvasWidth && state.settings.canvasHeight) {
        this.resizeCanvases(state.settings.canvasWidth, state.settings.canvasHeight);
    }
    
    // Handle Pause
    this.handlePauseState(state.isPaused);

    // Handle screen switching based on game state
    switch (state.gameState) {
      case 'lobby':
        document.getElementById('results-screen').classList.remove('visible'); // Reset visibility
        this.showScreen('room-screen');
        break;
      case 'prompt':
        this.showScreen('prompt-screen');
        break;
      case 'drawing':
        this.showScreen('drawing-screen');
        break;
      case 'guessing':
        this.showScreen('guessing-screen');
        // Update guess status?
        break;
      case 'results':
        this.showResults(state);
        break;
      case 'finished':
        this.showScreen('finished-screen');
        break;
    }
  }

  setHostControls(isHost, resultsComplete = false) {
    this.isHost = isHost;

    const settingsCard = document.getElementById('settings-card');
    const startBtn = document.getElementById('start-game-btn');
    const nextRoundBtn = document.getElementById('next-round-btn');
    const waitingNext = document.getElementById('waiting-next');
    const returnLobbyBtn = document.getElementById('return-lobby-btn-results');

    if (isHost) {
      if (startBtn) startBtn.style.display = 'block';
      if (nextRoundBtn) nextRoundBtn.style.display = resultsComplete ? 'none' : 'inline-block';
      if (waitingNext) waitingNext.classList.add('hidden');
      if (settingsCard) settingsCard.classList.remove('disabled');
      if (returnLobbyBtn) {
        if (resultsComplete) {
          returnLobbyBtn.classList.remove('hidden');
        } else {
          returnLobbyBtn.classList.add('hidden');
        }
      }
    } else {
      if (startBtn) startBtn.style.display = 'none';
      if (nextRoundBtn) nextRoundBtn.style.display = 'none';
      if (waitingNext) waitingNext.classList.remove('hidden');
      if (settingsCard) settingsCard.classList.add('disabled');
      if (returnLobbyBtn) returnLobbyBtn.classList.add('hidden');
    }
  }


  updateTimer(elementId, seconds) {
    const timer = document.getElementById(elementId);
    if (!timer) return;

    timer.textContent = seconds;

    // Change color based on time
    timer.classList.remove('warning', 'danger');
    if (seconds <= 10) {
      timer.classList.add('danger');
    } else if (seconds <= 30) {
      timer.classList.add('warning');
    }
  }


  updateGuessedPlayers(players) {
    const list = document.getElementById('guessed-players');
    if (!list) return;

    list.innerHTML = '';

    players.forEach(player => {
      const item = document.createElement('div');
      item.className = 'guessed-player';
      item.textContent = `✓ ${player.name}`;
      list.appendChild(item);
    });
  }

  showResults(state) {
    const nextRoundBtn = document.getElementById('next-round-btn');
    const waitingNext = document.getElementById('waiting-next');
    const returnLobbyBtn = document.getElementById('return-lobby-btn-results');
    const tabs = document.getElementById('results-tabs');
    const panel = document.getElementById('results-tab-panel');
    if (!tabs || !panel) return;

    const chains = state.roundChains || [];
    const resultsComplete = !!state.resultsComplete;
    if (!resultsComplete) {
      this.reviewTabIndex = null;
    }
    const activeIndex = resultsComplete && Number.isInteger(this.reviewTabIndex)
      ? this.reviewTabIndex
      : (state.resultsTabIndex || 0);
    tabs.innerHTML = '';
    panel.innerHTML = '';

    chains.forEach((chain, index) => {
      const btn = document.createElement('button');
      btn.className = `results-tab${index === activeIndex ? ' active' : ''}`;
      btn.textContent = chain.ownerName || `プレイヤー${index + 1}`;
      if (resultsComplete) {
        btn.addEventListener('click', () => {
          this.reviewTabIndex = index;
          this.showResults(state);
        });
      }
      tabs.appendChild(btn);
    });

    const activeChain = chains[activeIndex];
    if (!activeChain) return;

    const chainCard = document.createElement('div');
    chainCard.className = 'result-chain-card';
    chainCard.innerHTML = `<h3>${activeChain.ownerName} の伝言</h3>`;

    const visibleItems = resultsComplete
      ? activeChain.items
      : activeChain.items.slice(0, (state.resultsItemIndex || 0) + 1);

    visibleItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'result-chain-item';

      const label = document.createElement('div');
      label.className = 'result-chain-label';

      if (item.type === 'prompt') {
        label.textContent = `お題 (${item.playerName})`;
        row.appendChild(label);
        row.appendChild(document.createTextNode(item.text || '---'));
      } else if (item.type === 'guess') {
        label.textContent = `推測 (${item.playerName})`;
        row.appendChild(label);
        row.appendChild(document.createTextNode(item.text || '---'));
      } else if (item.type === 'drawing') {
        label.textContent = `絵 (${item.playerName})`;
        row.appendChild(label);
        const drawingWrap = document.createElement('div');
        drawingWrap.className = 'result-drawing-container';
        drawingWrap.appendChild(this.renderDrawing(item));
        row.appendChild(drawingWrap);
      }

      chainCard.appendChild(row);
    });
    panel.appendChild(chainCard);

    if (this.isHost) {
      if (nextRoundBtn) nextRoundBtn.style.display = resultsComplete ? 'none' : 'inline-block';
      if (waitingNext) waitingNext.classList.add('hidden');
      if (returnLobbyBtn) {
        if (resultsComplete) {
          returnLobbyBtn.classList.remove('hidden');
        } else {
          returnLobbyBtn.classList.add('hidden');
        }
      }
    } else {
      if (nextRoundBtn) nextRoundBtn.style.display = 'none';
      if (waitingNext) waitingNext.classList.remove('hidden');
      if (returnLobbyBtn) returnLobbyBtn.classList.add('hidden');
    }
  }

  renderDrawing(item) {
    if (item && item.png) {
      const img = document.createElement('img');
      img.src = item.png;
      img.alt = 'drawing';
      img.className = 'result-drawing';
      return img;
    }

    const strokes = item && item.drawing ? item.drawing : [];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 800;
    tempCanvas.height = 600;
    const ctx = tempCanvas.getContext('2d');

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (Array.isArray(strokes)) {
      strokes.forEach(stroke => {
        let xs, ys;
        if (Array.isArray(stroke) && stroke.length === 2 && Array.isArray(stroke[0])) {
          xs = stroke[0];
          ys = stroke[1];
        } else if (stroke && stroke.points && Array.isArray(stroke.points) && stroke.points.length === 2) {
          xs = stroke.points[0];
          ys = stroke.points[1];
        } else {
          return;
        }

        if (xs.length > 0) {
          ctx.beginPath();
          ctx.moveTo(xs[0], ys[0]);

          for (let i = 1; i < xs.length; i++) {
            ctx.lineTo(xs[i], ys[i]);
          }

          ctx.stroke();
        }
      });
    }

    const img = document.createElement('img');
    img.src = tempCanvas.toDataURL();
    img.alt = 'drawing';
    img.className = 'result-drawing';
    return img;
  }

  showSuccess(message) {
    // Could implement a toast notification here
    console.log('Success:', message);
  }

  handlePauseState(isPaused) {
      const overlayId = 'pause-overlay';
      let overlay = document.getElementById(overlayId);
      
      if (isPaused) {
          if (!overlay) {
              overlay = document.createElement('div');
              overlay.id = overlayId;
              overlay.style.position = 'fixed';
              overlay.style.top = '0';
              overlay.style.left = '0';
              overlay.style.width = '100%';
              overlay.style.height = '100%';
              overlay.style.background = 'rgba(0,0,0,0.5)';
              overlay.style.color = 'white';
              overlay.style.display = 'flex';
              overlay.style.justifyContent = 'center';
              overlay.style.alignItems = 'center';
              overlay.style.fontSize = '48px';
              overlay.style.fontWeight = 'bold';
              overlay.style.zIndex = '3000';
              overlay.textContent = 'PAUSED';
              document.body.appendChild(overlay);
          }
          overlay.style.display = 'flex';
          
          // Update button text
           ['drawing', 'guessing'].forEach(phase => {
              const btn = document.getElementById(`end-game-btn-${phase}`);
              if (btn) btn.textContent = '再開';
           });
          
      } else {
          if (overlay) overlay.style.display = 'none';
          
          // Update button text
           ['drawing', 'guessing'].forEach(phase => {
              const btn = document.getElementById(`end-game-btn-${phase}`);
              if (btn) btn.textContent = '中断';
           });
      }
  }
  
  resizeCanvases(width, height) {
      if (!width || !height) return;
      ['drawing-canvas', 'guess-canvas'].forEach(id => {
          const canvas = document.getElementById(id);
          if (canvas) {
              if (canvas.width !== width || canvas.height !== height) {
                  canvas.width = width;
                  canvas.height = height;
              }
          }
      });
  }
}

window.UIManager = UIManager;
