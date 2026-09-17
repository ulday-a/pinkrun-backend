const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const TEST_KEY = process.env.TEST_ADMIN_KEY || 'pinkrun-test';

/* =========================================================
   ПРОВЕРКА АДМИН-КЛЮЧА
   ========================================================= */

function checkAdminKey(req, res, next) {
  const key =
    req.query.key ||
    req.body?.key ||
    req.get('X-Admin-Key');

  if (key !== TEST_KEY) {
    return res.status(403).send('Доступ запрещён');
  }

  next();
}


/* =========================================================
   АДМИН-СТРАНИЦА
   ========================================================= */

router.get('/admin-test', checkAdminKey, async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        id,
        participant_number,
        first_name,
        last_name,
        birth_date,
        gender,
        email,
        emergency_phone,
        phone,
        distance,
        price,
        status,
        payment_id,
        receipt_filename,
        receipt_uploaded_at,
        created_at,
        cancelled_at
      FROM participants
      ORDER BY id DESC
    `);

    const rows = result.rows.map(p => {

      let statusText = 'Неизвестный статус';
      let statusClass = 'pending';

      if (p.status === 'pending_payment') {
        statusText = 'Ожидает оплаты';
        statusClass = 'pending';
      }

      if (p.status === 'payment_review') {
        statusText = 'Оплата на проверке';
        statusClass = 'review';
      }

      if (p.status === 'paid') {
        statusText = 'Оплачено';
        statusClass = 'paid';
      }

      if (p.status === 'rejected') {
        statusText = 'Отклонено';
        statusClass = 'rejected';
      }

      if (p.status === 'cancelled') {
        statusText = 'Отменено';
        statusClass = 'cancelled';
      }


      /* Кнопки подтвердить / отклонить
         показываем только когда чек отправлен */

      const statusActions =
        p.status === 'payment_review'
          ? `
            <button
              class="btn approve"
              onclick="changeStatus(${p.id}, 'paid')">
              Подтвердить
            </button>

            <button
              class="btn reject"
              onclick="changeStatus(${p.id}, 'rejected')">
              Отклонить
            </button>
          `
          : '';


      const actions = `
        ${statusActions}

        <button
          class="btn delete"
          onclick="deleteParticipant(
            ${p.id},
            '${escapeHtml(p.participant_number || '')}'
          )">
          Удалить
        </button>
      `;


      const receipt = p.receipt_filename
        ? `
          <a
            class="receipt"
            target="_blank"
            href="/api/payment-claim/${p.id}/receipt?key=${encodeURIComponent(TEST_KEY)}">
            Открыть чек
          </a>
        `
        : `<span class="no-receipt">Нет чека</span>`;


      return `
        <tr>

          <td>
            <strong>${escapeHtml(p.participant_number || '')}</strong>
          </td>

          <td class="fio">
            ${escapeHtml(p.last_name || '')}
            ${escapeHtml(p.first_name || '')}
          </td>

          <td>
            ${formatDateOnly(p.birth_date)}
          </td>

          <td>
            ${formatGender(p.gender)}
          </td>

          <td>
            <a class="contact-link"
               href="mailto:${escapeHtml(p.email || '')}">
              ${escapeHtml(p.email || '')}
            </a>
          </td>

          <td>
            ${escapeHtml(p.phone || '')}
          </td>

          <td>
            ${escapeHtml(p.emergency_phone || '')}
          </td>

          <td>
            ${escapeHtml(p.distance || '')}
          </td>

          <td>
            ${formatPrice(p.price)}
          </td>

          <td>
            ${formatDateTime(p.created_at)}
          </td>

          <td>
            <span class="status ${statusClass}">
              ${statusText}
            </span>
          </td>

          <td>
            ${receipt}
          </td>

          <td class="actions">
            ${actions}
          </td>

        </tr>
      `;

    }).join('');


    res.send(`
<!DOCTYPE html>
<html lang="ru">

<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Pink Run — Участники</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #faf8f9;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
  color: #171219;
}

.container {
  max-width: 100%;
  margin: 0 auto;
  padding: 32px 24px;
}

.header {
  margin-bottom: 24px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.header h1 {
  margin: 0 0 8px;
  font-size: 30px;
}

.header p {
  margin: 0;
  color: #777078;
}

.summary {
  margin-top: 12px;
  font-size: 14px;
  color: #5e555a;
}

.summary strong {
  color: #171219;
}

.card {
  background: white;
  border: 1px solid #eee5e9;
  border-radius: 18px;
  overflow-x: auto;
  box-shadow: 0 8px 30px rgba(0,0,0,.04);
}

table {
  width: 100%;
  min-width: 1750px;
  border-collapse: collapse;
}

th {
  text-align: left;
  padding: 14px 12px;
  background: #faf4f7;
  font-size: 12px;
  color: #716a70;
  white-space: nowrap;
  position: sticky;
  top: 0;
}

td {
  padding: 15px 12px;
  border-top: 1px solid #f1eaed;
  vertical-align: middle;
  font-size: 14px;
}

.fio {
  min-width: 180px;
}

.status {
  display: inline-block;
  padding: 7px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status.pending {
  background: #f2ecef;
  color: #625960;
}

.status.review {
  background: #fff2cc;
  color: #765900;
}

.status.paid {
  background: #e2f5e9;
  color: #176637;
}

.status.rejected {
  background: #fde8e8;
  color: #9d2626;
}

.status.cancelled {
  background: #eeeeee;
  color: #666666;
}

.receipt,
.contact-link {
  color: #bd2d67;
  font-weight: 600;
  text-decoration: none;
}

.receipt:hover,
.contact-link:hover {
  text-decoration: underline;
}

.no-receipt {
  color: #999;
  white-space: nowrap;
}

.actions {
  white-space: nowrap;
}

.btn {
  border: 0;
  padding: 9px 13px;
  border-radius: 9px;
  font-weight: 600;
  cursor: pointer;
  margin: 2px;
}

.approve {
  background: #e43878;
  color: white;
}

.reject {
  background: #f2ecef;
  color: #5e555a;
}

.delete {
  background: #fff0f0;
  color: #b42318;
}

.delete:hover {
  background: #ffe0e0;
}

.delete-all {
  background: #b42318;
  color: white;
  padding: 11px 16px;
}

.delete-all:hover {
  background: #8f1c13;
}

.empty {
  padding: 50px;
  text-align: center;
  color: #777078;
}

@media(max-width: 700px) {

  .header-row {
    align-items: flex-start;
    flex-direction: column;
  }

}

</style>

</head>

<body>

<div class="container">

  <div class="header">

    <div class="header-row">

      <div>

        <h1>Pink Run — участники</h1>

        <p>
          Все регистрации участников, включая ожидающие оплаты.
        </p>

        <div class="summary">
          Всего записей:
          <strong>${result.rowCount}</strong>
        </div>

      </div>

      <button
        class="btn delete-all"
        onclick="deleteAllParticipants()">
        Удалить все записи
      </button>

    </div>

  </div>


  <div class="card">

    ${
      rows
        ? `
          <table>

            <thead>

              <tr>
                <th>№ участника</th>
                <th>ФИО</th>
                <th>Дата рождения</th>
                <th>Пол</th>
                <th>Email</th>
                <th>Телефон</th>
                <th>Экстренный контакт</th>
                <th>Дистанция</th>
                <th>Сумма</th>
                <th>Дата регистрации</th>
                <th>Статус</th>
                <th>Чек</th>
                <th>Действия</th>
              </tr>

            </thead>

            <tbody>
              ${rows}
            </tbody>

          </table>
        `
        : `
          <div class="empty">
            Зарегистрированных участников пока нет.
          </div>
        `
    }

  </div>

</div>


<script>

const ADMIN_KEY = ${JSON.stringify(TEST_KEY)};


/* =========================================================
   ИЗМЕНЕНИЕ СТАТУСА ОПЛАТЫ
   ========================================================= */

async function changeStatus(id, status) {

  const text =
    status === 'paid'
      ? 'подтвердить оплату'
      : 'отклонить оплату';

  if (!confirm(
    'Вы действительно хотите ' + text + '?'
  )) {
    return;
  }

  try {

    const response = await fetch(
      '/admin-test/payment-status',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },

        body: JSON.stringify({
          participantId: id,
          status: status
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Ошибка изменения статуса'
      );
    }

    location.reload();

  } catch (error) {

    console.error(
      'Ошибка изменения статуса:',
      error
    );

    alert(error.message);
  }
}


/* =========================================================
   УДАЛЕНИЕ ОДНОГО УЧАСТНИКА
   ========================================================= */

async function deleteParticipant(
  id,
  participantNumber
) {

  const confirmed = confirm(
    'Удалить участника ' +
    participantNumber +
    '?\\n\\n' +
    'Запись участника будет удалена из базы.'
  );

  if (!confirmed) {
    return;
  }

  try {

    const response = await fetch(
      '/admin-test/participant/' +
      encodeURIComponent(id),
      {
        method: 'DELETE',

        headers: {
          'X-Admin-Key': ADMIN_KEY
        }
      }
    );

    let data;

    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Не удалось удалить запись'
      );
    }

    alert(
      'Участник ' +
      participantNumber +
      ' удалён.'
    );

    location.reload();

  } catch (error) {

    console.error(
      'Ошибка удаления участника:',
      error
    );

    alert(error.message);
  }
}


/* =========================================================
   УДАЛЕНИЕ ВСЕХ УЧАСТНИКОВ
   ========================================================= */

async function deleteAllParticipants() {

  const firstConfirm = confirm(
    'Удалить ВСЕ записи участников?\\n\\n' +
    'Это действие нельзя отменить.'
  );

  if (!firstConfirm) {
    return;
  }

  const secondConfirm = confirm(
    'Подтвердите ещё раз.\\n\\n' +
    'Будут удалены ВСЕ регистрации.'
  );

  if (!secondConfirm) {
    return;
  }

  try {

    const response = await fetch(
      '/admin-test/participants',
      {
        method: 'DELETE',

        headers: {
          'X-Admin-Key': ADMIN_KEY
        }
      }
    );

    let data;

    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Не удалось удалить записи'
      );
    }

    alert(
      'Удалено записей: ' +
      (data.deleted ?? 0)
    );

    location.reload();

  } catch (error) {

    console.error(
      'Ошибка удаления всех участников:',
      error
    );

    alert(error.message);
  }
}

</script>

</body>
</html>
    `);

  } catch (error) {

    console.error(
      'Ошибка загрузки админ-страницы:',
      error
    );

    res.status(500).send(
      'Не удалось загрузить список участников'
    );
  }
});


/* =========================================================
   ИЗМЕНЕНИЕ СТАТУСА
   ========================================================= */

router.post(
  '/admin-test/payment-status',
  checkAdminKey,
  async (req, res) => {

    try {

      const {
        participantId,
        status
      } = req.body;

      if (!participantId) {
        return res.status(400).json({
          error: 'Не указан участник'
        });
      }

      if (!['paid', 'rejected'].includes(status)) {
        return res.status(400).json({
          error: 'Недопустимый статус'
        });
      }

      const result = await pool.query(
        `
        UPDATE participants
        SET status = $1
        WHERE id = $2
          AND status = 'payment_review'
        RETURNING
          id,
          participant_number,
          status
        `,
        [
          status,
          participantId
        ]
      );

      if (result.rowCount === 0) {

        return res.status(404).json({
          error:
            'Заявка не найдена или уже обработана'
        });

      }

      return res.json({
        success: true,
        participantNumber:
          result.rows[0].participant_number,
        status:
          result.rows[0].status
      });

    } catch (error) {

      console.error(
        'Ошибка изменения статуса оплаты:',
        error
      );

      return res.status(500).json({
        error:
          'Не удалось изменить статус оплаты'
      });
    }
  }
);


/* =========================================================
   УДАЛЕНИЕ ОДНОГО УЧАСТНИКА
   ========================================================= */

router.delete(
  '/admin-test/participant/:id',
  checkAdminKey,
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        DELETE FROM participants
        WHERE id = $1
        RETURNING
          id,
          participant_number
        `,
        [req.params.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: 'Участник не найден'
        });
      }

      return res.json({
        success: true,
        participantNumber:
          result.rows[0].participant_number
      });

    } catch (error) {

      console.error(
        'Ошибка удаления участника:',
        error
      );

      return res.status(500).json({
        error: 'Не удалось удалить участника'
      });
    }
  }
);


/* =========================================================
   УДАЛЕНИЕ ВСЕХ УЧАСТНИКОВ
   ========================================================= */

router.delete(
  '/admin-test/participants',
  checkAdminKey,
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        DELETE FROM participants
        RETURNING id
        `
      );

      return res.json({
        success: true,
        deleted: result.rowCount
      });

    } catch (error) {

      console.error(
        'Ошибка удаления всех участников:',
        error
      );

      return res.status(500).json({
        error: 'Не удалось удалить записи'
      });
    }
  }
);


/* =========================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================= */

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

}


function formatPrice(value) {

  const number = Number(value || 0);

  return new Intl.NumberFormat(
    'ru-RU'
  ).format(number) + ' ₸';

}


function formatGender(value) {

  const gender = String(value || '').toLowerCase();

  if (
    gender === 'female' ||
    gender === 'f' ||
    gender === 'женский'
  ) {
    return 'Женский';
  }

  if (
    gender === 'male' ||
    gender === 'm' ||
    gender === 'мужской'
  ) {
    return 'Мужской';
  }

  return escapeHtml(value || '—');

}


function formatDateOnly(value) {

  if (!value) {
    return '—';
  }

  const text = String(value);

  const match =
    text.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);

  if (match) {
    return (
      match[3] +
      '.' +
      match[2] +
      '.' +
      match[1]
    );
  }

  return escapeHtml(text);

}


function formatDateTime(value) {

  if (!value) {
    return '—';
  }

  try {

    return new Intl.DateTimeFormat(
      'ru-RU',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(new Date(value));

  } catch (error) {

    return escapeHtml(value);

  }
}


module.exports = router;
