// FlowCore: проверки логики без браузера.
// Запуск: node tests/run.js   (из папки projects/flowcore)
// Скрипт приложения вырезается из flowcore.html, поэтому тесты всегда
// проверяют настоящий файл, а не отдельную копию.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'flowcore.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

function extractAppScript(source) {
  const blocks = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(source))) blocks.push(m[1]);
  if (!blocks.length) throw new Error('В flowcore.html не найден <script>');
  // Приложение — самый большой инлайновый блок
  return blocks.sort((a, b) => b.length - a.length)[0];
}

const src = extractAppScript(html);

function makeContext(fixedTs, seed, lang = 'ru') {
  const store = {};
  // Язык в тестах зафиксирован: они проверяют тексты, и от окружения это не зависит
  store['flowCoreLangV1'] = lang;
  if (seed !== undefined) store['flowCorePortfolioV5'] = JSON.stringify(seed);

  const el = () => ({
    textContent: '', innerHTML: '', value: '', className: '', style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, focus() {}, addEventListener() {}, getAttribute() { return null; },
    setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });

  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(fixedTs); else super(...a); }
    static now() { return fixedTs; }
  }

  const ctx = {
    Date: FakeDate, Math, JSON, Map, Set, Number, String, Array, Object, RegExp, Intl, console,
    document: (() => {
      const els = new Map();
      const getEl = id => { if (!els.has(id)) els.set(id, el()); return els.get(id); };
      return {
        getElementById: getEl, addEventListener() {}, createElement: () => el(), hidden: false,
        querySelector() { return null; }, querySelectorAll() { return []; },
        documentElement: { setAttribute() {}, getAttribute() { return null; }, lang: '' },
      };
    })(),
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    crypto: {
      subtle: {
        importKey: async () => ({}),
        deriveKey: async () => ({}),
        encrypt: async () => new ArrayBuffer(8),
        getRandomValues: a => a,
      },
    },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder,
    setTimeout: () => 0, setInterval: () => 0, clearInterval: () => {}, clearTimeout: () => {},
    alert: () => {}, confirm: () => true, prompt: () => null,
    navigator: { clipboard: { writeText: async () => {} } },
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, store };
}

const results = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, ok: a === e, actual: a, expected: e });
}

// Фиксированное "сейчас": суббота 24 окт 2026, полдень (локальное время)
const NOW = new Date(2026, 9, 24, 12, 0, 0).getTime();

// Новый профиль стартует с одной нейтральной сферой, поэтому тестам моста и
// переключения нужен явный многосферный профиль: без массива сфер загрузка
// отдаёт прежний набор из кода — тот же, что раньше был стартовым
const MULTI_SPHERE_PROFILE = { version: 6, points: 0, goal: 12, logs: [], weeks: [], onboarded: true };

// --- 1. Границы ISO-недели ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('01.01.2026 -> W01', q('isoWeekKey(new Date(2026,0,1))'), '2026-W01');
  check('29.12.2025 (пн) -> W01 2026', q('isoWeekKey(new Date(2025,11,29))'), '2026-W01');
  check('28.12.2025 (вс) -> W52 2025', q('isoWeekKey(new Date(2025,11,28))'), '2025-W52');
  check('01.01.2027 (пт) -> W53 2026', q('isoWeekKey(new Date(2027,0,1))'), '2026-W53');
  check('24.10.2026 -> W43', q('isoWeekKey(new Date(2026,9,24))'), '2026-W43');
  check('25.10.2026 (вс) та же неделя', q('isoWeekKey(new Date(2026,9,25))'), '2026-W43');
  check('26.10.2026 (пн) новая неделя', q('isoWeekKey(new Date(2026,9,26))'), '2026-W44');
  check('понедельник для 24.10', q('weekStartKey(new Date(2026,9,24))'), '2026-10-19');
  check('диапазон недели', q("formatWeekRange('2026-10-19')"), '19 окт – 25 окт');
}

// --- 2. Миграция v5, записи в текущей неделе ---
{
  const legacy = {
    points: 5, goal: 12, mode: 'wave', sphereIndex: 1, heartActive: true, soundEnabled: false,
    logs: [
      { id: 11, time: '24.10 09:00', kind: 'Заметка', text: 'свежая', pts: 2 },
      { id: 12, time: '22.10 10:00', kind: 'Заметка', text: 'тоже эта неделя', pts: 3 },
    ],
  };
  const { ctx } = makeContext(NOW, legacy);
  check('v5: очки сохранены', vm.runInContext('state.points', ctx), 5);
  check('v5: записи остались текущими', vm.runInContext('state.logs.length', ctx), 2);
  check('v5: архив пуст', vm.runInContext('state.weeks.length', ctx), 0);
  check('v5: ключ недели', vm.runInContext('state.weekKey', ctx), '2026-W43');
  check('v5: режим сохранен', vm.runInContext('state.mode', ctx), 'wave');
  check('v5: звук сохранен', vm.runInContext('state.soundEnabled', ctx), false);
  check('v5: ts восстановлен из строки', vm.runInContext('state.logs[0].ts', ctx),
    new Date(2026, 9, 24, 9, 0).getTime());
}

// --- 3. Миграция v5, записи из прошлой недели -> архив ---
{
  const legacy = {
    points: 5, goal: 20, mode: 'draft', sphereIndex: 0, heartActive: true,
    logs: [
      { id: 21, time: '11.10 12:00', kind: 'Заметка', text: 'прошлая неделя', pts: 5 },
    ],
  };
  const { ctx } = makeContext(NOW, legacy);
  check('старая неделя: текущие очки 0', vm.runInContext('state.points', ctx), 0);
  check('старая неделя: текущий журнал пуст', vm.runInContext('state.logs.length', ctx), 0);
  check('старая неделя: в архиве 1 бакет', vm.runInContext('state.weeks.length', ctx), 1);
  check('старая неделя: ключ архива', vm.runInContext('state.weeks[0].weekKey', ctx), '2026-W41');
  check('старая неделя: очки архивные', vm.runInContext('state.weeks[0].points', ctx), 5);
  check('старая неделя: запись в архиве', vm.runInContext('state.weeks[0].logs.length', ctx), 1);
  check('старая неделя: текущий ключ', vm.runInContext('state.weekKey', ctx), '2026-W43');
}

// --- 3b. Миграция v5 со смешанными неделями ---
{
  const legacy = {
    points: 7, goal: 12, mode: 'draft', sphereIndex: 0, heartActive: true,
    logs: [
      { id: 41, time: '24.10 09:00', kind: 'k', text: 'сегодня', pts: 2 },
      { id: 42, time: '11.10 10:00', kind: 'k', text: 'давно', pts: 5 },
    ],
  };
  const { ctx } = makeContext(NOW, legacy);
  check('смешанные недели: текущие очки только за эту неделю', vm.runInContext('state.points', ctx), 2);
  check('смешанные недели: в текущей неделе 1 запись', vm.runInContext('state.logs.length', ctx), 1);
  check('смешанные недели: старый бакет в архиве', vm.runInContext('state.weeks.length', ctx), 1);
  check('смешанные недели: ключ архива', vm.runInContext('state.weeks[0].weekKey', ctx), '2026-W41');
  check('смешанные недели: очки архива', vm.runInContext('state.weeks[0].points', ctx), 5);
  check('смешанные недели: сумма очков сохранена', vm.runInContext('state.points + state.weeks[0].points', ctx), 7);
}

// --- 3c. Типы записей и строгий режим очков ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('тип: остановился -> stop', q("inferLogType('Вовремя остановился', '')"), 'stop');
  check('тип: ком в груди -> signal', q("inferLogType('Заметка', 'слабый ком в груди')"), 'signal');
  check('тип: дыхание -> action', q("inferLogType('Дыхательная разгрузка', '60 секунд')"), 'action');
  check('тип: код -> action', q("inferLogType('Код и учеба', 'Подучиться 5 минут')"), 'action');
  q("state.requireTimer = true; state.timer.ranMs = 0; state.points = 0; state.logs = [];");
  q("completeActiveTask();");
  check('строгий режим: без таймера очков нет', q('state.points'), 0);
  check('строгий режим: запись не появилась', q('state.logs.length'), 0);
  q("state.timer.ranMs = 5 * 60000;");
  q("completeActiveTask();");
  check('строгий режим: после 5 минут очки есть', q('state.points'), 2);
  check('строгий режим: запись появилась', q('state.logs.length'), 1);
  check('строгий режим: счетчик времени сброшен', q('state.timer.ranMs'), 0);
  check('тип у новой записи', q('state.logs[0].type'), 'action');
}

// --- 4. Ролловер v6: состояние прошлой недели ---
{
  const v6 = {
    version: 6, weekKey: '2026-W42', weekStart: '2026-10-12',
    points: 7, goal: 30, mode: 'draft', sphereIndex: 0,
    heartActive: true, soundEnabled: true, weeks: [],
    timer: { running: false, endsAt: 0, remainingMs: 300000, totalMs: 300000, finished: false },
    logs: [{ id: 31, ts: new Date(2026, 9, 18, 20, 0).getTime(), time: '18.10 20:00', kind: 'k', text: 't', pts: 7 }],
  };
  const { ctx } = makeContext(NOW, v6);
  check('ролловер: очки обнулились', vm.runInContext('state.points', ctx), 0);
  check('ролловер: журнал пуст', vm.runInContext('state.logs.length', ctx), 0);
  check('ролловер: архив 1', vm.runInContext('state.weeks.length', ctx), 1);
  check('ролловер: ключ архива W42', vm.runInContext('state.weeks[0].weekKey', ctx), '2026-W42');
  check('ролловер: очки архива', vm.runInContext('state.weeks[0].points', ctx), 7);
  check('ролловер: цель архива 30', vm.runInContext('state.weeks[0].goal', ctx), 30);
  check('ролловер: новый ключ W43', vm.runInContext('state.weekKey', ctx), '2026-W43');
  check('ролловер: таймер сброшен', vm.runInContext('state.timer.running', ctx), false);
}

// --- 5. Кап и минимум цели ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('кап: 58+2 -> 60', q('clampGoal(58 + 2)'), 60);
  check('кап: 60+2 -> 60', q('clampGoal(60 + 2)'), 60);
  check('кап: 24+2 -> 26 (прежний потолок снят)', q('clampGoal(24 + 2)'), 26);
  check('кап: 4+2 -> 6', q('clampGoal(4 + 2)'), 6);
  check('кап: мусор -> 12', q('clampGoal("abc")'), 12);
  check('adjustGoal поднимает выше 24', (q('state.goal = 24; adjustGoal(2); state.goal')), 26);
}

// --- 6. Ручное закрытие недели ничего не теряет ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q("state.points = 9; state.logs = [{ id: 1, ts: Date.now(), time: '24.10 12:00', kind: 'k', text: 'x', pts: 9 }]; archiveCurrentWeek();");
  check('закрытие: журнал пуст', q('state.logs.length'), 0);
  check('закрытие: очки 0', q('state.points'), 0);
  check('закрытие: архив 1', q('state.weeks.length'), 1);
  check('закрытие: сумма в архиве', q('state.weeks[0].points'), 9);
  check('закрытие: запись цела', q('state.weeks[0].logs.length'), 1);
  q("state.points = 3; state.logs = [{ id: 2, ts: Date.now(), time: '24.10 13:00', kind: 'k', text: 'y', pts: 3 }]; archiveCurrentWeek();");
  check('закрытие дважды: один бакет на неделю', q('state.weeks.length'), 1);
  check('закрытие дважды: очки суммируются', q('state.weeks[0].points'), 12);
  check('закрытие дважды: записи на месте', q('state.weeks[0].logs.length'), 2);
}

// --- 7. Таймер: пауза/возобновление и завершение без минуса ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('таймер: старт', q("setTimerMinutes(5); toggleTimer(); state.timer.running"), true);
  check('таймер: остаток 300с', q('Math.round(timerRemainingMs() / 1000)'), 300);
  q('toggleTimer();');
  check('таймер: пауза', q('state.timer.running'), false);
  check('таймер: остаток сохранен', q('state.timer.remainingMs'), 300000);
  check('таймер: пауза на полном остатке = Старт', q("renderTimer(); document.getElementById('timerActionHint').textContent"), 'Старт');
  q('state.timer.remainingMs = 200000; renderTimer();');
  check('таймер: подсказка после паузы', q("document.getElementById('timerActionHint').textContent"), 'Продолжить');
  check('таймер: отсчет 03:20', q("document.getElementById('timerReadout').textContent"), '03:20');
  q('state.timer.endsAt = Date.now() - 1; state.timer.running = true;');
  check('таймер: истекший не уходит в минус', q('timerRemainingMs()'), 0);
}

// --- 8. Полный сценарий: новая неделя через ensureCurrentWeek ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q("state.weekKey = '2026-W43'; state.weekStart = '2026-10-19'; state.points = 4;");
  check('нулевой ролловер: та же неделя', q("ensureCurrentWeek(state, new Date(2026,9,24))"), false);
  check('ролловер: смена недели', q("ensureCurrentWeek(state, new Date(2026,9,26))"), true);
  check('ролловер: архив получил W43', q("state.weeks[0].weekKey"), '2026-W43');
  check('ролловер: новая неделя W44', q('state.weekKey'), '2026-W44');
}

// --- 9. Минуты таймера, прогресс, напоминание о бэкапе, первый шаг ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('минуты: 0 -> 5 (по умолчанию)', q('clampMinutes(0)'), 5);
  check('минуты: 500 -> 180', q('clampMinutes(500)'), 180);
  check('минуты: 25 -> 25', q('clampMinutes(25)'), 25);
  check('минуты: мусор -> 5', q('clampMinutes("abc")'), 5);
  check('верхняя граница стоп-крана 30 минут', q('modeTimers.wave'), 30);
  check('градация тепла: 0', q('heatLevel(0)'), 0);
  check('градация тепла: 2', q('heatLevel(2)'), 1);
  check('градация тепла: 5', q('heatLevel(5)'), 2);
  check('градация тепла: 8', q('heatLevel(8)'), 3);
  check('градация тепла: 9', q('heatLevel(9)'), 4);
  check('склонение: 1 день', q('pluralDays(1)'), 'день');
  check('склонение: 3 дня', q('pluralDays(3)'), 'дня');
  check('склонение: 11 дней', q('pluralDays(11)'), 'дней');
  check('склонение: 21 день', q('pluralDays(21)'), 'день');
}

// --- 10. Очки по дням для тепловой карты ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q(`state.logs = [
    { id: 1, ts: new Date(2026, 9, 24, 10, 0).getTime(), pts: 2 },
    { id: 2, ts: new Date(2026, 9, 24, 12, 0).getTime(), pts: 3 }
  ];
  state.weeks = [{ weekKey: '2026-W42', weekStart: '2026-10-12', points: 4, goal: 12, logs: [
    { id: 3, ts: new Date(2026, 9, 14, 9, 0).getTime(), pts: 4 }
  ] }];`);
  const map = q('Array.from(collectDayPoints().entries())');
  const day = key => (map.find(e => e[0] === key) || [])[1];
  check('день: сумма и количество записей', day('2026-10-24'), { pts: 5, count: 2 });
  check('архивная неделя тоже в карте', day('2026-10-14'), { pts: 4, count: 1 });
  check('пустой день отсутствует', day('2026-10-20'), undefined);
}

// --- 11. Напоминание о бэкапе ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('бэкап: без данных не напоминает', q('state.logs = []; state.weeks = []; backupDue()'), false);
  check('бэкап: ни разу не скачивался — напоминает', q('state.logs = [{ pts: 1 }]; backupDue()'), true);
  check('бэкап: вчерашний — молчит', q('state.lastExportAt = Date.now() - 86400000; backupDue()'), false);
  check('бэкап: 9 дней — напоминает', q('state.lastExportAt = Date.now() - 9 * 86400000; backupDue()'), true);
  check('бэкап: отложен на неделю — молчит', q('state.nudgeSnoozeUntil = Date.now() + 7 * 86400000; backupDue()'), false);
}

// --- 12. Первый шаг попадает в запись и очищается ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q("state.mode = 'draft'; state.logs = []; state.points = 0; pickFirstStep(0);");
  check('первый шаг выбран', q('state.firstStep'), 'Достать нужное');
  q('completeActiveTask();');
  check('шаг попал в текст записи', q("state.logs[0].text.includes('первый шаг')"), true);
  check('после записи шаг пуст', q('state.firstStep'), '');
  check('очки начислены', q('state.points'), 2);
}

// --- 13. Отрезок — шаг, а не финиш: минуты в логе и продолжение ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('минимальный старт — 5 минут', q('modeTimers.micro'), 5);
  q("state.mode = 'wave'; state.logs = []; state.points = 0; setTimerMinutes(15); toggleTimer(); state.timer.ranMs = 15 * 60000; completeActiveTask();");
  check('отрезок виден в записи', q("state.logs[0].text.includes('отрезок 15 мин')"), true);
  check('минуты отрезка сохранены', q('state.logs[0].spentMs'), 900000);
  check('очки за отрезок', q('state.points'), 3);
  check('сегодня: одна отметка', q('todayStats().count'), 1);
  check('сегодня: 15 минут', q('todayStats().ms'), 900000);
  q('continueTimer(30)');
  check('продолжение ставит 30 минут', q('Math.round(state.timer.totalMs / 60000)'), 30);
  check('продолжение сразу идёт', q('state.timer.running'), true);
  q('resetTimer()');
  check('сброс гасит таймер', q('state.timer.running'), false);
}

// --- 14. Сессия истекла, пока вкладка была закрыта ---
{
  const expired = {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 0, goal: 12, mode: 'draft',
    sphereIndex: 0, heartActive: true, soundEnabled: true, weeks: [], logs: [],
    timer: {
      running: true, endsAt: NOW - 1000, startedAt: NOW - 15 * 60000,
      totalMs: 15 * 60000, remainingMs: 15 * 60000, finished: false, ranMs: 0
    }
  };
  const { ctx } = makeContext(NOW, expired);
  check('истёкший в фоне отрезок: таймер остановлен', vm.runInContext('state.timer.running', ctx), false);
  check('истёкший в фоне отрезок: готов', vm.runInContext('state.timer.finished', ctx), true);
  check('истёкший в фоне отрезок: минуты учтены',
    Math.round(vm.runInContext('state.timer.ranMs', ctx) / 60000), 15);
}

// --- 15. Мягкий дневной потолок очков ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('потолок дня — 8', q('DAILY_CAP'), 8);
  q('state.logs = []; state.weeks = []; state.points = 0; state.mode = \'wave\';');
  check('пустой день: очков 0', q('pointsToday()'), 0);
  check('пустой день: осталось 8', q('remainingPointsToday()'), 8);
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('первый отрезок: 3 очка', q('state.points'), 3);
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('второй отрезок: 6 очков', q('state.points'), 6);
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('третий отрезок урезан до потолка', q('state.points'), 8);
  check('в записи стоит реально начисленное', q('state.logs[0].pts'), 2);
  check('после потолка осталось 0', q('remainingPointsToday()'), 0);
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('сверх потолка очков не дают', q('state.points'), 8);
  check('но запись сохранена', q('state.logs[0].kind'), 'Своё дело');
  check('в записи ноль очков', q('state.logs[0].pts'), 0);
  check('дневник не потерял отметку', q('state.logs.length'), 4);
  q('state.logs = []; state.points = 0; state.timer.ranMs = 0; completeActiveTask();');
  check('после уборки журнала счёт снова свободен', q('remainingPointsToday()'), 5);
}

// --- 15b. Вчерашние очки не съедают сегодняшний потолок ---
{
  const seed = {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 6, goal: 12, mode: 'draft',
    sphereIndex: 0, heartActive: true, soundEnabled: true, weeks: [],
    logs: [{ id: 1, ts: NOW - 86400000, time: '23.10 12:00', kind: 'k', text: 'вчера', pts: 6 }],
  };
  const { ctx } = makeContext(NOW, seed);
  const q = expr => vm.runInContext(expr, ctx);
  check('вчерашние 6 очков в неделе остались', q('state.points'), 6);
  check('но в сегодняшний потолок не идут', q('pointsToday()'), 0);
  check('на сегодня доступно все 8', q('remainingPointsToday()'), 8);
}

// --- 15c. Потолок можно снять на сегодня ---
{
  const { ctx, store } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q("state.logs = []; state.weeks = []; state.points = 0; state.mode = 'wave'; state.capOffDay = '';");
  check('потолок: по умолчанию включён', q('capOffToday()'), false);
  q('state.timer.ranMs = 60000; completeActiveTask(); completeActiveTask(); completeActiveTask();');
  check('потолок: три отрезка дают 8', q('state.points'), 8);
  q('toggleCapOff();');
  check('потолок: снят на сегодня', q('capOffToday()'), true);
  check('потолок: снятие записано в состояние', q('state.capOffDay'), '2026-10-24');
  check('потолок: снятие легло на диск', JSON.parse(store['flowCorePortfolioV5']).capOffDay, '2026-10-24');
  // Infinity через JSON.stringify становится null, поэтому сравниваем предикатом
  check('потолок: места не ограничено', q('remainingPointsToday() === Infinity'), true);
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('потолок: сверх восьми начисляют', q('state.points'), 11);
  check('потолок: в записи полные три очка', q('state.logs[0].pts'), 3);
  q('toggleCapOff();');
  check('потолок: вернули — снова режет', q('remainingPointsToday()'), 0);
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('потолок: после возврата очков нет', q('state.points'), 11);
  q("state.capOffDay = '2026-10-01';");
  check('потолок: вчерашнее снятие не действует', q('capOffToday()'), false);
  check('потолок: и место снова кончилось', q('remainingPointsToday()'), 0);
}

// --- 15d. Строка дня показывает переключатель потолка ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q("state.logs = []; state.weeks = []; state.points = 0; state.capOffDay = '';");
  q('state.timer.ranMs = 60000; completeActiveTask();');
  check('строка дня: переключатель на месте', q("renderTodayLine(); document.getElementById('todayLine').innerHTML.indexOf('toggleCapOff()') > -1"), true);
  check('строка дня: пока с потолком', q("document.getElementById('todayLine').innerHTML.indexOf('Снять потолок на сегодня') > -1"), true);
  q('toggleCapOff();');
  check('строка дня: говорит про снятый потолок', q("document.getElementById('todayLine').innerHTML.indexOf('без потолка') > -1"), true);
  check('строка дня: предлагает вернуть', q("document.getElementById('todayLine').innerHTML.indexOf('Вернуть потолок') > -1"), true);
}

// --- 15e. Без потолка заряд отдыха не сгорает ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q("state.logs = []; state.weeks = []; state.points = 0; state.restBonus = 2; state.capOffDay = '2026-10-24';");
  q("addLogEntry('Своё дело', 'шаг', 3, 'action');");
  check('без потолка: очки начислены полностью', q('state.logs[0].pts'), 3);
  check('без потолка: заряд отдыха цел', q('state.restBonus'), 2);
}

// --- 15f. Поле снятия потолка переживает бэкап и мусор ---
{
  const seed = {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 0, goal: 12,
    logs: [], weeks: [], capOffDay: '2026-10-24',
  };
  const kept = makeContext(NOW, seed);
  check('потолок из бэкапа: снят', vm.runInContext('capOffToday()', kept.ctx), true);
  const junk = makeContext(NOW, { version: 6, capOffDay: 12345 });
  check('потолок: мусор в поле — потолок на месте', vm.runInContext('capOffToday()', junk.ctx), false);
}

// --- 16. Мост к следующей сессии ---
{
  const first = makeContext(NOW, MULTI_SPHERE_PROFILE);
  const q1 = expr => vm.runInContext(expr, first.ctx);
  check('без остановки моста нет', q1('bridgeDue()'), false);
  q1('state.logs = []; state.points = 0; state.sphereIndex = 2; state.mode = \'wave\';');
  q1('state.timer.ranMs = 60000; completeActiveTask();');
  check('остановка записана', q1('state.lastStop.sphere'), 'Тело и перезагрузка');
  check('остановка помнит режим', q1('state.lastStop.mode'), 'wave');
  check('в тот же день мост скрыт', q1('bridgeDue()'), false);

  const saved = JSON.parse(first.store['flowCorePortfolioV5']);
  const next = makeContext(NOW + 86400000, saved);
  const q2 = expr => vm.runInContext(expr, next.ctx);
  check('на следующий день мост виден', q2('bridgeDue()'), true);
  check('мост: "вчера"', q2('bridgeDaysAgo()'), 1);
  q2('state.sphereIndex = 0; resumeFromBridge();');
  check('мост поднял сферу остановки', q2('state.sphereIndex'), 2);
  check('мост поднял режим', q2('state.mode'), 'wave');
  check('мост сразу запустил таймер', q2('state.timer.running'), true);
  check('мост ставит 5 минут', q2('Math.round(state.timer.totalMs / 60000)'), 5);
  check('после продолжения мост скрыт', q2('bridgeDue()'), false);

  const later = makeContext(NOW + 2 * 86400000, saved);
  const q3 = expr => vm.runInContext(expr, later.ctx);
  check('через два дня мост тоже есть', q3('bridgeDue()'), true);
  check('через два дня: "2 дня назад"', q3('bridgeDaysAgo()'), 2);
  q3('dismissBridge()');
  check('после «не сейчас» мост скрыт', q3('bridgeDue()'), false);
  check('«не сейчас» пишется в состояние', q3('state.lastStop.resumed'), true);
}

// --- 17. Сквозной опыт и уровень ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('уровень: 10 очков на шаг', q('XP_PER_LEVEL'), 10);
  q('state.points = 0; state.weeks = [];');
  check('опыт: пустая панель — 0', q('lifetimeXp()'), 0);
  check('уровень: с нуля — первый', q('levelInfo().level'), 1);
  check('уровень: порог первого 10', q('levelInfo().next'), 10);
  q('state.points = 9;');
  check('опыт: текущая неделя в счёте', q('lifetimeXp()'), 9);
  check('уровень: 9 — всё ещё первый', q('levelInfo().level'), 1);
  q('state.points = 10;');
  check('уровень: 10 — второй', q('levelInfo().level'), 2);
  check('уровень: до следующего 20', q('levelInfo().next'), 20);
  q("state.weeks = [{ weekKey: '2026-W41', weekStart: '2026-10-05', points: 14, goal: 12, logs: [] }]; state.points = 10;");
  check('опыт: архив прибавляется', q('lifetimeXp()'), 24);
  check('уровень: 24 — третий', q('levelInfo().level'), 3);
  check('уровень: порог третьего 30', q('levelInfo().next'), 30);
  check('уровень: внутри уровня 4 из 10', q('levelInfo().into'), 4);
  check('уровень: до следующего 6', q('levelInfo().next - levelInfo().xp'), 6);
  check('уровень: отрицательный опыт не уводит ниже 1', q('levelInfo(-5).level'), 1);
  // Удаление записи обязано честно опустить опыт: он не хранится, а считается
  q("state.weeks = [{ weekKey: '2026-W41', weekStart: '2026-10-05', points: 14, goal: 12, logs: [] }]; state.points = 4; state.logs = [{ id: 9, ts: Date.now(), time: '24.10 12:00', kind: 'k', text: 'x', pts: 4 }];");
  q('deleteLogEntry(9);');
  check('удаление: опыт пересчитан по бакетам', q('lifetimeXp()'), 14);
  check('удаление: уровень опустился честно', q('levelInfo().level'), 2);
}

// --- 18. Скин: набор, уровни, хранение, мусор ---
{
  const { ctx, store } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('скин по умолчанию', q('state.skin'), 'emerald');
  check('в наборе четыре скина', q('Object.keys(SKINS).length'), 4);
  check('пороги: янтарь на 3 уровне', q('SKINS.amber.minLevel'), 3);
  check('пороги: кибер на 6, аврора на 10', q('[SKINS.cyber.minLevel, SKINS.aurora.minLevel]'), [6, 10]);
  check('на первом уровне изумруд открыт', q('skinUnlocked("emerald")'), true);
  check('на первом уровне янтарь заперт', q('skinUnlocked("amber")'), false);
  q("setSkin('amber');");
  check('запертый скин не выбирается', q('state.skin'), 'emerald');
  q('state.weeks = [{ weekKey: "2026-W41", weekStart: "2026-10-05", points: 20, goal: 12, logs: [] }]; state.points = 0;');
  check('на 20 очках — третий уровень', q('levelInfo().level'), 3);
  check('янтарь открылся вместе с уровнем', q('skinUnlocked("amber")'), true);
  q("setSkin('amber');");
  check('скин выбран', q('state.skin'), 'amber');
  check('скин лёг отдельным ключом', store['flowCoreSkinV1'], 'amber');
  const saved = JSON.parse(store['flowCorePortfolioV5']);
  check('скин попал в состояние (переживёт бэкап)', saved.skin, 'amber');
  const next = makeContext(NOW + 1000, saved);
  check('скин восстановлен из состояния', vm.runInContext('state.skin', next.ctx), 'amber');
  check('старое имя ice переезжает в кибер', vm.runInContext('normalizeSkin("ice")', next.ctx), 'cyber');
  q("setSkin('нет-такого');");
  check('мусорный скин откатывается к базовому', q('state.skin'), 'emerald');
  check('у каждого скина есть цвет адресной строки', q('SKINS.emerald.theme'), '#030704');
  // Уровень упал — выбранный скин не отбираем, панель не должна менять лицо под рукой
  q('state.weeks = []; state.points = 0; applySkin("aurora"); state.skin = "aurora";');
  check('упавший уровень не отбирает выбранный скин', q('state.skin'), 'aurora');
  check('но новый выбор снова заперт', q('skinUnlocked("cyber")'), false);
}

// --- 19. Бонус отдыха ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('отдых: потолок зарядов — 3', q('REST_CAP'), 3);
  check('отдых: лёгкий день — до 6 очков', q('REST_LIGHT_DAY'), 6);
  q("state.logs = []; state.weeks = []; state.restBonus = 0; state.lastRestCheckDay = '';");
  check('отдых: первый запуск ничего не даёт', q('syncRestBonus(state, new Date(2026,9,24,12,0))'), false);
  check('отдых: отметка дня поставлена', q('state.lastRestCheckDay'), '2026-10-24');
  check('отдых: зарядов на старте 0', q('state.restBonus'), 0);
  check('отдых: второй раз в тот же день молчит', q('syncRestBonus(state, new Date(2026,9,24,20,0))'), false);

  q(`state.logs = [{ id: 1, ts: new Date(2026,9,23,12,0).getTime(), time: '23.10 12:00', kind: 'k', text: 'x', pts: 5 }];
     state.restBonus = 0; state.lastRestCheckDay = '2026-10-23';`);
  check('отдых: спокойный вчерашний день даёт заряд', q('syncRestBonus(state, new Date(2026,9,24,12,0))'), true);
  check('отдых: заряд начислен', q('state.restBonus'), 1);

  q(`state.logs = [{ id: 2, ts: new Date(2026,9,23,12,0).getTime(), time: '23.10 12:00', kind: 'k', text: 'x', pts: 7, type: 'action' }];
     state.restBonus = 0; state.lastRestCheckDay = '2026-10-23';`);
  check('отдых: тяжёлый день без остановки — без заряда', q('syncRestBonus(state, new Date(2026,9,24,12,0))'), false);
  check('отдых: зарядов 0', q('state.restBonus'), 0);

  q(`state.logs = [{ id: 3, ts: new Date(2026,9,23,12,0).getTime(), time: '23.10 12:00', kind: 'k', text: 'x', pts: 7, type: 'stop' }];
     state.restBonus = 0; state.lastRestCheckDay = '2026-10-23';`);
  check('отдых: тяжёлый день с ранней остановкой — заряд есть', q('syncRestBonus(state, new Date(2026,9,24,12,0))'), true);

  q("state.logs = []; state.restBonus = 3; state.lastRestCheckDay = '2026-10-23';");
  q('syncRestBonus(state, new Date(2026,9,24,12,0));');
  check('отдых: больше трёх зарядов не копится', q('state.restBonus'), 3);

  q('state.logs = []; state.weeks = []; state.points = 0; state.restBonus = 1;');
  check('расход: шаг с зарядом даёт 2 очка', q("addLogEntry('k', 't', 1, 'action')"), 2);
  check('расход: заряд списан', q('state.restBonus'), 0);
  check('расход: в записи стоит начисленное', q('state.logs[0].pts'), 2);

  q("state.logs = [{ id: 9, ts: Date.now(), time: '24.10 12:00', kind: 'k', text: 'y', pts: 7 }]; state.points = 0; state.restBonus = 1;");
  check('расход: урезанный шаг не тратит заряд', q("addLogEntry('k', 'z', 2, 'action')"), 1);
  check('расход: заряд цел', q('state.restBonus'), 1);

  q("state.logs = []; state.weeks = []; state.points = 0; state.restBonus = 0; state.restBreathDay = '';");
  q('completeBreathingStep();');
  check('дыхание: заряд начислен', q('state.restBonus'), 1);
  check('дыхание: очко за разгрузку на месте', q('state.points'), 1);
  q('completeBreathingStep();');
  check('дыхание: второй заряд за день не дают', q('state.restBonus'), 1);

  const seeded = makeContext(NOW, {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 0, goal: 12,
    skin: 'emerald', restBonus: 9, logs: [], weeks: [],
  });
  check('отдых: мусорное число зарядов ужато', vm.runInContext('state.restBonus', seeded.ctx), 3);
}

// --- 20. Страховочный буфер недели ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  const setup = (points, goal, logs) => {
    q(`state.weeks = []; state.reservePool = 0; state.weekKey = '2026-W43'; state.weekStart = '2026-10-19';
       state.points = ${points}; state.goal = ${goal}; state.logs = ${JSON.stringify(logs)};`);
  };
  const log = (pts, type) => ({ id: 1, ts: new Date(2026, 9, 20, 12, 0).getTime(), time: '20.10 12:00', kind: 'k', text: 'x', pts, type });
  check('резерв: потолок 4', q('RESERVE_CAP'), 4);
  check('резерв: стартует с нуля', q('state.reservePool'), 0);

  setup(5, 12, [log(5, 'action')]);
  q('ensureCurrentWeek(state, new Date(2026,9,26));');
  check('резерв: тихая неделя без остановок буфера не даёт', q('state.reservePool'), 0);
  check('резерв: неделя всё равно в архиве', q('state.weeks.length'), 1);

  setup(14, 12, [log(14, 'action')]);
  q('ensureCurrentWeek(state, new Date(2026,9,26));');
  check('резерв: перевыполненная неделя даёт +1', q('state.reservePool'), 1);

  setup(3, 12, [log(3, 'stop')]);
  q('ensureCurrentWeek(state, new Date(2026,9,26));');
  check('резерв: неделя с ранней остановкой даёт +1', q('state.reservePool'), 1);

  setup(20, 12, [log(20, 'action')]);
  q('state.reservePool = 4;');
  q('ensureCurrentWeek(state, new Date(2026,9,26));');
  check('резерв: выше четырёх не поднимается', q('state.reservePool'), 4);

  setup(13, 12, [log(13, 'action')]);
  q('state.logs[0].ts = Date.now();');
  q('archiveCurrentWeek();');
  check('резерв: ручное закрытие недели тоже даёт +1', q('state.reservePool'), 1);

  q("state.reservePool = 2; state.points = 3; state.goal = 12; state.logs = []; state.weeks = []; state.weekKey = '2026-W43'; state.weekStart = '2026-10-19';");
  check('резерв: использование возвращает очко в неделю', q('claimReservePoint(); state.points'), 4);
  check('резерв: пул уменьшился', q('state.reservePool'), 1);
  check('резерв: в записи ноль очков', q('state.logs[0].pts'), 0);
  check('резерв: потолок дня не тронут', q('pointsToday()'), 0);
  q('claimReservePoint();');
  check('резерв: второе использование работает', q('state.points'), 5);
  q('claimReservePoint();');
  check('резерв: пустой пул очков не даёт', q('state.points'), 5);

  const seeded = makeContext(NOW, {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 0, goal: 12,
    reservePool: 9, logs: [], weeks: [],
  });
  check('резерв: мусорное число ужато', vm.runInContext('state.reservePool', seeded.ctx), 4);
}

// --- 21. Markdown для Obsidian ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  q(`state.weekKey = '2026-W43'; state.weekStart = '2026-10-19'; state.points = 5; state.goal = 12;
     state.weeks = [{ weekKey: '2026-W41', weekStart: '2026-10-05', points: 30, goal: 12, logs: [] }];
     state.logs = [
       { id: 1, ts: new Date(2026,9,22,9,0).getTime(), time: '22.10 09:00', kind: 'Код и учеба', text: 'первый шаг', pts: 2, type: 'action' },
       { id: 2, ts: new Date(2026,9,24,10,0).getTime(), time: '24.10 10:00', kind: 'Заметка', text: 'ком' + String.fromCharCode(10) + 'в груди', pts: 0, type: 'signal' },
       { id: 3, ts: new Date(2026,9,23,11,0).getTime(), time: '23.10 11:00', kind: 'Вовремя остановился', text: 'остановился', pts: 3, type: 'stop' }
     ];`);
  const md = q('buildObsidianMarkdown()');
  check('md: YAML-шапка на месте', md.split('\n')[0], '---');
  check('md: теги', md.includes('tags: [flowcore, regulation, log]'), true);
  check('md: неделя в шапке', md.includes('week: 2026-W43'), true);
  check('md: счёт в шапке', md.includes('score: 5/12'), true);
  check('md: уровень учитывает архив', md.includes('level: 4'), true);
  check('md: три секции', ['## Выполненные шаги', '## Телесные сигналы', '## Ранний стоп и саморегуляция'].every(t => md.includes(t)), true);
  check('md: запись шага на месте', md.includes('- **22.10 09:00** — первый шаг (+2)'), true);
  check('md: перевод строки в записи склеен', md.includes('ком в груди'), true);
  check('md: записи по времени, а не наоборот', md.indexOf('22.10 09:00') < md.indexOf('23.10 11:00'), true);
  check('md: без замка нет предупреждения', md.includes('Экспорт открытым текстом'), false);
  q('vault.enabled = true;');
  check('md: с замком честно предупреждает', q('buildObsidianMarkdown()').includes('Экспорт открытым текстом'), true);
  q('vault.enabled = false; state.logs = [];');
  check('md: пустые секции не ломают файл', q('buildObsidianMarkdown()').includes('_Пусто._'), true);
}

// --- 22. Свои сферы ---
{
  const { ctx, store } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  // Новый профиль стартует с одной нейтральной сферой из словаря, а не
  // с русским набором из кода: тот остался только для миграции
  check('сферы: стартовый набор — дело и отдых', q('spheresOf().length'), 2);
  check('сферы: стартовая сфера на языке интерфейса', q('spheresOf()[0].name'), 'Своё дело');
  check('сферы: активная по индексу', q('currentSphere().name'), 'Своё дело');

  check('сферы: пустой массив откатывается к дефолту', q('normalizeSpheres([]).length'), 3);
  check('сферы: мусор вместо массива', q('normalizeSpheres("нет").length'), 3);
  check('сферы: дырки в сфере заполняются', q('normalizeSpheres([{ name: "Своё" }])[0].tasks.draft'), q('DEFAULT_SPHERES[0].tasks.draft'));
  check('сферы: больше двенадцати не берём', q('normalizeSpheres(new Array(20).fill({ name: "x" })).length'), 12);
  check('сферы: индекс вне диапазона даёт первую', q('state.sphereIndex = 99; currentSphere().name'), 'Своё дело');
  q('state.sphereIndex = 0;');

  q("updateSphere(0, 'task.draft', 'Мой текст задачи');");
  check('правка: задача изменилась', q('spheresOf()[0].tasks.draft'), 'Мой текст задачи');
  check('правка: главная перерисована', q("document.getElementById('activeTaskTitle').textContent"), 'Мой текст задачи');
  q("updateSphere(0, 'name', '  Учёба  ');");
  check('правка: имя обрезано по краям', q('spheresOf()[0].name'), 'Учёба');
  q("updateSphere(0, 'name', '   ');");
  check('правка: пустое имя не оставляет пустоту', q('spheresOf()[0].name'), 'Моё дело');
  q("updateSphere(0, 'step.1', 'Открыть конспект');");
  check('правка: первый шаг изменился', q('spheresOf()[0].steps[1]'), 'Открыть конспект');

  q('addSphere();');
  check('добавление: сфер стало три', q('spheresOf().length'), 3);
  check('добавление: новая выбрана', q('currentSphere().name'), 'Новая сфера');
  q('removeSphere(2);');
  check('удаление: сфер снова две', q('spheresOf().length'), 2);
  q('state.spheres = [state.spheres[0]]; removeSphere(0);');
  check('удаление: последнюю сферу не удалить', q('state.spheres.length'), 1);

  q("state.spheres = normalizeSpheres(null); updateSphere(1, 'task.micro', 'Пять минут на воду');");
  const saved = JSON.parse(store['flowCorePortfolioV5']);
  check('сферы попадают на диск', saved.spheres[1].tasks.micro, 'Пять минут на воду');
  const next = makeContext(NOW + 1000, saved);
  check('сферы переживают перезагрузку', vm.runInContext('spheresOf()[1].tasks.micro', next.ctx), 'Пять минут на воду');
  const clamped = makeContext(NOW, {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 0, goal: 12,
    sphereIndex: 42, spheres: [{ name: 'Своё', tasks: {}, steps: [], notes: {} }], logs: [], weeks: [],
  });
  check('сферы: из бэкапа берём свои', vm.runInContext('spheresOf().length', clamped.ctx), 1);
  check('сферы: битый индекс сбрасывается', vm.runInContext('state.sphereIndex', clamped.ctx), 0);
}

// --- 23. Первый запуск: интервью ---
{
  const { ctx, store } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('старт: интервью не пройдено', q('state.onboarded'), false);
  check('старт: дневник пуст', q('state.logs.length'), 0);
  check('старт: очки не начислены', q('state.points'), 0);
  check('старт: шаблонов семь', q('ONBOARD_TEMPLATES.length'), 7);
  check('старт: все шаблоны со своими задачами', q('ONBOARD_TEMPLATES.every(tpl => { const s = tpl.build().sphere; return s.tasks.micro && s.tasks.micro.length > 3 && s.steps.length === 3; })'), true);
  check('старт: у каждого шаблона есть имя', q('ONBOARD_TEMPLATES.every(tpl => tpl.build().label && tpl.build().sphere.name)'), true);
  // Шаблоны собираются из словаря: сырой ключ вроде tpl.study.micro не должен попасть в сферу
  check('старт: ни одного сырого ключа', q("JSON.stringify(ONBOARD_TEMPLATES.map(tpl => tpl.build())).indexOf('tpl.')"), -1);
  check('старт: заготовка на языке интерфейса', q("uiLang = 'de'; onboardTemplate('study').label"), 'Lernen und Kurse');
  check('старт: немецкая заготовка задачи', q("onboardTemplate('code').sphere.tasks.draft"), '5-15 Minuten im Code stöbern, ohne fertig werden zu wollen');
  check('старт: язык можно сменить — текст тоже', q("uiLang = 'uk'; onboardTemplate('body').sphere.name"), 'Тіло й рух');
  q("uiLang = 'ru';");

  q("onboardToggle('study'); onboardToggle('body');");
  check('интервью: выбраны два дела', q('onboard.picks.size'), 2);
  q('onboardToggle(\'body\');');
  check('интервью: повторный клик снимает выбор', q('onboard.picks.size'), 1);

  q("onboard.picks = new Set(['study', 'body']); onboard.goal = 20; onboard.name = 'Курс по сетям'; onboard.step = 3;");
  q('finishOnboarding(false);');
  check('интервью: сферы собраны из выбора', q('state.spheres.length'), 2);
  check('интервью: имя из ответа', q('state.spheres[0].name'), 'Курс по сетям');
  check('интервью: вторая сфера из шаблона', q('state.spheres[1].name'), 'Тело и движение');
  check('интервью: квота из ответа', q('state.goal'), 20);
  check('интервью: отмечено пройденным', q('state.onboarded'), true);
  check('интервью: индекс на первой сфере', q('state.sphereIndex'), 0);
  check('интервью: на главной новое имя', q("document.getElementById('sphereBadgeText').textContent"), 'Курс по сетям (сменить)');

  const saved = JSON.parse(store['flowCorePortfolioV5']);
  check('интервью: результат на диске', saved.spheres.length, 2);
  const next = makeContext(NOW + 1000, saved);
  check('интервью: второй запуск без вопросов', vm.runInContext('state.onboarded', next.ctx), true);

  const skipped = makeContext(NOW);
  const qs = expr => vm.runInContext(expr, skipped.ctx);
  qs('finishOnboarding(true);');
  check('пропуск: две нейтральные сферы', qs('state.spheres.length'), 2);
  check('пропуск: дело и отдых', qs('state.spheres.map(s => s.name).join()'), 'Своё дело,Отдых и тишина');
  check('пропуск: у отдыха свои задачи', qs('state.spheres[1].tasks.micro'), qs("t('tpl.rest.micro')"));
  check('пропуск: квота по умолчанию', qs('state.goal'), 12);

  const legacy = makeContext(NOW, {
    version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 4, goal: 12,
    logs: [{ id: 1, ts: NOW, time: '24.10 12:00', kind: 'k', text: 'старое', pts: 4 }], weeks: [],
  });
  check('старые данные: интервью не всплывает', vm.runInContext('state.onboarded', legacy.ctx), true);
  check('старые данные: дефолтные сферы сохранены', vm.runInContext('spheresOf()[0].name', legacy.ctx), 'Код и учеба');

  // Новый профиль не должен нести в себе русский текст из кода: до конца
  // интервью он виден за модалкой, а после пропуска остаётся насовсем
  const en = makeContext(NOW, undefined, 'en');
  const qe = expr => vm.runInContext(expr, en.ctx);
  check('старт: английский профиль начинает по-английски', qe('spheresOf()[0].name'), 'My own thing');
  check('старт: и отдых тоже по-английски', qe('spheresOf()[1].name'), 'Rest and quiet');
  check('старт: в стартовом наборе нет кириллицы', qe('/[а-яёіїєґ]/i.test(JSON.stringify(spheresOf()))'), false);
  check('старт: и задачи из словаря', qe('spheresOf()[0].tasks.micro'), qe("t('tpl.own.micro')"));
  const de = makeContext(NOW, undefined, 'de');
  check('старт: немецкий профиль — по-немецки', vm.runInContext('spheresOf()[0].name', de.ctx), 'Meine eigene Sache');
  // Смена языка до конца интервью пересобирает стартовый набор
  const sw = makeContext(NOW, undefined, 'en');
  check('старт: смена языка пересобирает набор', vm.runInContext("uiLang = 'de'; starterSpheres()[0].name", sw.ctx), 'Meine eigene Sache');
  // Старый профиль без сфер получает прежний набор: миграция не переводится
  const legacyNoSpheres = makeContext(NOW, { version: 6, points: 0, goal: 12, logs: [], weeks: [], onboarded: true }, 'en');
  check('старт: старый профиль без сфер не переводим', vm.runInContext('spheresOf()[0].name', legacyNoSpheres.ctx), 'Код и учеба');
  check('старт: и остальных двух не теряет', vm.runInContext('spheresOf().length', legacyNoSpheres.ctx), 3);
}

// --- 24. Скин на первой отрисовке (скрипт в шапке, до загрузки приложения) ---
{
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  const early = blocks.find(b => b.includes('earlySkin'));
  check('ранний скин: скрипт найден в шапке', typeof early, 'string');
  const runEarly = skin => {
    const attrs = {};
    const ctx = {
      localStorage: { getItem: () => skin },
      document: { documentElement: { setAttribute: (name, value) => { attrs[name] = value; } } },
      Object, console,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(early, ctx);
    return attrs['data-skin'] || '';
  };
  check('ранний скин: изумруд не навязывается', runEarly('emerald'), '');
  check('ранний скин: янтарь ставится до загрузки', runEarly('amber'), 'amber');
  check('ранний скин: кибер ставится до загрузки', runEarly('cyber'), 'cyber');
  check('ранний скин: аврора ставится до загрузки', runEarly('aurora'), 'aurora');
  check('ранний скин: старое имя ice ведёт в кибер', runEarly('ice'), 'cyber');
  check('ранний скин: мусор не ломает шапку', runEarly('constructor'), '');
}

// --- 25. Словарь: четыре языка, ключи на месте, склонения ---
{
  const { ctx } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  const keys = q('Object.keys(STRINGS)');
  check('словарь: строк собралось много', keys.length > 100, true);
  check('словарь: у каждой строки четыре языка', q('Object.keys(STRINGS).filter(k => !Array.isArray(STRINGS[k]) || STRINGS[k].length !== 4)'), []);
  check('словарь: ни одной пустой ячейки', q('Object.keys(STRINGS).filter(k => STRINGS[k].some(v => v === undefined || v === null || v === \'\'))'), []);

  // Любая строка интерфейса должна существовать в словаре: иначе человек
  // увидит сырой ключ вроде nav.focus вместо кнопки.
  const fromMarkup = [...html.matchAll(/data-i18n(?:-ph|-title|-aria)?="([^"]+)"/g)].map(m => m[1]);
  const fromCalls = [...src.matchAll(/\b(?:t|translate)\('([a-zA-Z0-9.]+)'/g)].map(m => m[1]);
  const referenced = [...new Set(fromMarkup.concat(fromCalls))];
  const missing = referenced.filter(key => q(`Object.prototype.hasOwnProperty.call(STRINGS, ${JSON.stringify(key)})`) !== true);
  check('словарь: все ключи из разметки и кода есть', missing, []);

  // Ключи скинов и режимов берутся из карт, а не из литералов в вызове t(),
  // поэтому проверяем сами карты — иначе опечатка в них пройдёт мимо сканера.
  const mapped = q('Object.values(SKIN_KEYS).concat(Object.values(SPHERE_MODE_KEYS))');
  const missingMapped = mapped.filter(key => q(`Object.prototype.hasOwnProperty.call(STRINGS, ${JSON.stringify(key)})`) !== true);
  check('словарь: ключи из карт скинов и режимов есть', missingMapped, []);
  check('словарь: карта скинов покрывает весь набор', q('Object.keys(SKIN_KEYS).join()'), q('Object.keys(SKINS).join()'));
  check('словарь: карта режимов покрывает все три', q('Object.keys(SPHERE_MODE_KEYS).join()'), 'micro,draft,wave');

  check('склонение ru: одна отметка', q("t('word.mark', { n: 1 })"), '1 отметка');
  check('склонение ru: три отметки', q("t('word.mark', { n: 3 })"), '3 отметки');
  check('склонение ru: пять отметок', q("t('word.mark', { n: 5 })"), '5 отметок');
  check('перевод на немецкий', q("uiLang = 'de'; t('word.mark', { n: 5 })"), '5 Notizen');
  check('немецкий: единственное число', q("t('word.mark', { n: 1 })"), '1 Notiz');
  check('английский: склонение', q("uiLang = 'en'; t('word.mark', { n: 3 })"), '3 notes');
  check('украинский: два заряда', q("uiLang = 'uk'; t('rest.line', { n: 2 })"), '⚡ Відпочинок: 2 заряди — +1 до наступних кроків');
  check('неизвестный ключ возвращает себя', q("uiLang = 'de'; t('no.such.key')"), 'no.such.key');
  check('язык можно вернуть назад', q("uiLang = 'ru'; t('nav.focus')"), 'Фокус');
}

// --- 27. Дыхание: две методики, фазы, шум ---
{
  const { ctx, store } = makeContext(NOW);
  const q = expr => vm.runInContext(expr, ctx);
  check('дыхание: две методики', q('BREATHE_MODES.length'), 2);
  check('дыхание: выдох — минута', q('BREATHE_PROTOCOLS.exhale.totalMs'), 60000);
  check('дыхание: вздох — пять минут', q('BREATHE_PROTOCOLS.sigh.totalMs'), 300000);
  // Сумма фаз обязана совпасть с циклом: иначе фазы поедут по кругу
  check('дыхание: фазы выдоха складываются в цикл', q('BREATHE_PROTOCOLS.exhale.phases.reduce((s, p) => s + p.ms, 0)'), q('BREATHE_PROTOCOLS.exhale.cycleMs'));
  check('дыхание: фазы вздоха складываются в цикл', q('BREATHE_PROTOCOLS.sigh.phases.reduce((s, p) => s + p.ms, 0)'), q('BREATHE_PROTOCOLS.sigh.cycleMs'));
  // Ключи методик — картой, поэтому проверяем сами ключи
  const modeKeys = q('Object.values(BREATHE_MODE_KEYS)');
  const missingModes = modeKeys.filter(key => q(`Object.prototype.hasOwnProperty.call(STRINGS, ${JSON.stringify(key)})`) !== true);
  check('словарь: ключи методик дыхания есть', missingModes, []);
  check('словарь: карта методик покрывает весь набор', q('Object.keys(BREATHE_MODE_KEYS).join()'), q('BREATHE_MODES.join()'));
  // Подсказка, запись и подписи фаз живут в самих методиках — сканер их не видит
  const phaseKeys = q('BREATHE_MODES.map(key => BREATHE_PROTOCOLS[key]).reduce((out, proto) => out.concat([proto.guide, proto.hint, proto.log], proto.phases.map(p => p.label)), [])');
  const missingPhase = phaseKeys.filter(key => q(`Object.prototype.hasOwnProperty.call(STRINGS, ${JSON.stringify(key)})`) !== true);
  check('словарь: ключи фаз и подсказок дыхания есть', missingPhase, []);
  // Подсказка над орбом принадлежит методике: «6 спокойных циклов» над
  // пятиминутным вздохом — обещание чужого протокола
  check('дыхание: у каждой методики своя подсказка', q('BREATHE_PROTOCOLS.exhale.hint !== BREATHE_PROTOCOLS.sigh.hint'), true);

  check('дыхание: методика по умолчанию', q('state.breatheMode'), 'exhale');
  check('дыхание: на старте часовая подсказка', q("document.getElementById('breatheGuideText').textContent"), q("t('breathe.guide')"));
  check('дыхание: время в мм:сс', q('formatClock(60000)'), '1:00');
  check('дыхание: меньше минуты', q('formatClock(5000)'), '0:05');
  check('дыхание: пять минут без потери секунд', q('formatClock(299000)'), '4:59');

  q("setBreatheMode('sigh');");
  check('дыхание: методика запомнилась', q('state.breatheMode'), 'sigh');
  check('дыхание: орб пересчитан на пять минут', q("document.getElementById('breatheSecondsText').textContent"), '5:00');
  check('дыхание: подсказка сменилась', q("document.getElementById('breatheGuideText').textContent"), q("t('breathe.guide.sigh')"));
  check('дыхание: текст над орбом тоже из методики', q("document.getElementById('breatheHint').textContent"), q("t('breathe.hint.sigh')"));
  check('дыхание: первая фаза вздоха', q('breathePhaseKey(0)'), 'breathe.sigh.in');
  check('дыхание: добор воздуха', q('breathePhaseKey(2500)'), 'breathe.sigh.top');
  check('дыхание: длинный выдох ртом', q('breathePhaseKey(5000)'), 'breathe.sigh.out');
  check('дыхание: цикл повторяется', q('breathePhaseKey(11500)'), 'breathe.sigh.in');
  q('toggleBreathe();');
  check('дыхание: старт идёт на пять минут', q('breatheTimer.totalMs'), 300000);
  check('дыхание: отсчёт идёт', q('breatheTimer.running'), true);
  q('toggleBreathe();');
  check('дыхание: стоп сохраняет длину', q('breatheTimer.totalMs'), 300000);
  check('дыхание: мусорная методика откатывается', q('normalizeBreatheMode("нет-такой")'), 'exhale');

  const saved = JSON.parse(store['flowCorePortfolioV5']);
  check('дыхание: методика легла в состояние', saved.breatheMode, 'sigh');
  const next = makeContext(NOW + 1000, saved);
  check('дыхание: методика пережила перезагрузку', vm.runInContext('state.breatheMode', next.ctx), 'sigh');
  const legacy = makeContext(NOW, { version: 6, weekKey: '2026-W43', weekStart: '2026-10-19', points: 0, goal: 12, logs: [], weeks: [] });
  check('дыхание: старые данные получают базовую методику', vm.runInContext('state.breatheMode', legacy.ctx), 'exhale');
  check('дыхание: мусор в поле откатывается', vm.runInContext('normalizeBreatheMode("sighhh")', legacy.ctx), 'exhale');

  // Без Web Audio шум просто не включается — без падения и без узлов
  check('шум: без AudioContext не стартует', q('startBrownNoise()'), false);
  check('шум: узел не создан', q('Boolean(noiseNodes)'), false);
  q('toggleBrownNoise();');
  check('шум: переключатель молчит без узлов', q('Boolean(noiseNodes)'), false);
  q('setNoiseVolume(100);');
  check('шум: громкость сверху ограничена', q('noiseVolume'), 0.4);
  q('setNoiseVolume(-50);');
  check('шум: ниже нуля не уходит', q('noiseVolume'), 0);
  q('setNoiseVolume(40);');
  check('шум: сорок процентов — тихий фон', q('noiseVolume'), 0.16);
  // Заглушка Web Audio: проверяем и включение, и то, что общий выключатель сильнее
  class FakeAudioContext {
    constructor() { this.sampleRate = 100; this.state = 'running'; this.destination = {}; }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { loop: false, buffer: null, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
  }
  ctx.AudioContext = FakeAudioContext;
  check('шум: с AudioContext включается', q('startBrownNoise()'), true);
  check('шум: узел появился', q('Boolean(noiseNodes)'), true);
  check('шум: громкость дошла до узла', q('noiseNodes.gain.gain.value'), 0.16);
  q('setNoiseVolume(100);');
  check('шум: ползунок меняет громкость на ходу', q('noiseNodes.gain.gain.value'), 0.4);
  q('stopBrownNoise();');
  check('шум: стоп убирает узел', q('Boolean(noiseNodes)'), false);

  q('state.soundEnabled = false;');
  q('toggleBrownNoise();');
  check('шум: общий выключатель звука сильнее', q('Boolean(noiseNodes)'), false);
  check('шум: и он об этом говорит', q("document.getElementById('flashToast').textContent"), q("t('breathe.noise.muted')"));
  q('state.soundEnabled = true;');
  q('toggleBrownNoise();');
  check('шум: после возврата звука включается снова', q('Boolean(noiseNodes)'), true);
  q("showSection('main');");
  check('шум: уход с экрана дыхания глушит его', q('Boolean(noiseNodes)'), false);
}

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` (got ${r.actual}, want ${r.expected})`}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
