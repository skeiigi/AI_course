// Интерфейс бронирования. Обычный JavaScript, без сборки и без библиотек.
// Файл читается сверху вниз: сначала данные, потом запросы, потом отрисовка.

"use strict";

// ---------- Данные, которые живут в памяти страницы ----------

var state = {
  activities: [],
  activityId: null,
  weekStart: startOfToday(),
  slots: [],
  pickedSlot: null
};

var WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
var MONTH_NAMES = ["янв", "фев", "мар", "апр", "мая", "июн",
                   "июл", "авг", "сен", "окт", "ноя", "дек"];
var DAYS_IN_WEEK = 7;

// ---------- Работа с датами ----------

function startOfToday() {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date, days) {
  var copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Формат YYYY-MM-DD, именно его ждёт наш API.
function toApiDate(date) {
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

function fromApiDate(text) {
  var parts = text.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// Красивая подпись даты: «5 окт».
function formatDay(date) {
  return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
}

// Понедельник это 0 в нашем массиве названий, воскресенье это 6.
function weekdayName(date) {
  return WEEKDAY_NAMES[(date.getDay() + 6) % DAYS_IN_WEEK];
}

// Время приходит как "10:30:00", показываем "10:30".
function shortTime(text) {
  return text.slice(0, 5);
}

// ---------- Запросы к API ----------

async function apiRequest(path, options) {
  var response = await fetch(path, options);
  var body = null;
  try {
    body = await response.json();
  } catch (error) {
    body = null;
  }

  if (!response.ok) {
    throw new Error(errorTextFrom(body, response.status));
  }
  return body;
}

// Сервис всегда отдаёт ошибку одним телом: {code, message}.
// Код нужен программе, сообщение показывается пользователю.
// Набор кодов описан в contract/main.tsp, союз ErrorCode.
function errorTextFrom(body, status) {
  if (body && typeof body.message === "string" && body.message.length > 0) {
    return body.message;
  }
  return "Ошибка запроса, код " + status;
}

function loadActivities() {
  return apiRequest("/api/activities");
}

function loadSlots(activityId, dateFrom, dateTo) {
  var query = "?activity_id=" + activityId + "&date_from=" + dateFrom + "&date_to=" + dateTo;
  return apiRequest("/api/slots" + query);
}

function sendJson(path, payload) {
  return apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// ---------- Сообщения пользователю ----------

function showMessage(text, kind) {
  var box = document.getElementById("message");
  box.textContent = text;
  box.className = "message message--" + kind;
  box.hidden = false;
}

function hideMessage() {
  document.getElementById("message").hidden = true;
}

// ---------- Отрисовка списка активностей ----------

function renderActivities() {
  var container = document.getElementById("activity-list");
  container.innerHTML = "";

  if (state.activities.length === 0) {
    container.innerHTML =
      '<p class="hint">Активностей пока нет. Запустите скрипт seed.py.</p>';
    return;
  }

  state.activities.forEach(function (activity) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "activity";
    if (activity.id === state.activityId) {
      button.className += " activity--picked";
    }

    var name = document.createElement("div");
    name.className = "activity__name";
    name.textContent = activity.name;

    var meta = document.createElement("div");
    meta.className = "activity__meta";
    meta.textContent = activity.duration_minutes + " мин · " + activity.description;

    button.appendChild(name);
    button.appendChild(meta);
    button.addEventListener("click", function () {
      selectActivity(activity.id);
    });
    container.appendChild(button);
  });
}

// ---------- Отрисовка сетки слотов ----------

function renderWeekRange() {
  var last = addDays(state.weekStart, DAYS_IN_WEEK - 1);
  document.getElementById("week-range").textContent =
    formatDay(state.weekStart) + " – " + formatDay(last);
}

// Раскладывает плоский список слотов по датам.
function groupSlotsByDate(slots) {
  var groups = {};
  slots.forEach(function (slot) {
    if (!groups[slot.date]) {
      groups[slot.date] = [];
    }
    groups[slot.date].push(slot);
  });
  return groups;
}

function renderSlots() {
  var grid = document.getElementById("slot-grid");
  grid.innerHTML = "";

  if (state.activityId === null) {
    grid.innerHTML = '<p class="hint">Выберите активность слева.</p>';
    return;
  }

  var groups = groupSlotsByDate(state.slots);

  for (var offset = 0; offset < DAYS_IN_WEEK; offset += 1) {
    var day = addDays(state.weekStart, offset);
    var key = toApiDate(day);
    grid.appendChild(renderDayColumn(day, groups[key] || []));
  }
}

function renderDayColumn(day, slots) {
  var column = document.createElement("div");
  column.className = slots.length === 0 ? "day day--off" : "day";

  var head = document.createElement("div");
  head.className = "day__head";
  head.innerHTML =
    '<div class="day__weekday">' + weekdayName(day) + "</div>" +
    '<div class="day__date">' + formatDay(day) + "</div>";
  column.appendChild(head);

  if (slots.length === 0) {
    var empty = document.createElement("div");
    empty.className = "day__empty";
    empty.textContent = "нет слотов";
    column.appendChild(empty);
    return column;
  }

  var list = document.createElement("div");
  list.className = "day__slots";
  slots.forEach(function (slot) {
    list.appendChild(renderSlotButton(slot));
  });
  column.appendChild(list);
  return column;
}

function renderSlotButton(slot) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "slot";
  button.textContent = shortTime(slot.start_time);

  if (!slot.is_free) {
    button.className += " slot--busy";
    button.disabled = true;
    button.title = "Слот уже занят";
    return button;
  }

  if (isPicked(slot)) {
    button.className += " slot--picked";
  }

  button.addEventListener("click", function () {
    pickSlot(slot);
  });
  return button;
}

function isPicked(slot) {
  return (
    state.pickedSlot !== null &&
    state.pickedSlot.date === slot.date &&
    state.pickedSlot.start_time === slot.start_time
  );
}

// ---------- Форма брони ----------

function renderBookingForm() {
  var hint = document.getElementById("booking-hint");
  var form = document.getElementById("booking-form");

  if (state.pickedSlot === null) {
    hint.hidden = false;
    form.hidden = true;
    return;
  }

  var day = fromApiDate(state.pickedSlot.date);
  document.getElementById("chosen-slot").textContent =
    weekdayName(day) + ", " + formatDay(day) + ", " +
    shortTime(state.pickedSlot.start_time) + " – " + shortTime(state.pickedSlot.end_time);

  hint.hidden = true;
  form.hidden = false;
}

// ---------- Список своих броней ----------

function renderBookings(bookings) {
  var list = document.getElementById("booking-list");
  list.innerHTML = "";

  if (bookings.length === 0) {
    list.innerHTML = '<li class="hint">Броней по этой почте нет.</li>';
    return;
  }

  bookings.forEach(function (booking) {
    list.appendChild(renderBookingItem(booking));
  });
}

function renderBookingItem(booking) {
  var item = document.createElement("li");
  item.className = "booking";

  var day = fromApiDate(booking.date);
  var when = document.createElement("div");
  when.className = "booking__when";
  when.textContent =
    weekdayName(day) + ", " + formatDay(day) + ", " +
    shortTime(booking.start_time) + " – " + shortTime(booking.end_time);

  var meta = document.createElement("div");
  meta.className = "booking__meta";
  meta.textContent = activityName(booking.activity_id) + " · " + booking.guest_name;

  var status = document.createElement("span");
  status.className = "booking__status";
  if (booking.status === "cancelled") {
    status.className += " booking__status--cancelled";
    status.textContent = "отменена";
  } else {
    status.textContent = "действует";
  }

  item.appendChild(when);
  item.appendChild(meta);
  item.appendChild(status);

  if (booking.status === "active") {
    var cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "button button--ghost booking__cancel";
    cancelButton.textContent = "Отменить";
    cancelButton.addEventListener("click", function () {
      cancelBooking(booking.id);
    });
    item.appendChild(document.createElement("div")).appendChild(cancelButton);
  }

  return item;
}

function activityName(activityId) {
  for (var i = 0; i < state.activities.length; i += 1) {
    if (state.activities[i].id === activityId) {
      return state.activities[i].name;
    }
  }
  return "Активность " + activityId;
}

// ---------- Действия пользователя ----------

async function refreshSlots() {
  if (state.activityId === null) {
    return;
  }
  var dateFrom = toApiDate(state.weekStart);
  var dateTo = toApiDate(addDays(state.weekStart, DAYS_IN_WEEK - 1));
  try {
    state.slots = await loadSlots(state.activityId, dateFrom, dateTo);
    renderSlots();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function selectActivity(activityId) {
  state.activityId = activityId;
  state.pickedSlot = null;
  hideMessage();
  renderActivities();
  renderBookingForm();
  refreshSlots();
}

function pickSlot(slot) {
  state.pickedSlot = slot;
  hideMessage();
  renderSlots();
  renderBookingForm();
}

function clearChoice() {
  state.pickedSlot = null;
  renderSlots();
  renderBookingForm();
}

function shiftWeek(days) {
  state.weekStart = addDays(state.weekStart, days);
  state.pickedSlot = null;
  renderWeekRange();
  renderBookingForm();
  refreshSlots();
}

async function submitBooking(event) {
  event.preventDefault();
  if (state.pickedSlot === null) {
    return;
  }

  var payload = {
    activity_id: state.activityId,
    date: state.pickedSlot.date,
    start_time: state.pickedSlot.start_time,
    guest_name: document.getElementById("guest-name").value,
    guest_email: document.getElementById("guest-email").value
  };

  try {
    await sendJson("/api/bookings", payload);
    showMessage("Бронь создана. Проверьте её в блоке «Мои брони».", "ok");
    document.getElementById("lookup-email").value = payload.guest_email;
    state.pickedSlot = null;
    renderBookingForm();
    await refreshSlots();
    await lookupBookings();
  } catch (error) {
    showMessage(error.message, "error");
    await refreshSlots();
  }
}

async function lookupBookings() {
  var email = document.getElementById("lookup-email").value;
  if (email === "") {
    return;
  }
  try {
    var bookings = await apiRequest("/api/bookings?guest_email=" + encodeURIComponent(email));
    renderBookings(bookings);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function cancelBooking(bookingId) {
  try {
    await sendJson("/api/bookings/" + bookingId + "/cancel", {});
    showMessage("Бронь отменена, слот снова свободен.", "ok");
    await refreshSlots();
    await lookupBookings();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

// ---------- Запуск ----------

async function start() {
  document.getElementById("prev-week").addEventListener("click", function () {
    shiftWeek(-DAYS_IN_WEEK);
  });
  document.getElementById("next-week").addEventListener("click", function () {
    shiftWeek(DAYS_IN_WEEK);
  });
  document.getElementById("clear-choice").addEventListener("click", clearChoice);
  document.getElementById("booking-form").addEventListener("submit", submitBooking);
  document.getElementById("lookup-form").addEventListener("submit", function (event) {
    event.preventDefault();
    lookupBookings();
  });

  renderWeekRange();

  try {
    state.activities = await loadActivities();
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  renderActivities();
  if (state.activities.length > 0) {
    selectActivity(state.activities[0].id);
  } else {
    renderSlots();
  }
}

start();
