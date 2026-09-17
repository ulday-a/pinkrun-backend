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
        distance,
        price,
        status,
        receipt_filename,
        receipt_uploaded_at
      FROM participants
      WHERE status IN ('payment_review', 'paid', 'rejected')
      ORDER BY
        CASE
          WHEN status = 'payment_review' THEN 1
          WHEN status = 'paid' THEN 2
          ELSE 3
        END,
        id DESC
    `);

    const rows = result.rows.map(p => {

      const statusText =
        p.status === 'payment_review'
          ? 'Оплата на проверке'
          : p.status === 'paid'
          ? 'Оплачено'
          : 'Отклонено';

      const statusClass =
        p.status === 'payment_review'
          ? 'review'
          : p.status === 'paid'
          ? 'paid'
          : 'rejected';

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
        : 'Нет чека';

      return `
        <tr>
          <td>
            <strong>${escapeHtml(p.participant_number || '')}</strong>
          </td>

          <td>
            ${escapeHtml(p.last_name || '')}
            ${escapeHtml(p.first_name || '')}
          </td>

          <td>
            ${escapeHtml(p.distance || '')}
          </td>

          <td>
            ${formatPrice(p.price)}
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

<title>Pink Run — Проверка оплат</title>

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
  max-width: 1250px;
  margin: 0 auto;
  padding: 40px 24px;
}

.header {
  margin-bottom: 28px;
}

.header h1 {
  margin: 0 0 8px;
  font-size: 32px;
}

.header p {
  margin: 0;
  color: #777078;
}

.card {
  background: white;
  border: 1px solid #eee5e9;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,.04);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  padding: 16px;
  background: #faf4f7;
  font-size: 13px;
  color: #716a70;
  white-space: nowrap;
}

td {
  padding: 17px 16px;
  border-top: 1px solid #f1eaed;
  vertical-align: middle;
}

.status {
  display: inline-block;
  padding: 7px 10px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
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

.receipt {
  color: #bd2d67;
  font-weight: 600;
  text-decoration: none;
}

.receipt:hover {
  text-decoration: underline;
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

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

@media(max-width: 700px) {
  .header-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
.empty {
  padding: 50px;
  text-align: center;
  color: #777078;
}

@media(max-width: 900px) {

  .card {
    overflow-x: auto;
  }

  table {
    min-width: 900px;
  }

}

</style>

</head>

<body>

<div class="container">

 <div class="header">

  <div class="header-row">

    <div>
      <h1>Pink Run — проверка оплат</h1>

      <p>
        Здесь отображаются заявки,
        по которым участники отправили подтверждение оплаты.
      </p>
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
                <th>Дистанция</th>
                <th>Сумма</th>
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
            Заявок на проверку пока нет.
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
    'Будут удалены регистрация и загруженный чек.'
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
    'Будут удалены ВСЕ регистрации и ВСЕ загруженные чеки.'
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
      'Не удалось загрузить список оплат'
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
  WHERE status IN ('payment_review', 'paid', 'rejected')
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


module.exports = router;
