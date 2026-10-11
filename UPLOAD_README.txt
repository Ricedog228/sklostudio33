SKLO.STUDIO — запуск индексации для sklostudio.online

1. Загрузите обновление
Распакуйте ZIP. Загрузите build.mjs, deployment.test.mjs и START_HERE.md
в корень репозитория GitHub (main), рядом с package.json, с заменой файлов.
Нажмите Commit changes. Этот файл-инструкцию загружать не требуется.

2. Выберите основной адрес
Основной адрес: https://sklostudio.online
В Vercel → проект sklostudio33 → Settings → Domains:
- sklostudio.online должен быть подключён к Production;
- для www.sklostudio.online выберите Edit → Redirect to Another Domain,
  308 Permanent Redirect → sklostudio.online → Save.
Оба домена должны иметь статус Valid Configuration.

3. Включите индексацию в Production
Vercel → Settings → Environment Variables.
Добавьте или обновите две переменные для Production:
PUBLIC_SITE_URL = https://sklostudio.online
SITE_INDEXABLE = true
Для новых переменных можно выбрать тип Config: эти значения публичные.
Если существующая переменная сохранена как Secret, замените её значение
через Edit или Rotate. Имя переменной сохраняется прежним.
Сохраните обе переменные. Затем Deployments → последний Production
deployment → меню ⋯ → Redeploy. Дождитесь Ready.

ALLOWED_ORIGINS уже настроен для нового домена. При необходимости его
значение одной строкой:
https://sklostudio.online,https://www.sklostudio.online,https://sklostudio33-gold.vercel.app

4. Проверьте результат
Откройте https://sklostudio.online/sitemap.xml — внутри должна быть ссылка
https://sklostudio.online/.
Откройте https://sklostudio.online/robots.txt — в нём должны быть:
User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://sklostudio.online/sitemap.xml

В исходном коде главной страницы должны быть index, follow и canonical
https://sklostudio.online/. Проверьте тестовую заявку с нового домена.
Preview-развёртывания остаются закрыты от индексации. Страница политики
редактируется отдельно, остаётся с noindex и не включается в sitemap.

5. Подключите Google Search Console
Откройте https://search.google.com/search-console
Добавьте ресурс типа «Домен»: sklostudio.online (без https://, www и /).
Google покажет TXT-запись google-site-verification=...
Скопируйте её целиком. Добавьте TXT для корневого домена у текущего
DNS-провайдера: HOSTiQ, если NS остались у HOSTiQ, или Vercel, если
установлены ns1.vercel-dns.com и ns2.vercel-dns.com.
В HOSTiQ для корневого домена оставьте «Ім’я хосту» пустым; тип TXT может
называться SPF (TXT). Значение — строка Google целиком.
После применения DNS нажмите «Подтвердить» в Search Console.
Если непонятно, где добавить TXT, пришлите его значение и экран текущих NS.

6. Отправьте страницу в Google
В разделе Sitemap добавьте https://sklostudio.online/sitemap.xml.
Через «Проверка URL» проверьте https://sklostudio.online/:
запустите проверку опубликованной страницы и нажмите «Запросить индексацию».
Запрос не гарантирует включение в поиск или конкретные позиции.

Официальные инструкции:
https://vercel.com/docs/environment-variables/managing-environment-variables
https://support.google.com/webmasters/answer/9008080?hl=ru
https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl?hl=ru
