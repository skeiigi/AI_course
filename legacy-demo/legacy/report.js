// otchet po zakazam internet-magazina
// pisal A.K. 2019, pravil M.S. 2021, potom nikto
// ne trogat, rabotaet

var fs = require('fs');
var path = require('path');

var TAX = 0.2;
var LIMIT = 1000;
var EXTRA = 5;
var MAXD = 25;
var TOPN = 5;
var W = 60;

var TOTALS = {};
var MONTHS = {};
var DISCOUNTS = {};
var LINES = [];
var WARNINGS = [];
var ROWS = 0;
var BAD = 0;
var CANCELLED = 0;
var REFUNDS = [0, 0];
var EXPORTED = 0;

var NAMES = {
  electronics: 'Электроника',
  books: 'Книги',
  clothing: 'Одежда',
  home: 'Дом и сад',
  sports: 'Спорт'
};

var CODES = { NONE: 0, SALE5: 5, SALE10: 10, SALE15: 15, VIP20: 20 };

var FILE = 'data/orders.csv';
if (process.argv[2]) {
  FILE = process.argv[2];
}

function warn(msg) {
  WARNINGS.push(msg);
  console.log('WARN: ' + msg);
}

function r2(x) {
  return Math.round(x * 100) / 100;
}

function left(s, n) {
  s = String(s);
  if (s.length > n) s = s.slice(0, n);
  while (s.length < n) s = s + ' ';
  return s;
}

function right(s, n) {
  s = String(s);
  while (s.length < n) s = ' ' + s;
  return s;
}

function money(x, n) {
  return right(x.toFixed(2), n);
}

function processEverything() {
  try {
    fs.mkdirSync('out');
  } catch (e) {
  }

  var text = fs.readFileSync(FILE, 'utf8');
  var all = text.split('\n');
  var head = all[0].split(',');
  if (head.length != 10) {
    warn('strannyy zagolovok: ' + head.length);
  }

  for (var i = 1; i < all.length; i++) {
    if (all[i] == '') continue;
    var row = all[i].replace('\r', '').split(',');
    ROWS = ROWS + 1;
    if (row.length < 10) {
      BAD = BAD + 1;
      warn('korotkaya stroka nomer ' + ROWS);
      continue;
    }

    var oid = row[0];
    var d = row[1];
    var cat = row[3].trim();
    var item = row[4].trim();
    var code = row[7].trim();
    var st = row[8].trim();

    var q = parseInt(row[5], 10);
    var p = parseFloat(row[6]);
    if (isNaN(q) || isNaN(p)) {
      BAD = BAD + 1;
      warn('ne chislo v zakaze ' + oid);
      continue;
    }
    if (q < 0) {
      BAD = BAD + 1;
      warn('otricatelnoe kolichestvo v zakaze ' + oid);
      continue;
    }

    var mon = '0000-00';
    var parts = d.split('-');
    if (parseInt(parts[1], 10) >= 1 && parseInt(parts[1], 10) <= 12 && parseInt(parts[2], 10) <= 31) {
      mon = parts[0] + '-' + parts[1];
    }

    LINES.push([cat, item, q, p, code, st, mon]);

    if (st == 'C') {
      CANCELLED = CANCELLED + 1;
      continue;
    }

    var amount = r2(q * p);
    var pct = CODES[code];
    if (pct === undefined) pct = 0;
    if (amount > LIMIT) pct = pct + EXTRA;
    if (pct > MAXD) pct = MAXD;
    if (st == 'R') {
      amount = -amount;
      pct = 0;
    }

    var disc = Math.floor(amount * pct) / 100;
    var net = r2(amount - disc);
    var tax = r2(net * TAX);
    var tot = r2(net + tax);

    if (!TOTALS[cat]) TOTALS[cat] = [0, 0, 0, 0, 0];
    TOTALS[cat][0] = TOTALS[cat][0] + 1;
    TOTALS[cat][1] = r2(TOTALS[cat][1] + amount);
    TOTALS[cat][2] = r2(TOTALS[cat][2] + disc);
    TOTALS[cat][3] = r2(TOTALS[cat][3] + tax);
    TOTALS[cat][4] = r2(TOTALS[cat][4] + tot);

    if (!MONTHS[mon]) MONTHS[mon] = [0, 0];
    MONTHS[mon][0] = MONTHS[mon][0] + 1;
    MONTHS[mon][1] = r2(MONTHS[mon][1] + tot);

    if (!DISCOUNTS[code]) DISCOUNTS[code] = [0, 0];
    DISCOUNTS[code][0] = DISCOUNTS[code][0] + 1;
    DISCOUNTS[code][1] = r2(DISCOUNTS[code][1] + disc);

    if (st == 'R') {
      REFUNDS[0] = REFUNDS[0] + 1;
      REFUNDS[1] = r2(REFUNDS[1] + tot);
    }
  }

  var out = [];
  out.push('='.repeat(W));
  out.push('ОТЧЕТ ПО ЗАКАЗАМ ИНТЕРНЕТ-МАГАЗИНА');
  out.push('='.repeat(W));
  out.push('Файл: ' + FILE);
  out.push('Строк в файле: ' + ROWS);
  out.push('Учтено заказов: ' + (ROWS - BAD - CANCELLED));
  out.push('Отменённых: ' + CANCELLED);
  out.push('Пропущено из-за ошибок в данных: ' + BAD);
  out.push('');
  out.push('-'.repeat(W));
  out.push('ВЫРУЧКА ПО КАТЕГОРИЯМ');
  out.push('-'.repeat(W));
  out.push(left('Категория', 16) + ' ' + right('Зак.', 5) + ' ' + right('Сумма', 10) + ' ' +
    right('Скидки', 8) + ' ' + right('Налог', 9) + ' ' + right('Итого', 10) + ' ' + right('Доля', 6));

  var grand = 0;
  for (var k in TOTALS) {
    grand = grand + TOTALS[k][4];
  }
  grand = r2(grand);
  if (grand == 0) grand = 1;

  var keys = Object.keys(TOTALS);
  keys.sort(function (a, b) {
    if (TOTALS[a][4] != TOTALS[b][4]) return TOTALS[b][4] - TOTALS[a][4];
    return a < b ? -1 : (a > b ? 1 : 0);
  });

  var c1 = 0, s1 = 0, d1 = 0, t1 = 0, v1 = 0;
  for (var j = 0; j < keys.length; j++) {
    var kk = keys[j];
    var v = TOTALS[kk];
    var nm = kk == '' ? 'БЕЗ КАТЕГОРИИ' : (NAMES[kk] || kk);
    var share = Math.round((v[4] / grand) * 1000) / 10;
    out.push(left(nm, 16) + ' ' + right(v[0], 5) + ' ' + money(v[1], 10) + ' ' + money(v[2], 8) +
      ' ' + money(v[3], 9) + ' ' + money(v[4], 10) + ' ' + right(share.toFixed(1), 5) + '%');
    c1 = c1 + v[0];
    s1 = r2(s1 + v[1]);
    d1 = r2(d1 + v[2]);
    t1 = r2(t1 + v[3]);
    v1 = r2(v1 + v[4]);
  }
  out.push('-'.repeat(W));
  out.push(left('ИТОГО', 16) + ' ' + right(c1, 5) + ' ' + money(s1, 10) + ' ' + money(d1, 8) +
    ' ' + money(t1, 9) + ' ' + money(v1, 10) + ' ' + right('100.0', 5) + '%');
  out.push('');
  out.push('-'.repeat(W));
  out.push('ВЫРУЧКА ПО МЕСЯЦАМ');
  out.push('-'.repeat(W));
  var mk = Object.keys(MONTHS);
  mk.sort();
  for (var m = 0; m < mk.length; m++) {
    out.push(left(mk[m], 10) + ' ' + right(MONTHS[mk[m]][0], 5) + ' заказов ' + money(MONTHS[mk[m]][1], 14));
  }
  out.push('');
  out.push('-'.repeat(W));
  out.push('ТОП-' + TOPN + ' ТОВАРОВ (без скидок и налога)');
  out.push('-'.repeat(W));
  var tops = topItems();
  for (var n = 0; n < tops.length; n++) {
    out.push(right(n + 1, 2) + '. ' + left(tops[n][0], 30) + ' ' + money(tops[n][1], 14));
  }
  out.push('');
  out.push('-'.repeat(W));
  out.push('ПРИМЕНЕНИЕ СКИДОК');
  out.push('-'.repeat(W));
  var dk = Object.keys(DISCOUNTS);
  dk.sort();
  for (var y = 0; y < dk.length; y++) {
    out.push(left(dk[y], 10) + ' ' + right(DISCOUNTS[dk[y]][0], 5) + ' заказов, скидок на ' +
      money(DISCOUNTS[dk[y]][1], 10));
  }
  out.push('');
  out.push('-'.repeat(W));
  out.push('ВОЗВРАТЫ');
  out.push('-'.repeat(W));
  out.push('Возвратов: ' + REFUNDS[0] + ', на сумму ' + REFUNDS[1].toFixed(2));
  out.push('');
  out.push('='.repeat(W));
  out.push('Предупреждений: ' + WARNINGS.length);
  out.push('='.repeat(W));

  var body = out.join('\n') + '\n';
  console.log(body);
  fs.writeFileSync(path.join('out', 'report.txt'), body, 'utf8');
  return body;
}

function topItems() {
  var res = {};
  for (var i = 0; i < LINES.length; i++) {
    var l = LINES[i];
    if (l[5] == 'C') continue;
    var a = r2(l[2] * l[3]);
    if (l[5] == 'R') a = -a;
    if (res[l[1]] === undefined) {
      res[l[1]] = a;
    } else {
      res[l[1]] = r2(res[l[1]] + a);
    }
  }
  var names = Object.keys(res);
  names.sort(function (a, b) {
    if (res[a] != res[b]) return res[b] - res[a];
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  var pairs = [];
  for (var j = 0; j < names.length && j < TOPN; j++) {
    pairs.push([names[j], res[names[j]]]);
  }
  return pairs;
}

function exportCsv() {
  var acc = {};
  for (var i = 0; i < LINES.length; i++) {
    var l = LINES[i];
    var st = l[5];
    if (st == 'C') continue;
    var a = r2(l[2] * l[3]);
    var pc = CODES[l[4]];
    if (pc === undefined) pc = 0;
    if (a > 1000) pc = pc + 5;
    if (pc > 25) pc = 25;
    if (st == 'R') {
      a = -a;
      pc = 0;
    }
    var dd = Math.floor(a * pc) / 100;
    var nn = r2(a - dd);
    var tt = r2(nn * 0.2);
    var total = r2(nn + tt);
    var key = l[0] + ' ' + l[6];
    if (!acc[key]) acc[key] = [0, 0, 0, 0, 0];
    acc[key][0] = acc[key][0] + 1;
    acc[key][1] = r2(acc[key][1] + a);
    acc[key][2] = r2(acc[key][2] + dd);
    acc[key][3] = r2(acc[key][3] + tt);
    acc[key][4] = r2(acc[key][4] + total);
  }

  try {
    fs.mkdirSync('out');
  } catch (e) {
  }

  var lines = ['category,month,orders,gross,discount,tax,total'];
  var ks = Object.keys(acc);
  ks.sort();
  for (var j = 0; j < ks.length; j++) {
    var v = acc[ks[j]];
    var pair = ks[j].split(' ');
    lines.push(pair[0] + ',' + pair[1] + ',' + v[0] + ',' + v[1].toFixed(2) + ',' +
      v[2].toFixed(2) + ',' + v[3].toFixed(2) + ',' + v[4].toFixed(2));
    EXPORTED = EXPORTED + 1;
  }
  fs.writeFileSync(path.join('out', 'revenue.csv'), lines.join('\n') + '\n', 'utf8');
  console.log('Выгружено строк в out/revenue.csv: ' + EXPORTED);
}

processEverything();
exportCsv();
