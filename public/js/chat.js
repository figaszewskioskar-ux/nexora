// Widget live chatu dla odwiedzających
(function () {
  const toggle = document.getElementById('chatToggle');
  const panel = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('chatClose');
  const messagesEl = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatText');
  const badge = document.getElementById('chatBadge');
  if (!toggle || typeof io === 'undefined') return;

  const socket = io();
  let joined = false;
  let unread = 0;

  function addMessage(sender, body) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (sender === 'visitor' ? 'visitor' : 'admin');
    div.textContent = body;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function join() {
    socket.emit('chat:join', { sessionId: localStorage.getItem('la_chat_session') });
  }

  socket.on('connect', join);

  socket.on('chat:joined', ({ sessionId, history }) => {
    localStorage.setItem('la_chat_session', sessionId);
    if (!joined) {
      history.forEach(m => addMessage(m.sender, m.body));
      joined = true;
    }
  });

  // Wiadomości renderujemy wyłącznie na podstawie zdarzeń z serwera,
  // dzięki czemu widok jest spójny między kartami przeglądarki.
  socket.on('chat:message', (msg) => {
    addMessage(msg.sender, msg.body);
    if (msg.sender === 'admin' && panel.hidden) {
      unread++;
      badge.textContent = unread;
      badge.hidden = false;
    }
  });

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      unread = 0;
      badge.hidden = true;
      input.focus();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });
  closeBtn.addEventListener('click', () => { panel.hidden = true; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    socket.emit('chat:message', { body });
    input.value = '';
  });
})();
