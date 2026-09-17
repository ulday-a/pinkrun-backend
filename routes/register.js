const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const MAX_PARTICIPANTS = 500;


/* =========================================================
   ГЕНЕРАЦИЯ НОМЕРА УЧАСТНИКА
   ========================================================= */

// Генерирует следующий номер:
// PR-0001, PR-0002, PR-0003...
//
// Удалённые или отменённые номера повторно не используются.
async function nextParticipantNumber(client = pool) {

  const result = await client.query(`
    SELECT COALESCE(
      MAX(
        CAST(
          SUBSTRING(participant_number FROM 4)
          AS INTEGER
        )
      ),
      0
    ) AS max_number
    FROM participants
    WHERE participant_number ~ '^PR-[0-9]+$'
  `);

  const nextNumber =
    Number(result.rows[0].max_number) + 1;

  return (
    'PR-' +
    String(nextNumber).padStart(4, '0')
  );
}


/* =========================================================
   РЕГИСТРАЦИЯ
   ========================================================= */

// POST /api/register
// Создать нового участника.
// Начальный статус: ожидает оплаты.

router.post('/register', async (req, res) => {

  const client = await pool.connect();

  try {

    const {
      firstName,
      lastName,
      birthDate,
      gender,
      email,
      emergencyPhone,
      distance,
      price,
      phone,
    } = req.body;


    /* -------------------------------------------------------
       Проверка обязательных полей
       ------------------------------------------------------- */

    if (
      !firstName ||
      !lastName ||
      !birthDate ||
      !gender ||
      !email ||
      !emergencyPhone ||
      !distance ||
      !price ||
      !phone
    ) {

      return res.status(400).json({
        error:
          'Заполнены не все обязательные поля'
      });
    }


    /* -------------------------------------------------------
       Транзакция
       ------------------------------------------------------- */

    await client.query('BEGIN');


    /*
     * Блокировка регистрации.
     *
     * Не позволяет двум параллельным запросам
     * одновременно занять последний 500-й слот.
     */
    await client.query(`
      SELECT pg_advisory_xact_lock(500001)
    `);


    /* -------------------------------------------------------
       Проверяем количество действующих регистраций
       ------------------------------------------------------- */

    const countResult = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM participants
      WHERE status != 'cancelled'
    `);

    const registeredCount =
      countResult.rows[0].count;


    /* -------------------------------------------------------
       Лимит — 500 участников
       ------------------------------------------------------- */

    if (registeredCount >= MAX_PARTICIPANTS) {

      await client.query('ROLLBACK');

      return res.status(409).json({
        success: false,
        registrationClosed: true,
        error:
          'Регистрация завершена. Достигнут лимит 500 участников.'
      });
    }


    /* -------------------------------------------------------
       Генерируем номер участника
       ------------------------------------------------------- */

    const participantNumber =
      await nextParticipantNumber(client);


    /* -------------------------------------------------------
       Сохраняем участника
       ------------------------------------------------------- */

    const result = await client.query(
      `
      INSERT INTO participants
      (
        participant_number,
        first_name,
        last_name,
        birth_date,
        gender,
        email,
        emergency_phone,
        distance,
        price,
        phone,
        status
      )

      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        'pending_payment'
      )

      RETURNING
        id,
        participant_number
      `,
      [
        participantNumber,
        firstName,
        lastName,
        birthDate,
        gender,
        email,
        emergencyPhone,
        distance,
        price,
        phone
      ]
    );


    await client.query('COMMIT');


    /* -------------------------------------------------------
       Ответ сайту
       ------------------------------------------------------- */

    return res.json({

      success: true,

      participantId:
        result.rows[0].id,

      participantNumber:
        result.rows[0].participant_number,

      registeredCount:
        registeredCount + 1,

      remainingSlots:
        MAX_PARTICIPANTS -
        (registeredCount + 1)
    });


  } catch (err) {

    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Ошибка ROLLBACK:',
        rollbackError
      );
    }

    console.error(
      'Ошибка регистрации:',
      err
    );

    return res.status(500).json({
      error:
        'Внутренняя ошибка сервера'
    });

  } finally {

    client.release();
  }
});


/* =========================================================
   КОЛИЧЕСТВО СВОБОДНЫХ МЕСТ
   ========================================================= */

// GET /api/registration-status
//
// Позволяет сайту узнать:
// открыта ли регистрация,
// сколько зарегистрировано,
// сколько осталось мест.

router.get(
  '/registration-status',
  async (req, res) => {

    try {

      const result = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM participants
        WHERE status != 'cancelled'
      `);

      const registered =
        result.rows[0].count;

      const remaining =
        Math.max(
          MAX_PARTICIPANTS - registered,
          0
        );

      return res.json({

        maxParticipants:
          MAX_PARTICIPANTS,

        registered:
          registered,

        remaining:
          remaining,

        registrationOpen:
          registered < MAX_PARTICIPANTS
      });

    } catch (err) {

      console.error(
        'Ошибка получения статуса регистрации:',
        err
      );

      return res.status(500).json({
        error:
          'Внутренняя ошибка сервера'
      });
    }
  }
);


/* =========================================================
   РЕГИСТРАЦИИ ПОЛЬЗОВАТЕЛЯ
   ========================================================= */

// GET /api/registrations/:phone

router.get(
  '/registrations/:phone',
  async (req, res) => {

    try {

      const { phone } = req.params;

      const result = await pool.query(
        `
        SELECT
          id,
          participant_number,
          distance,
          price,
          status,
          created_at

        FROM participants

        WHERE phone = $1
          AND status != 'cancelled'

        ORDER BY created_at DESC
        `,
        [phone]
      );

      return res.json({
        registrations:
          result.rows
      });

    } catch (err) {

      console.error(
        'Ошибка получения регистраций:',
        err
      );

      return res.status(500).json({
        error:
          'Внутренняя ошибка сервера'
      });
    }
  }
);


/* =========================================================
   ОТМЕНА РЕГИСТРАЦИИ
   ========================================================= */

// POST /api/registrations/:id/cancel
//
// Отменённая регистрация освобождает слот,
// но её PR-номер повторно не используется.

router.post(
  '/registrations/:id/cancel',
  async (req, res) => {

    try {

      const { id } = req.params;

      const result = await pool.query(
        `
        UPDATE participants

        SET
          status = 'cancelled',
          cancelled_at = NOW()

        WHERE id = $1
          AND status != 'cancelled'

        RETURNING id
        `,
        [id]
      );

      if (result.rowCount === 0) {

        return res.status(404).json({
          error:
            'Регистрация не найдена или уже отменена'
        });
      }

      return res.json({
        success: true
      });

    } catch (err) {

      console.error(
        'Ошибка отмены регистрации:',
        err
      );

      return res.status(500).json({
        error:
          'Внутренняя ошибка сервера'
      });
    }
  }
);


/* =========================================================
   ПУБЛИЧНЫЙ СПИСОК УЧАСТНИКОВ
   ========================================================= */

// GET /api/participants
//
// На сайте показываем только участников
// с подтверждённой оплатой.

router.get(
  '/participants',
  async (req, res) => {

    try {

      const result = await pool.query(`
        SELECT
          participant_number,
          first_name,
          last_name

        FROM participants

        WHERE status = 'paid'

        ORDER BY created_at ASC
      `);

      const list =
        result.rows.map(r => ({

          number:
            r.participant_number,

          name:
            \`\${r.first_name} \${r.last_name}\`

        }));

      return res.json({
        participants: list
      });

    } catch (err) {

      console.error(
        'Ошибка получения списка участников:',
        err
      );

      return res.status(500).json({
        error:
          'Внутренняя ошибка сервера'
      });
    }
  }
);


module.exports = router;
