const { v4: uuidv4 } = require("uuid");



class GameManager {

  constructor() {
    this.rooms = new Map();
    this.onStateChange = null; // Callback for state changes
  }



  setStateChangeCallback(callback) {

    this.onStateChange = callback;

  }



  createRoom(hostSocketId, hostName) {

    const roomId = uuidv4().substring(0, 6).toUpperCase();



    const room = {

      id: roomId,

      host: hostSocketId,

      players: new Map([

        [

          hostSocketId,

          {

            id: hostSocketId,

            name: hostName,

            score: 0,

            isHost: true,

          },

        ],

      ]),

      settings: {
        promptTimeSeconds: 45,
        drawingTimeSeconds: 90,
        guessingTimeSeconds: 45,
        maxRounds: 1,
        maxPlayers: 8,
        canvasWidth: 800,
        canvasHeight: 600,
        penThickness: 10,
        allowClearCanvas: true
      },
      gameState: "lobby", // lobby, prompt, drawing, guessing, results, finished
      currentRound: 0,
      currentDrawer: null,
      currentPrompt: null,
      roundStartTime: null,
      timer: null,
      turnOrder: [],
      prompts: new Map(),
      drawings: new Map(),
      guesses: new Map(),
      promptAssignments: new Map(),
      drawingAssignments: new Map(),
      roundChains: [],
      chainItems: new Map(),
      currentTexts: new Map(),
      resultsTabIndex: 0,
      resultsItemIndex: 0,
      resultsComplete: false,
      allGameText: []
    };



    this.rooms.set(roomId, room);

    console.log(`[Game Manager] Room ${roomId} created by ${hostName}`);



    return room;

  }



  joinRoom(roomId, socketId, playerName) {

    const room = this.rooms.get(roomId);



    if (!room) {

      return { success: false, error: "部屋が見つかりません" };

    }



    if (room.players.size >= (room.settings.maxPlayers || 8)) {

      return { success: false, error: "部屋が満員です" };

    }



    // Allow mid-game join

    // if (room.gameState !== "lobby") {

    //   return { success: false, error: "ゲームが既に開始されています" };

    // }



    room.players.set(socketId, {

      id: socketId,

      name: playerName,

      score: 0,

      isHost: false,

    });



    console.log(`[Game Manager] ${playerName} joined room ${roomId}`);



    return { success: true, room };

  }



  pauseGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.isPaused) return false;
    
    room.isPaused = true;
    
    // Cache remaining time
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
        
        const now = Date.now();
        const elapsed = (now - room.roundStartTime) / 1000;
        
        // Calculate original duration based on state
        let duration = 0;
        if (room.gameState === 'drawing') duration = room.settings.drawingTimeSeconds;
        else if (room.gameState === 'guessing') duration = room.settings.guessingTimeSeconds;
        else if (room.gameState === 'prompt') duration = room.settings.promptTimeSeconds;
        
        room.remainingTime = Math.max(0, duration - elapsed);
    }
    
    console.log(`[Game Manager] Room ${roomId} paused. Remaining time: ${room.remainingTime.toFixed(1)}s`);
    return true;
  }

  resumeGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.isPaused) return false;
    
    room.isPaused = false;
    room.roundStartTime = Date.now() - ((room.settings[room.gameState === 'drawing' ? 'drawingTimeSeconds' : 'guessingTimeSeconds'] || 0) - room.remainingTime) * 1000;
    // Actually, simpler logic:
    // We want to fire the callback after room.remainingTime seconds.
    // And we need to fake `roundStartTime` so that `emitRoomState` calculates correct remaining time.
    // `emitRoomState` does: duration - (now - start)
    // So: additional_elapsed = duration - remaining
    // now - start = additional_elapsed
    // start = now - additional_elapsed
    
    const duration = room.gameState === 'drawing' ? room.settings.drawingTimeSeconds : 
                     (room.gameState === 'guessing' ? room.settings.guessingTimeSeconds : room.settings.promptTimeSeconds);
                     
    // Reset start time so that calculated remaining time matches the stored remainingTime                 
    room.roundStartTime = Date.now() - (duration - room.remainingTime) * 1000;

    // Restart timer
    if (room.remainingTime > 0) {
        const callback = () => {
             if (room.gameState === 'drawing') {
                 this.endDrawingPhase(roomId).then(() => { if (this.onStateChange) this.onStateChange(roomId); });
             } else if (room.gameState === 'guessing') {
                 this.endGuessingPhase(roomId);
                 if (this.onStateChange) this.onStateChange(roomId);
             } else if (room.gameState === 'prompt') {
                 this.endPromptPhase(roomId);
                 if (this.onStateChange) this.onStateChange(roomId);
             }
        };
        room.timer = setTimeout(callback, room.remainingTime * 1000);
    } else {
        // Immediate finish if time was up
         if (room.gameState === 'drawing') {
             this.endDrawingPhase(roomId).then(() => { if (this.onStateChange) this.onStateChange(roomId); });
         } else if (room.gameState === 'guessing') {
             this.endGuessingPhase(roomId);
             if (this.onStateChange) this.onStateChange(roomId);
         } else if (room.gameState === 'prompt') {
             this.endPromptPhase(roomId);
             if (this.onStateChange) this.onStateChange(roomId);
         }
    }

    console.log(`[Game Manager] Room ${roomId} resumed`);
    return true;
  }

  abortGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // Clear any active timers
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    
    // Reset game state to lobby
    room.gameState = 'lobby';
    room.currentRound = 0;
    room.currentDrawer = null;
    room.currentPrompt = null;
    room.prompts = new Map();
    room.drawings = new Map();
    room.guesses.clear();
    room.roundChains = [];
    room.roundResults = null;
    room.resultsTabIndex = 0;
    room.resultsItemIndex = 0;
    room.resultsComplete = false;
    room.promptAssignments = new Map();
    room.drawingAssignments = new Map();
    room.chainItems = new Map();
    room.currentTexts = new Map();
    room.allGameText = [];
    room.isPaused = false;
    room.remainingTime = 0;
    
    console.log(`[Game Manager] Game aborted in room ${roomId}`);
    return true;
  }

  leaveRoom(roomId, socketId) {

    const room = this.rooms.get(roomId);

    if (!room) return;



    room.players.delete(socketId);



    // If host left, assign new host

    if (room.host === socketId && room.players.size > 0) {

      const newHost = Array.from(room.players.keys())[0];

      room.host = newHost;

      room.players.get(newHost).isHost = true;

      console.log(`[Game Manager] New host assigned in room ${roomId}`);

    }



    // Delete room if empty

    if (room.players.size === 0) {

      if (room.timer) clearTimeout(room.timer);

      this.rooms.delete(roomId);

      console.log(`[Game Manager] Room ${roomId} deleted (empty)`);

    } else {

      // If player left during active phases, force end phase

      if (room.currentDrawer === socketId) {

        if (

          room.gameState === "drawing" ||

          room.gameState === "prompt"

        ) {

          console.log(

            `[Game Manager] Drawer left room ${roomId}. Ending phase early.`,

          );

          if (room.timer) clearTimeout(room.timer);

          if (room.gameState === "prompt") {
            this.endPromptPhase(roomId);
          } else {
            this.endDrawingPhase(roomId);
          }

        }

      }

    }

  }



  updateSettings(roomId, settings) {

    const room = this.rooms.get(roomId);

    if (!room) return false;



    room.settings = { ...room.settings, ...settings };

    return true;

  }



  startGame(roomId) {

    const room = this.rooms.get(roomId);

    if (!room || room.gameState !== "lobby") return false;



    room.currentRound = 1;
    room.gameState = "prompt";
    room.turnOrder = Array.from(room.players.keys());
    room.prompts = new Map();
    room.drawings = new Map();
    room.guesses = new Map();
    room.promptAssignments = new Map();
    room.drawingAssignments = new Map();
    room.roundChains = [];
    room.chainItems = new Map();
    room.currentTexts = new Map();
    room.resultsTabIndex = 0;
    room.resultsItemIndex = 0;
    room.resultsComplete = false;
    room.allGameText = [];
    room.currentPrompt = null;
    room.roundStartTime = Date.now();

    room.timer = setTimeout(() => {
      this.endPromptPhase(roomId);
      if (this.onStateChange) this.onStateChange(roomId);
    }, room.settings.promptTimeSeconds * 1000);

    console.log(`[Game Manager] Game started in room ${roomId}. Prompt phase begins.`);
    return true;
  }



  submitPrompt(roomId, socketId, prompt) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState !== "prompt") return false;
    if (!prompt || !prompt.trim()) return false;

    room.prompts.set(socketId, prompt.trim());
    room.currentTexts.set(socketId, prompt.trim());
    room.allGameText.push(`お題: ${prompt.trim()}`);

    if (!room.chainItems.has(socketId)) {
      room.chainItems.set(socketId, []);
    }
    room.chainItems.get(socketId).push({
      type: "prompt",
      playerId: socketId,
      playerName: room.players.get(socketId)?.name || "",
      text: prompt.trim()
    });

    if (room.prompts.size >= room.players.size) {
      this.endPromptPhase(roomId);
      if (this.onStateChange) this.onStateChange(roomId);
    }

    return true;
  }

  endPromptPhase(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState !== "prompt") return false;

    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }

    room.gameState = "drawing";
    room.roundStartTime = Date.now();
    room.promptAssignments = new Map();
    room.currentPrompt = null;

    room.turnOrder.forEach((playerId, index) => {
      const promptOwnerId = room.turnOrder[(index - 1 + room.turnOrder.length) % room.turnOrder.length];
      const promptText = room.currentTexts.get(promptOwnerId) || "";
      room.promptAssignments.set(playerId, { promptOwnerId, promptText });
    });

    room.timer = setTimeout(async () => {
      await this.endDrawingPhase(roomId);
      if (this.onStateChange) this.onStateChange(roomId);
    }, room.settings.drawingTimeSeconds * 1000);

    console.log(`[Game Manager] Prompt phase ended in room ${roomId}`);
    return true;
  }



  submitDrawing(roomId, socketId, drawing, png) {
    const room = this.rooms.get(roomId);
    if (!room || room.gameState !== "drawing") return false;

    room.drawings.set(socketId, Array.isArray(drawing) ? drawing : []);

    const assignment = room.promptAssignments.get(socketId);
    if (assignment) {
      const chainOwnerId = assignment.promptOwnerId;
      if (!room.chainItems.has(chainOwnerId)) {
        room.chainItems.set(chainOwnerId, []);
      }
      room.chainItems.get(chainOwnerId).push({
        type: "drawing",
        playerId: socketId,
        playerName: room.players.get(socketId)?.name || "",
        drawing: Array.isArray(drawing) ? drawing : [],
        png: png || null
      });
    }

    if (room.drawings.size >= room.players.size) {
      this.endDrawingPhase(roomId);
      if (this.onStateChange) this.onStateChange(roomId);
    }

    return true;
  }



  clearDrawing(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return true;
  }



  async endDrawingPhase(roomId) {

    const room = this.rooms.get(roomId);

    if (!room || room.gameState !== "drawing") return false;



    if (room.timer) {

      clearTimeout(room.timer);

      room.timer = null;

    }



    room.gameState = "guessing";
    room.guesses.clear();
    room.roundStartTime = Date.now();
    room.drawingAssignments = new Map();

    room.turnOrder.forEach((playerId, index) => {
      const drawingOwnerId = room.turnOrder[(index - 1 + room.turnOrder.length) % room.turnOrder.length];
      const assignedDrawing = room.drawings.get(drawingOwnerId) || [];
      const chainOwnerId = room.promptAssignments.get(drawingOwnerId)?.promptOwnerId || drawingOwnerId;
      room.drawingAssignments.set(playerId, { drawingOwnerId, drawing: assignedDrawing, chainOwnerId });
    });

    room.timer = setTimeout(() => {
      this.endGuessingPhase(roomId);
      if (this.onStateChange) this.onStateChange(roomId);
    }, room.settings.guessingTimeSeconds * 1000);

    console.log(`[Game Manager] Drawing phase ended in room ${roomId}`);
    return true;
  }



  submitGuess(roomId, socketId, guess) {

    const room = this.rooms.get(roomId);

    if (!room || room.gameState !== "guessing") return false;

    if (!guess || !guess.trim()) return false;
    room.guesses.set(socketId, guess.trim());

    const assignment = room.drawingAssignments.get(socketId);
    if (assignment) {
      const chainOwnerId = assignment.chainOwnerId;
      if (!room.chainItems.has(chainOwnerId)) {
        room.chainItems.set(chainOwnerId, []);
      }
      room.chainItems.get(chainOwnerId).push({
        type: "guess",
        playerId: socketId,
        playerName: room.players.get(socketId)?.name || "",
        text: guess.trim()
      });
      room.currentTexts.set(chainOwnerId, guess.trim());
    }



    // Check if ALL guessers have guessed

    const guessersCount = room.players.size;

    if (room.guesses.size >= guessersCount) {

      console.log(

        `[Game Manager] All players have guessed. Ending round early.`,

      );

      // End immediately

      this.endGuessingPhase(roomId);

      if (this.onStateChange) {

        this.onStateChange(roomId);

      }

    }



    return true;

  }



  endGuessingPhase(roomId) {

    const room = this.rooms.get(roomId);

    // Warning: might be called multiple times if timer and early-end race?

    // Check state to be safe

    if (!room || room.gameState !== "guessing") return false;



    if (room.timer) {

      clearTimeout(room.timer);

      room.timer = null;

    }



    room.allGameText.push(...Array.from(room.guesses.values()).map(text => `答え: ${text}`));

    if (room.currentRound < room.settings.maxRounds) {
      room.currentRound += 1;
      room.gameState = "drawing";
      room.drawings.clear();
      room.guesses.clear();
      room.promptAssignments = new Map();
      room.drawingAssignments = new Map();
      room.roundStartTime = Date.now();

      room.turnOrder.forEach((playerId, index) => {
        const promptOwnerId = room.turnOrder[(index - 1 + room.turnOrder.length) % room.turnOrder.length];
        const promptText = room.currentTexts.get(promptOwnerId) || "";
        room.promptAssignments.set(playerId, { promptOwnerId, promptText });
      });

      room.timer = setTimeout(async () => {
        await this.endDrawingPhase(roomId);
        if (this.onStateChange) this.onStateChange(roomId);
      }, room.settings.drawingTimeSeconds * 1000);

      console.log(`[Game Manager] Guessing phase ended in room ${roomId}. Moving to next drawing round.`);
      return true;
    }

    room.gameState = "results";

    const chains = [];
    room.turnOrder.forEach(ownerId => {
      const items = room.chainItems.get(ownerId) || [];
      chains.push({
        ownerId,
        ownerName: room.players.get(ownerId)?.name || "",
        items
      });
    });

    room.roundChains = chains;
    room.roundResults = { chains };
    room.resultsTabIndex = 0;
    room.resultsItemIndex = 0;
    room.resultsComplete = false;

    console.log(`[Game Manager] Guessing phase ended in room ${roomId}`);
    return true;
  }

  nextResult(roomId) {
    const room = this.rooms.get(roomId);

    if (!room || room.gameState !== "results") return false;

    if (room.resultsComplete) return false;

    const currentChain = room.roundChains[room.resultsTabIndex];
    const maxItems = currentChain ? currentChain.items.length : 0;
    if (room.resultsItemIndex < Math.max(0, maxItems - 1)) {
      room.resultsItemIndex += 1;
      return true;
    }

    room.resultsItemIndex = 0;
    room.resultsTabIndex += 1;

    if (room.resultsTabIndex >= room.roundChains.length) {
      room.resultsTabIndex = Math.max(0, room.roundChains.length - 1);
      room.resultsComplete = true;
      console.log(`[Game Manager] Results complete in room ${roomId}`);
      return true;
    }

    return true;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);

  }



  returnToLobby(roomId) {

    const room = this.rooms.get(roomId);

    if (!room) return false;



    // Reset game state but keep players and settings

    room.gameState = "lobby";

    room.currentRound = 0;

    room.currentDrawer = null;
    room.currentPrompt = null;
    room.prompts = new Map();
    room.drawings = new Map();
    room.guesses.clear();
    room.roundResults = null;
    room.roundChains = [];
    room.resultsTabIndex = 0;
    room.resultsItemIndex = 0;
    room.resultsComplete = false;
    room.promptAssignments = new Map();
    room.drawingAssignments = new Map();
    room.chainItems = new Map();
    room.currentTexts = new Map();
    room.allGameText = [];



    console.log(`[Game Manager] Room ${roomId} returned to lobby`);

    return true;

  }



  getRoomBySocket(socketId) {

    for (const room of this.rooms.values()) {

      if (room.players.has(socketId)) {

        return room;

      }

    }

    return null;

  }

}



module.exports = GameManager;
