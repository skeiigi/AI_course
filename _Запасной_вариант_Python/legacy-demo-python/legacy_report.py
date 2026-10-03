# -*- coding: utf-8 -*-
# otchet po zakazam
# pravil: A.K. 2019, potom M.S. 2021, potom nikto
# ne trogat', rabotaet

import csv
import os
import sys

TAX = 0.2
LIMIT = 1000
EXTRA = 5
MAXD = 25
TOPN = 5
W = 60

TOTALS = {}
MONTHS = {}
DISCOUNTS = {}
LINES = []
WARNINGS = []
ROWS = 0
BAD = 0
CANCELLED = 0
REFUNDS = [0, 0.0]
EXPORTED = 0

NAMES = {
    "electronics": "Электроника",
    "books": "Книги",
    "clothing": "Одежда",
    "home": "Дом и сад",
    "sports": "Спорт",
}

CODES = {"NONE": 0, "SALE5": 5, "SALE10": 10, "SALE15": 15, "VIP20": 20}

FILE = "orders.csv"
if len(sys.argv) > 1:
    FILE = sys.argv[1]


def warn(msg):
    global WARNINGS
    WARNINGS.append(msg)
    print("WARN: " + msg)


def process_everything():
    global ROWS, BAD, CANCELLED, TOTALS, MONTHS, DISCOUNTS, LINES, REFUNDS

    try:
        os.mkdir("out")
    except:
        pass

    f = open(FILE)
    r = csv.reader(f)
    head = next(r)
    if len(head) != 10:
        warn("strannyy zagolovok: " + str(len(head)))

    for row in r:
        ROWS = ROWS + 1
        if len(row) < 10:
            BAD = BAD + 1
            warn("korotkaya stroka nomer " + str(ROWS))
            continue

        oid = row[0]
        d = row[1]
        cat = row[3].strip()
        item = row[4].strip()
        code = row[7].strip()
        st = row[8].strip()

        try:
            q = int(row[5])
            p = float(row[6])
        except Exception:
            BAD = BAD + 1
            warn("ne chislo v zakaze " + oid)
            continue

        if q < 0:
            BAD = BAD + 1
            warn("otricatelnoe kolichestvo v zakaze " + oid)
            continue

        mon = "0000-00"
        try:
            parts = d.split("-")
            if int(parts[1]) >= 1 and int(parts[1]) <= 12 and int(parts[2]) <= 31:
                mon = parts[0] + "-" + parts[1]
        except:
            pass

        LINES.append((cat, item, q, p, code, st, mon))

        if st == "C":
            CANCELLED = CANCELLED + 1
            continue

        amount = round(q * p, 2)
        pct = CODES.get(code, 0)
        if amount > LIMIT:
            pct = pct + EXTRA
        if pct > MAXD:
            pct = MAXD
        if st == "R":
            amount = -amount
            pct = 0

        disc = int(amount * pct) / 100.0
        net = round(amount - disc, 2)
        tax = round(net * TAX, 2)
        tot = round(net + tax, 2)

        if cat not in TOTALS:
            TOTALS[cat] = [0, 0.0, 0.0, 0.0, 0.0]
        TOTALS[cat][0] = TOTALS[cat][0] + 1
        TOTALS[cat][1] = round(TOTALS[cat][1] + amount, 2)
        TOTALS[cat][2] = round(TOTALS[cat][2] + disc, 2)
        TOTALS[cat][3] = round(TOTALS[cat][3] + tax, 2)
        TOTALS[cat][4] = round(TOTALS[cat][4] + tot, 2)

        if mon not in MONTHS:
            MONTHS[mon] = [0, 0.0]
        MONTHS[mon][0] = MONTHS[mon][0] + 1
        MONTHS[mon][1] = round(MONTHS[mon][1] + tot, 2)

        if code not in DISCOUNTS:
            DISCOUNTS[code] = [0, 0.0]
        DISCOUNTS[code][0] = DISCOUNTS[code][0] + 1
        DISCOUNTS[code][1] = round(DISCOUNTS[code][1] + disc, 2)

        if st == "R":
            REFUNDS[0] = REFUNDS[0] + 1
            REFUNDS[1] = round(REFUNDS[1] + tot, 2)

    f.close()

    out = []
    out.append("=" * W)
    out.append("ОТЧЕТ ПО ЗАКАЗАМ ИНТЕРНЕТ-МАГАЗИНА")
    out.append("=" * W)
    out.append("Файл: " + FILE)
    out.append("Строк в файле: " + str(ROWS))
    out.append("Учтено заказов: " + str(ROWS - BAD - CANCELLED))
    out.append("Отменённых: " + str(CANCELLED))
    out.append("Пропущено из-за ошибок в данных: " + str(BAD))
    out.append("")
    out.append("-" * W)
    out.append("ВЫРУЧКА ПО КАТЕГОРИЯМ")
    out.append("-" * W)
    out.append("%-16s %5s %10s %8s %9s %10s %6s"
               % ("Категория", "Зак.", "Сумма", "Скидки", "Налог", "Итого", "Доля"))

    grand = 0.0
    for k in TOTALS:
        grand = grand + TOTALS[k][4]
    grand = round(grand, 2)
    if grand == 0:
        grand = 1

    keys = sorted(TOTALS.keys(), key=lambda x: (-TOTALS[x][4], x))
    c1 = 0
    s1 = 0.0
    d1 = 0.0
    t1 = 0.0
    v1 = 0.0
    for k in keys:
        v = TOTALS[k]
        if k == "":
            nm = "БЕЗ КАТЕГОРИИ"
        else:
            nm = NAMES.get(k, k)
        share = round(v[4] / grand * 100, 1)
        out.append("%-16s %5d %10.2f %8.2f %9.2f %10.2f %5s%%"
                   % (nm[:16], v[0], v[1], v[2], v[3], v[4], share))
        c1 = c1 + v[0]
        s1 = round(s1 + v[1], 2)
        d1 = round(d1 + v[2], 2)
        t1 = round(t1 + v[3], 2)
        v1 = round(v1 + v[4], 2)
    out.append("-" * W)
    out.append("%-16s %5d %10.2f %8.2f %9.2f %10.2f %5s%%"
               % ("ИТОГО", c1, s1, d1, t1, v1, "100.0"))
    out.append("")
    out.append("-" * W)
    out.append("ВЫРУЧКА ПО МЕСЯЦАМ")
    out.append("-" * W)
    for k in sorted(MONTHS.keys()):
        v = MONTHS[k]
        out.append("%-10s %5d заказов %14.2f" % (k, v[0], v[1]))
    out.append("")
    out.append("-" * W)
    out.append("ТОП-%d ТОВАРОВ (без скидок и налога)" % TOPN)
    out.append("-" * W)
    n = 1
    for name, val in top_items():
        out.append("%2d. %-30s %14.2f" % (n, name[:30], val))
        n = n + 1
    out.append("")
    out.append("-" * W)
    out.append("ПРИМЕНЕНИЕ СКИДОК")
    out.append("-" * W)
    for k in sorted(DISCOUNTS.keys()):
        v = DISCOUNTS[k]
        out.append("%-10s %5d заказов, скидок на %10.2f" % (k, v[0], v[1]))
    out.append("")
    out.append("-" * W)
    out.append("ВОЗВРАТЫ")
    out.append("-" * W)
    out.append("Возвратов: %d, на сумму %.2f" % (REFUNDS[0], REFUNDS[1]))
    out.append("")
    out.append("=" * W)
    out.append("Предупреждений: %d" % len(WARNINGS))
    out.append("=" * W)

    text = "\n".join(out) + "\n"
    print(text)
    g = open(os.path.join("out", "report.txt"), "w", encoding="utf-8")
    g.write(text)
    g.close()
    return text


def top_items():
    res = {}
    for l in LINES:
        if l[5] == "C":
            continue
        a = round(l[2] * l[3], 2)
        if l[5] == "R":
            a = -a
        if l[1] in res:
            res[l[1]] = round(res[l[1]] + a, 2)
        else:
            res[l[1]] = a
    pairs = sorted(res.items(), key=lambda x: (-x[1], x[0]))
    return pairs[:TOPN]


def export_csv():
    global EXPORTED
    acc = {}
    for l in LINES:
        st = l[5]
        if st == "C":
            continue
        a = round(l[2] * l[3], 2)
        pc = CODES.get(l[4], 0)
        if a > 1000:
            pc = pc + 5
        if pc > 25:
            pc = 25
        if st == "R":
            a = -a
            pc = 0
        dd = int(a * pc) / 100.0
        nn = round(a - dd, 2)
        tt = round(nn * 0.2, 2)
        total = round(nn + tt, 2)
        key = (l[0], l[6])
        if key not in acc:
            acc[key] = [0, 0.0, 0.0, 0.0, 0.0]
        acc[key][0] = acc[key][0] + 1
        acc[key][1] = round(acc[key][1] + a, 2)
        acc[key][2] = round(acc[key][2] + dd, 2)
        acc[key][3] = round(acc[key][3] + tt, 2)
        acc[key][4] = round(acc[key][4] + total, 2)

    try:
        os.mkdir("out")
    except:
        pass

    h = open(os.path.join("out", "revenue.csv"), "w", newline="", encoding="utf-8")
    w = csv.writer(h, lineterminator="\n")
    w.writerow(["category", "month", "orders", "gross", "discount", "tax", "total"])
    for key in sorted(acc.keys()):
        v = acc[key]
        w.writerow([key[0], key[1], v[0],
                    "%.2f" % v[1], "%.2f" % v[2], "%.2f" % v[3], "%.2f" % v[4]])
        EXPORTED = EXPORTED + 1
    h.close()
    print("Выгружено строк в out/revenue.csv: " + str(EXPORTED))


process_everything()
export_csv()
