// Anime Productivity Hub
// Theme management, To-Do list, Timer, and Day Scheduler with localStorage persistence

(function () {
  'use strict';

  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function setJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function formatTwo(n) { return String(n).padStart(2, '0'); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  // ---------- Theme Toggle ----------
  const themeNarutoBtn = $('#theme-naruto');
  const themeJjkBtn = $('#theme-jjk');

  function applyTheme(theme) {
    const htmlEl = document.documentElement;
    htmlEl.setAttribute('data-theme', theme);
    // For CSS variables scoping we use [data-theme] on html and theme-specific rules target body
    themeNarutoBtn.classList.toggle('active', theme === 'naruto');
    themeJjkBtn.classList.toggle('active', theme === 'jjk');
    themeNarutoBtn.setAttribute('aria-pressed', theme === 'naruto');
    themeJjkBtn.setAttribute('aria-pressed', theme === 'jjk');
    setJSON('aph:theme', theme);
  }

  const savedTheme = getJSON('aph:theme', 'naruto');
  applyTheme(savedTheme);

  themeNarutoBtn.addEventListener('click', () => applyTheme('naruto'));
  themeJjkBtn.addEventListener('click', () => applyTheme('jjk'));

  // ---------- To-Do List ----------
  const todoForm = $('#todo-form');
  const todoInput = $('#todo-input');
  const todoListEl = $('#todo-list');
  const clearCompletedBtn = $('#todo-clear-completed');
  const countEl = $('#todo-count');
  const filterButtons = $$('.filters .chip');

  let todos = getJSON('aph:todos', []);
  let activeFilter = getJSON('aph:todos:filter', 'all');

  function persistTodos() { setJSON('aph:todos', todos); }

  function renderTodos() {
    // Update filter active state
    filterButtons.forEach(btn => {
      const isActive = btn.dataset.filter === activeFilter;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive);
    });

    todoListEl.innerHTML = '';
    const filtered = todos.filter(t => {
      if (activeFilter === 'active') return !t.done;
      if (activeFilter === 'completed') return t.done;
      return true;
    });
    for (const t of filtered) {
      const li = document.createElement('li');
      li.className = 'todo-item' + (t.done ? ' done' : '');
      li.dataset.id = t.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = t.done;
      checkbox.addEventListener('change', () => toggleTodo(t.id));

      const text = document.createElement('div');
      text.className = 'text';
      text.contentEditable = 'true';
      text.textContent = t.text;
      text.addEventListener('blur', () => editTodo(t.id, text.textContent.trim()));
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
      });

      const actions = document.createElement('div');
      actions.className = 'todo-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'ghost';
      deleteBtn.title = 'Delete';
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', () => removeTodo(t.id));

      actions.appendChild(deleteBtn);

      li.appendChild(checkbox);
      li.appendChild(text);
      li.appendChild(actions);
      todoListEl.appendChild(li);
    }

    const remaining = todos.filter(t => !t.done).length;
    countEl.textContent = `${todos.length} item${todos.length !== 1 ? 's' : ''} (${remaining} left)`;
    setJSON('aph:todos:filter', activeFilter);
  }

  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    todos.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: trimmed, done: false });
    persistTodos();
    renderTodos();
  }

  function toggleTodo(id) {
    todos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    persistTodos();
    renderTodos();
  }

  function editTodo(id, newText) {
    todos = todos.map(t => t.id === id ? { ...t, text: newText || t.text } : t);
    persistTodos();
    renderTodos();
  }

  function removeTodo(id) {
    todos = todos.filter(t => t.id !== id);
    persistTodos();
    renderTodos();
  }

  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addTodo(todoInput.value);
    todoInput.value = '';
  });

  clearCompletedBtn.addEventListener('click', () => {
    todos = todos.filter(t => !t.done);
    persistTodos();
    renderTodos();
  });

  filterButtons.forEach(btn => btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    renderTodos();
  }));

  renderTodos();

  // ---------- Timer ----------
  const timerTimeEl = $('#timer-time');
  const timerMinutesInput = $('#timer-minutes');
  const startBtn = $('#timer-start');
  const pauseBtn = $('#timer-pause');
  const resetBtn = $('#timer-reset');
  const progressEl = $('#timer-progress');
  const soundCheckbox = $('#timer-sound');
  const presetButtons = $$('.presets .chip');

  let timerState = getJSON('aph:timer', {
    durationMs: 25 * 60 * 1000,
    endAt: null,
    running: false,
    remainingMs: 25 * 60 * 1000,
    sound: true,
  });

  // Rehydrate running timer using endAt
  if (timerState.running && timerState.endAt) {
    const now = Date.now();
    const remaining = timerState.endAt - now;
    if (remaining > 0) {
      timerState.remainingMs = remaining;
    } else {
      timerState.running = false;
      timerState.remainingMs = 0;
    }
  }

  let interval = null;

  function saveTimer() { setJSON('aph:timer', timerState); }

  function mmss(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${formatTwo(m)}:${formatTwo(s)}`;
  }

  function renderTimer() {
    timerTimeEl.textContent = mmss(timerState.remainingMs);
    timerMinutesInput.value = Math.round(timerState.durationMs / 60000);
    progressEl.value = Math.round((1 - (timerState.remainingMs / timerState.durationMs)) * 100) || 0;
    soundCheckbox.checked = !!timerState.sound;
    document.title = `${timerTimeEl.textContent} • Anime Productivity Hub`;
  }

  function tick() {
    const now = Date.now();
    timerState.remainingMs = Math.max(0, timerState.endAt - now);
    if (timerState.remainingMs === 0) {
      stopTimer(false);
      if (timerState.sound) beep();
    } else {
      renderTimer();
      saveTimer();
    }
  }

  function startTimer() {
    if (timerState.running) return;
    timerState.running = true;
    timerState.endAt = Date.now() + timerState.remainingMs;
    saveTimer();
    renderTimer();
    interval = setInterval(tick, 200);
  }

  function stopTimer(reset = false) {
    timerState.running = false;
    clearInterval(interval);
    interval = null;
    if (reset) {
      timerState.remainingMs = timerState.durationMs;
    }
    saveTimer();
    renderTimer();
  }

  function resetTimer() { stopTimer(true); }

  function setDurationMinutes(min) {
    const minutes = Math.max(1, Math.min(240, Number(min) || 25));
    timerState.durationMs = minutes * 60 * 1000;
    timerState.remainingMs = timerState.durationMs;
    timerState.running = false;
    timerState.endAt = null;
    saveTimer();
    renderTimer();
  }

  // WebAudio Beep
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.65);
    } catch (e) {}
  }

  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', () => stopTimer(false));
  resetBtn.addEventListener('click', resetTimer);
  timerMinutesInput.addEventListener('change', (e) => setDurationMinutes(e.target.value));
  soundCheckbox.addEventListener('change', (e) => { timerState.sound = !!e.target.checked; saveTimer(); });

  presetButtons.forEach(btn => btn.addEventListener('click', () => {
    presetButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = btn.dataset.preset;
    if (p === 'pomodoro') setDurationMinutes(25);
    else if (p === 'short') setDurationMinutes(5);
    else if (p === 'long') setDurationMinutes(15);
  }));

  renderTimer();

  // ---------- Day Scheduler ----------
  const dateInput = $('#schedule-date');
  const todayBtn = $('#schedule-today');
  const clearDayBtn = $('#schedule-clear');
  const scheduleGrid = $('#schedule-grid');

  function scheduleKey(dateStr) { return `aph:schedule:${dateStr}`; }

  function loadSchedule(dateStr) {
    return getJSON(scheduleKey(dateStr), {});
  }

  function saveSchedule(dateStr, data) {
    setJSON(scheduleKey(dateStr), data);
  }

  function renderSchedule(dateStr) {
    scheduleGrid.innerHTML = '';
    const data = loadSchedule(dateStr);
    const now = new Date();
    const currentHour = (new Date().toISOString().slice(0,10) === dateStr) ? now.getHours() : -1;

    for (let h = 0; h < 24; h++) {
      const hourLabel = document.createElement('div');
      hourLabel.className = 'hour';
      hourLabel.textContent = `${formatTwo(h)}:00`;

      const note = document.createElement('textarea');
      note.className = 'note';
      note.rows = 2;
      note.placeholder = 'Plan your task…';
      note.value = data[h] || '';
      if (h === currentHour) note.classList.add('current-hour');

      // Debounced save
      let t;
      note.addEventListener('input', () => {
        clearTimeout(t);
        const value = note.value;
        t = setTimeout(() => {
          const d = loadSchedule(dateStr);
          if (value) d[h] = value; else delete d[h];
          saveSchedule(dateStr, d);
        }, 300);
      });

      scheduleGrid.appendChild(hourLabel);
      scheduleGrid.appendChild(note);
    }
  }

  function setDateToToday() {
    const t = todayStr();
    dateInput.value = t;
    renderSchedule(t);
  }

  dateInput.addEventListener('change', () => renderSchedule(dateInput.value));
  todayBtn.addEventListener('click', setDateToToday);
  clearDayBtn.addEventListener('click', () => {
    const d = dateInput.value || todayStr();
    if (confirm('Clear all entries for this day?')) {
      saveSchedule(d, {});
      renderSchedule(d);
    }
  });

  // Initialize date
  dateInput.value = todayStr();
  renderSchedule(dateInput.value);
})();
