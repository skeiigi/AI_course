# Учебное размещение в Cloud.ru Evolution

Одна виртуальная машина Ubuntu 24.04 запускает приложение и Caddy через Docker
Compose. SQLite и сертификаты HTTPS лежат в постоянных Docker-томах на диске ВМ.
Сайт рассчитан на учебные данные: удаление ВМ вместе с диском удалит и брони.

## Ресурсы Cloud.ru

1. Создайте ВМ с Ubuntu 24.04, 1 vCPU, 2 ГБ RAM и диском 20 ГБ. Добавьте
   публичный IP и вход по SSH-ключу.
2. В группе безопасности откройте входящие TCP 80 и 443 для всех. TCP 22
   разрешите только для адреса администратора. Порт 8000 наружу не открывайте.
3. Проверьте стоимость ВМ, диска и публичного IP в мастере создания и срок
   действия гранта в разделе «Контроль затрат → Гранты».

## Первый запуск

Подключитесь к ВМ по SSH и выполните:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/skeiigi/booking-reference.git
cd booking-reference
bash deploy/cloudru/prepare-host.sh
cp deploy/cloudru/.env.example deploy/cloudru/.env
```

В `deploy/cloudru/.env` замените пример IP на публичный адрес ВМ. Например,
для адреса `203.0.113.10` укажите `BOOKING_DOMAIN=203.0.113.10.sslip.io`.
Сервис [sslip.io](https://sslip.io/) разрешает такое имя в указанный IP без
покупки домена. Затем запустите:

```bash
sudo docker compose --env-file deploy/cloudru/.env -f deploy/cloudru/compose.yaml up -d --build
sudo docker compose --env-file deploy/cloudru/.env -f deploy/cloudru/compose.yaml ps
```

Caddy получает сертификат и перенаправляет HTTP на HTTPS. Сайт откроется по
`https://<публичный-IP>.sslip.io`. При первом запуске создаются демонстрационные
активности. Публичный прокси отклоняет изменения активностей и расписания;
бронирование и отмена по секретной ссылке доступны.

## Обновление и диагностика

```bash
git pull --ff-only
sudo docker compose --env-file deploy/cloudru/.env -f deploy/cloudru/compose.yaml up -d --build
sudo docker compose --env-file deploy/cloudru/.env -f deploy/cloudru/compose.yaml logs --tail=100
```

Для сохранения броней при пересоздании контейнера не запускайте `docker compose
down -v`: этот флаг удаляет том с SQLite. Диск ВМ не заменяет резервную копию.

После завершения демонстрации удалите в Cloud.ru ВМ и проверьте, не остались ли
отдельно оплачиваемые диск и публичный IP. Остановка ВМ сама по себе не прекращает
начисления за диск и IP. Следите за датой окончания гранта в разделе «Контроль
затрат → Гранты».
