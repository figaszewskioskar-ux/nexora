// Widget live chatu dla odwiedzających.
// Nową rozmowę można rozpocząć dopiero po podaniu imienia i nazwiska,
// adresu e-mail oraz treści pierwszej wiadomości.
(function () {
  const toggle = document.getElementById('chatToggle');
  const panel = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('chatClose');
  const messagesEl = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatText');
  const badge = document.getElementById('chatBadge');
  const introForm = document.getElementById('chatIntroForm');
  const introError = document.getElementById('chatIntroError');
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

  function showChatUi() {
    introForm.hidden = true;
    messagesEl.hidden = false;
    form.hidden = false;
  }

  // Wznowienie istniejącej rozmowy (dane były już podane wcześniej)
  socket.on('connect', () => {
    const existing = localStorage.getItem('la_chat_session');
    if (existing) socket.emit('chat:join', { sessionId: existing });
  });

  socket.on('chat:joined', ({ sessionId, history }) => {
    localStorage.setItem('la_chat_session', sessionId);
    if (!joined) {
      messagesEl.innerHTML = '';
      history.forEach(m => addMessage(m.sender, m.body));
      joined = true;
    }
    showChatUi();
  });

  // Serwer odrzucił rozpoczęcie rozmowy (np. sesja wygasła / złe dane)
  socket.on('chat:error', ({ message }) => {
    if (message === 'session-not-found') {
      localStorage.removeItem('la_chat_session');
      return; // gość zobaczy formularz startowy przy otwarciu okna
    }
    introError.textContent = message;
    introError.hidden = false;
  });

  // Wiadomości renderujemy wyłącznie na podstawie zdarzeń z serwera,
  // dzięki czemu widok jest spójny między kartami przeglądarki.
  socket.on('chat:message', (msg) => {
    if (!joined) return;
    addMessage(msg.sender, msg.body);
    if (msg.sender === 'admin' && panel.hidden) {
      unread++;
      badge.textContent = unread;
      badge.hidden = false;
    }
  });

  introForm.addEventListener('submit', (e) => {
    e.preventDefault();
    introError.hidden = true;
    const name = document.getElementById('chatName').value.trim();
    const email = document.getElementById('chatEmail').value.trim();
    const firstMessage = document.getElementById('chatFirstMessage').value.trim();
    if (name.length < 3 || !name.includes(' ')) {
      introError.textContent = 'Podaj imię i nazwisko.';
      introError.hidden = false;
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      introError.textContent = 'Podaj poprawny adres e-mail.';
      introError.hidden = false;
      return;
    }
    if (!firstMessage) {
      introError.textContent = 'Napisz treść wiadomości.';
      introError.hidden = false;
      return;
    }
    socket.emit('chat:join', { name, email, firstMessage });
  });

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      unread = 0;
      badge.hidden = true;
      if (joined) {
        input.focus();
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else {
        document.getElementById('chatName').focus();
      }
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
