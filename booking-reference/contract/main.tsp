// Контракт сервиса бронирования тайм-слотов.
// Это первый файл проекта: сначала описываем API, потом пишем код.
// Из этого файла компилятор TypeSpec собирает openapi.yaml.
//
// Порядок работы Design First описан в AGENTS.md, раздел 6.
// Править openapi.yaml руками нельзя: он собирается из этого файла.

import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

/** Учебный сервис бронирования по типу Calendly. Курс «ИИ для разработчиков», СФУ. */
@service(#{ title: "Сервис бронирования тайм-слотов" })
@info(#{ version: "1.0.0" })
namespace BookingService;

// ---------------------------------------------------------------------------
// Ошибки
// ---------------------------------------------------------------------------

/** Машиночитаемый код ошибки. Клиент опирается на код, человек читает message. */
union ErrorCode {
  /** Тело запроса или параметры не прошли проверку. */
  validation_failed: "validation_failed",

  /** Вид активности с таким идентификатором не найден. */
  activity_not_found: "activity_not_found",

  /** Бронь с таким идентификатором не найдена. */
  booking_not_found: "booking_not_found",

  /** В сетке расписания нет слота с таким началом. */
  slot_not_found: "slot_not_found",

  /** На этот слот уже есть действующая бронь. */
  slot_taken: "slot_taken",

  /** Время начала слота уже прошло в часовом поясе сервиса. */
  slot_in_past: "slot_in_past",

  /** Бронь уже была отменена раньше. */
  booking_already_cancelled: "booking_already_cancelled",

  /** Начало рабочего окна не раньше его конца. */
  invalid_time_window: "invalid_time_window",

  /** Диапазон дат пустой или слишком длинный. */
  invalid_date_range: "invalid_date_range",

  /** Переписка по этой брони уже закрыта. */
  chat_closed: "chat_closed",
}

/** Общее тело ответа при любой ошибке сервиса. */
model ErrorBody {
  /** Код ошибки для кода клиента. */
  code: ErrorCode;

  /** Сообщение на русском языке для показа пользователю. */
  message: string;
}

/** Запрошенный объект не найден. */
@error
model NotFoundError {
  @statusCode statusCode: 404;
  ...ErrorBody;
}

/** Действие противоречит текущему состоянию данных. */
@error
model ConflictError {
  @statusCode statusCode: 409;
  ...ErrorBody;
}

/** Данные синтаксически верны, но нарушают правила предметной области. */
@error
model ValidationError {
  @statusCode statusCode: 422;
  ...ErrorBody;
}

// ---------------------------------------------------------------------------
// Вид активности
// ---------------------------------------------------------------------------

/** Вид активности: то, на что записывается гость. */
model Activity {
  /** Идентификатор активности. */
  id: int32;

  /** Название, например «Консультация». */
  @minLength(1)
  @maxLength(100)
  name: string;

  /** Длительность одной встречи в минутах. */
  @minValue(5)
  @maxValue(480)
  duration_minutes: int32;

  /** Описание для гостя. */
  @maxLength(500)
  description: string;

  /** Место проведения или ссылка на видеовстречу. Необязательное. */
  @maxLength(200)
  location?: string = "";

  /** Цвет карточки в интерфейсе, шестнадцатеричный код вида #3b5bdb. */
  @pattern("^#[0-9a-fA-F]{6}$")
  color: string;
}

/** Данные для создания активности. */
model ActivityCreate {
  @minLength(1)
  @maxLength(100)
  name: string;

  @minValue(5)
  @maxValue(480)
  duration_minutes: int32;

  @maxLength(500)
  description?: string = "";

  @maxLength(200)
  location?: string = "";

  @pattern("^#[0-9a-fA-F]{6}$")
  color?: string = "#3b5bdb";
}

// ---------------------------------------------------------------------------
// Расписание
// ---------------------------------------------------------------------------

/** Расписание: в какие дни и часы доступна активность. */
model Schedule {
  /** Идентификатор расписания. */
  id: int32;

  /** Активность, к которой относится расписание. */
  activity_id: int32;

  /** Дни недели: 1 это понедельник, 7 это воскресенье. */
  @minItems(1)
  @maxItems(7)
  weekdays: int32[];

  /** Начало рабочего окна, формат HH:MM:SS. */
  start_time: plainTime;

  /** Конец рабочего окна, формат HH:MM:SS. */
  end_time: plainTime;

  /** Шаг сетки слотов в минутах. */
  @minValue(5)
  @maxValue(480)
  step_minutes: int32;
}

/** Данные для создания расписания. */
model ScheduleCreate {
  activity_id: int32;

  @minItems(1)
  @maxItems(7)
  weekdays: int32[];

  start_time: plainTime;
  end_time: plainTime;

  @minValue(5)
  @maxValue(480)
  step_minutes: int32;
}

// ---------------------------------------------------------------------------
// Тайм-слот
// ---------------------------------------------------------------------------

/** Тайм-слот. В базе не хранится, вычисляется из расписания на дату. */
model Slot {
  /** Активность, к которой относится слот. */
  activity_id: int32;

  /** Расписание, из которого получен слот. */
  schedule_id: int32;

  /** Дата слота, формат YYYY-MM-DD. */
  date: plainDate;

  /** Начало слота. */
  start_time: plainTime;

  /** Конец слота, равен началу плюс длительность активности. */
  end_time: plainTime;

  /** Свободен ли слот. Занятый слот забронировать нельзя. */
  is_free: boolean;
}

// ---------------------------------------------------------------------------
// Бронь
// ---------------------------------------------------------------------------

/** Статус брони. */
union BookingStatus {
  /** Бронь действует и занимает слот. */
  active: "active",

  /** Бронь отменена, слот снова свободен. */
  cancelled: "cancelled",
}

/** Бронь гостя на конкретный слот. */
model Booking {
  /** Идентификатор брони. */
  id: int32;

  /** Активность. */
  activity_id: int32;

  /** Название активности на момент запроса, чтобы клиенту хватило одного запроса. */
  activity_name: string;

  /** Дата слота. */
  date: plainDate;

  /** Начало слота. */
  start_time: plainTime;

  /** Конец слота. */
  end_time: plainTime;

  /** Имя гостя. */
  @minLength(1)
  @maxLength(100)
  guest_name: string;

  /** Контактная почта гостя. Доступ к брони даёт отдельный секрет. */
  @format("email")
  guest_email: string;

  /** Статус брони. */
  status: BookingStatus;

  /** Момент создания брони в UTC. */
  created_at: utcDateTime;
}

/** Результат создания. Секрет выдаётся один раз и нужен для просмотра и отмены. */
model BookingCreated {
  booking: Booking;
  @pattern("^[0-9a-f]{64}$")
  access_token: string;
}

/** Данные для создания брони. */
model BookingCreate {
  activity_id: int32;
  date: plainDate;
  start_time: plainTime;

  @minLength(1)
  @maxLength(100)
  guest_name: string;

  @format("email")
  guest_email: string;
}

/** Один слот в групповом запросе. */
model BookingSlotCreate {
  date: plainDate;
  start_time: plainTime;
}

/** Несколько броней одной активности для одного гостя. */
model BookingBatchCreate {
  activity_id: int32;
  @minItems(1)
  @maxItems(20)
  slots: BookingSlotCreate[];
  @minLength(1)
  @maxLength(100)
  guest_name: string;
  @format("email")
  guest_email: string;
}

/** Каждая бронь получает собственный секрет доступа. */
model BookingBatchCreated {
  bookings: BookingCreated[];
}

/** Сообщение участника встречи. Имя указано отправителем и не проверено. */
model BookingMessage {
  id: int32;
  booking_id: int32;
  @minLength(1)
  @maxLength(60)
  sender_name: string;
  @minLength(1)
  @maxLength(2000)
  body: string;
  created_at: utcDateTime;
}

/** Переписка и право отправить новое сообщение. */
model BookingChat {
  messages: BookingMessage[];
  can_post: boolean;
}

/** Текст нового сообщения. */
model BookingMessageCreate {
  @minLength(1)
  @maxLength(60)
  sender_name: string;
  @minLength(1)
  @maxLength(2000)
  body: string;
}

// ---------------------------------------------------------------------------
// Операции
// ---------------------------------------------------------------------------

@route("/api/activities")
@tag("activities")
namespace Activities {
  /** Список всех видов активности. */
  @get
  op list(): Activity[];

  /** Создать новый вид активности. */
  @post
  op create(@body body: ActivityCreate): {
    @statusCode statusCode: 201;
    @body activity: Activity;
  } | ValidationError;
}

@route("/api/schedules")
@tag("schedules")
namespace Schedules {
  /** Список расписаний. Можно отфильтровать по активности. */
  @get
  op list(@query activity_id?: int32): Schedule[];

  /** Создать расписание для активности. */
  @post
  op create(@body body: ScheduleCreate): {
    @statusCode statusCode: 201;
    @body schedule: Schedule;
  } | NotFoundError | ValidationError;
}

@route("/api/slots")
@tag("slots")
namespace Slots {
  /** Предстоящие свободные и занятые слоты активности на диапазон дат. */
  @get
  op list(
    @query activity_id: int32,
    @query date_from: plainDate,
    @query date_to: plainDate,
  ): Slot[] | NotFoundError | ValidationError;
}

@route("/api/bookings")
@tag("bookings")
namespace Bookings {
  /** Создать бронь на свободный слот. */
  @post
  op create(@body body: BookingCreate): {
    @statusCode statusCode: 201;
    @body result: BookingCreated;
  } | NotFoundError | ConflictError | ValidationError;

  /** Создать несколько броней атомарно: если один слот недоступен, не создаётся ни одна. */
  @route("/batch")
  @post
  op createBatch(@body body: BookingBatchCreate): {
    @statusCode statusCode: 201;
    @body result: BookingBatchCreated;
  } | NotFoundError | ConflictError | ValidationError;

  /** Просмотреть бронь по секрету, выданному при создании. */
  @route("/{booking_id}")
  @get
  op get(@path booking_id: int32, @header authorization: string): Booking | NotFoundError;

  /** Отменить бронь по секрету. После отмены слот снова свободен. */
  @route("/{booking_id}/cancel")
  @post
  op cancel(@path booking_id: int32, @header authorization: string): Booking | NotFoundError | ConflictError;

  /** Читать переписку по секрету брони. */
  @route("/{booking_id}/messages")
  @get
  op listMessages(@path booking_id: int32, @header authorization: string): BookingChat | NotFoundError;

  /** Добавить сообщение до начала действующей встречи. */
  @route("/{booking_id}/messages")
  @post
  op createMessage(
    @path booking_id: int32,
    @header authorization: string,
    @body body: BookingMessageCreate,
  ): {
    @statusCode statusCode: 201;
    @body message: BookingMessage;
  } | NotFoundError | ConflictError | ValidationError;
}
