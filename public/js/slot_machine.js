// Slot machine animation for results reveal
function showSlotMachineReveal(allGameText, callback) {
  const overlay = document.getElementById('slot-overlay');
  const reel = document.getElementById('slot-reel');
  
  if (!overlay || !reel) {
    console.error('Slot machine elements not found');
    if (callback) callback();
    return;
  }
  
  // Show overlay
  // Reset animation state so repeated calls re-trigger CSS animation
  overlay.classList.remove('hidden');
  // Force reflow to restart animation reliably
  // eslint-disable-next-line no-unused-expressions
  overlay.offsetHeight;
  overlay.classList.add('active');
  
  // Clear any existing content
  reel.innerHTML = '';
  
  // Style container for word cloud effect
  reel.style.transform = 'none';
  reel.style.position = 'relative';
  reel.style.width = '100%';
  reel.style.height = '100%';
  
  // Prepare animation words
  let animationWords = [];
  if (allGameText && allGameText.length > 0) {
    // Add each text multiple times for variety
    for (let i = 0; i < 3; i++) {
      animationWords.push(...allGameText);
    }
  } else {
    // Fallback words
    animationWords = ['???', 'お絵かき', '伝言', 'ゲーム', '楽しい'];
    for (let i = 0; i < 5; i++) animationWords.push(...animationWords);
  }
  
  // Shuffle words
  animationWords = shuffleArray(animationWords);
  
  const containerWidth = reel.clientWidth || 800;
  const containerHeight = reel.clientHeight || 600;
  
  // Animation state
  let isActive = true;
  const wordElements = [];
  
  // Function to spawn a word flying from right to left
  function spawnWord() {
    if (!isActive) return;
    
    // Pick random word
    const wordText = animationWords[Math.floor(Math.random() * animationWords.length)];
    
    const el = document.createElement('div');
    el.textContent = wordText;
    el.className = 'flying-word';
    
    // Random vertical position
    const top = Math.random() * (containerHeight - 50);
    el.style.top = `${top}px`;
    el.style.left = `${containerWidth}px`; // Start off-screen right
    
    // Random size and opacity
    const scale = 0.5 + Math.random() * 1.5;
    el.style.fontSize = `${1.5 * scale}rem`;
    el.style.opacity = 0.8 + Math.random() * 0.2; // Higher opacity for better visibility
    el.style.color = Math.random() > 0.5 ? '#330634' : '#ff9446';
    el.style.position = 'absolute';
    el.style.whiteSpace = 'nowrap';
    el.style.fontWeight = 'bold';
    
    reel.appendChild(el);
    wordElements.push({
      el,
      x: containerWidth,
      y: top,
      text: wordText,
      speed: 2 + Math.random() * 4,
      scale: scale
    });
    
    // Schedule next spawn
    setTimeout(spawnWord, 200 + Math.random() * 300);
  }
  
  // Start spawning
  for(let i = 0; i < 5; i++) spawnWord();
  
  // Animation loop
  function update() {
    if (!isActive && wordElements.length === 0) return;
    
    for (let i = wordElements.length - 1; i >= 0; i--) {
      const item = wordElements[i];
      if (item.isConverging) continue;
      
      item.x -= item.speed;
      item.el.style.left = `${item.x}px`;
      
      // If off screen left
      if (item.x < -item.el.clientWidth - 50) { 
        if (isActive) {
          // Recycle
          item.el.style.transition = 'none';
          item.x = containerWidth + 50;
          const newTop = Math.random() * (containerHeight - 50);
          item.y = newTop;
          item.el.style.top = `${newTop}px`;
          
          // Randomize properties again
          const scale = 0.5 + Math.random() * 1.5;
          item.scale = scale;
          item.el.style.fontSize = `${1.5 * scale}rem`;
          
          // New random word
          const wordText = animationWords[Math.floor(Math.random() * animationWords.length)];
          item.text = wordText;
          item.el.textContent = wordText;
        } else {
          // Remove
          item.el.remove();
          wordElements.splice(i, 1);
        }
      }
    }
    
    if (isActive || wordElements.length > 0) {
      requestAnimationFrame(update);
    }
  }
  
  update();
  
  // Finish animation after 3 seconds
  setTimeout(() => {
    isActive = false;
    
    // Fade out all words more slowly
    wordElements.forEach(item => {
      item.el.style.transition = 'opacity 1.5s';
      item.el.style.opacity = '0';
    });
    
    // Hide overlay after fade
    setTimeout(() => {
      overlay.classList.remove('active');
      overlay.classList.add('hidden');
      if (callback) callback();
    }, 1500); // Wait for fade out to complete
  }, 3000); // 3 second duration
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Export for use in client.js
window.showSlotMachineReveal = showSlotMachineReveal;
