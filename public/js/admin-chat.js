// Konsola live chatu w panelu administratora
(function () {
  const sessionsEl = document.getElementById('chatSessions');
  const messagesEl = document.getElementById('adminChatMessages');
  const form = document.getElementById('adminChatForm');
  const input = document.getElementById('adminChatText');
  if (!sessionsEl || typeof io === 'undefined') return;

  const socket = io();
  let activeSession = null;

  function addMessage(sender, body) {
    const div = document.createElement('div');
    // Z perspektywy admina jego wiadomości są po prawej stronie
    div.className = 'chat-msg ' + (sender === 'admin' ? 'visitor' : 'admin');
    div.textContent = body;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function openSession(id, btn) {
    activeSession = id;
    document.querySelectorAll('.chat-session').forEach(b => b.classList.remove('active'));
    if (btn) {
      btn.classList.add('active');
      const badge = btn.querySelector('.chat-badge');
      if (badge) badge.remove();
    }
    socket.emit('admin:watch', { sessionId: id });
    messagesEl.innerHTML = '';
    form.hidden = false;
    try {
      const res = await fetch(`/admin/chat/${id}/messages`);
      const messages = await res.json();
      messages.forEach(m => addMessage(m.sender, m.body));
    } catch (e) {
      messagesEl.innerHTML = '<p class="empty-note">Nie udało się pobrać wiadomości.</p>';
    }
    input.focus();
  }

  sessionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-session');
    if (btn) openSession(btn.dataset.session, btn);
  });

  socket.on('chat:message', (msg) => {
    if (msg.sessionId === activeSession) addMessage(msg.sender, msg.body);
  });

  // Nowa aktywność w innych rozmowach — odśwież listę, żeby pokazać licznik
  socket.on('admin:chat-activity', (msg) => {
    if (msg.sender !== 'visitor') return;
    if (msg.sessionId === activeSession) return;
    const btn = sessionsEl.querySelector(`[data-session="${msg.sessionId}"]`);
    if (!btn) { location.reload(); return; }
    let badge = btn.querySelector('.chat-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-badge inline';
      badge.textContent = '0';
      btn.querySelector('strong').after(badge);
    }
    badge.textContent = String(parseInt(badge.textContent, 10) + 1);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body || !activeSession) return;
    socket.emit('chat:message', { sessionId: activeSession, body });
    input.value = '';
  });
})();
