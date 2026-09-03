const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');

const CODE_TTL_MINUTES = 5;

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function sendSms(phone, text) {
  const url = new URL('https://smsc.kz/sys/send.php');
  url.searchParams.set('login', process.env.SMSC_LOGIN);
  url.searchParams.set('psw', process.env.SMSC_PASSWORD);
  url.searchParams.set('phones', phone);
  url.searchParams.set('mes', text);
  url.searchParams.set('fmt', '3');
  url.searchParams.set('charset', 'utf-8');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    throw new Error(`SMSC.kz: ${data.error} (код ${data.error_code})`);
  }
  return data;
}

router.post('/auth/send-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Не указан номер телефона' });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO auth_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
      [phone, code, expiresAt]
    );

    await sendSms(phone, `Ваш код для входа в кабинет Pink Run: ${code}`);

    res.json({ success: true, message: 'Код отправлен' });
  } catch (err) {
    console.error('Ошибка отправки кода:', err);
    res.status(500).json({ error: 'Не удалось отправить SMS. Проверьте логин/пароль SMSC.kz и баланс аккаунта.' });
  }
});

router.post('/auth/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Не указан телефон или код' });
    }

    const result = await pool.query(
      `SELECT id FROM auth_codes
       WHERE phone = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Неверный или истёкший код' });
    }

    await pool.query(`UPDATE auth_codes SET used = TRUE WHERE id = $1`, [result.rows[0].id]);

    await pool.query(
      `INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING`,
      [phone]
    );

    res.json({ success: true, phone });
  } catch (err) {
    console.error('Ошибка проверки кода:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
