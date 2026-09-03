const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Генерирует следующий номер участника вида PR-0001, PR-0002...
async function nextParticipantNumber() {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM participants');
  const count = result.rows[0].count + 1;
  return 'PR-' + String(count).padStart(4, '0');
}

// POST /api/register — сохранить нового участника (статус: ожидает оплаты)
router.post('/register', async (req, res) => {
  try {
    const {
      firstName, lastName, birthDate, gender,
      email, emergencyPhone, distance, price, phone,
    } = req.body;

    if (!firstName || !lastName || !birthDate || !gender || !email || !emergencyPhone || !distance || !price || !phone) {
      return res.status(400).json({ error: 'Заполнены не все обязательные поля' });
    }

    const participantNumber = await nextParticipantNumber();

    const result = await pool.query(
      `INSERT INTO participants
        (participant_number, first_name, last_name, birth_date, gender, email, emergency_phone, distance, price, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_payment')
       RETURNING id, participant_number`,
      [participantNumber, firstName, lastName, birthDate, gender, email, emergencyPhone, distance, price, phone]
    );

    res.json({
      success: true,
      participantId: result.rows[0].id,
      participantNumber: result.rows[0].participant_number,
    });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// GET /api/registrations/:phone — список регистраций пользователя по номеру телефона (для кабинета)
router.get('/registrations/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const result = await pool.query(
      `SELECT id, participant_number, distance, price, status, created_at
       FROM participants
       WHERE phone = $1 AND status != 'cancelled'
       ORDER BY created_at DESC`,
      [phone]
    );
    res.json({ registrations: result.rows });
  } catch (err) {
    console.error('Ошибка получения регистраций:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// POST /api/registrations/:id/cancel — отменить регистрацию (возврат слота)
router.post('/registrations/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE participants SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Регистрация не найдена' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка отмены регистрации:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// GET /api/participants — публичный список участников (для блока "Список участников" на сайте)
router.get('/participants', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT participant_number, first_name, last_name
       FROM participants
       WHERE status = 'paid'
       ORDER BY created_at ASC`
    );
    const list = result.rows.map(r => ({
      number: r.participant_number,
      name: `${r.first_name} ${r.last_name}`,
    }));
    res.json({ participants: list });
  } catch (err) {
    console.error('Ошибка получения списка участников:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
