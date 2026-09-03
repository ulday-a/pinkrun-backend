const express = require('express');
const router = express.Router();
const { pool } = require('../db');

/*
 * ВРЕМЕННЫЙ файл для тестирования сценария до подключения BCC Pay.
 * Удалите этот файл и его подключение в server.js, когда реальная оплата заработает.
 */

const TEST_KEY = process.env.TEST_ADMIN_KEY || 'pinkrun-test';

// GET /admin-test — простая страница с кнопкой для ручной отметки оплаты
router.get('/admin-test', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Тест: отметить оплату</title>
<style>
  body{font-family:sans-serif; max-width:420px; margin:60px auto; padding:0 20px;}
  h1{font-size:20px;}
  label{display:block; margin-top:16px; font-size:14px; font-weight:600;}
  input{width:100%; padding:10px; margin-top:6px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box;}
  button{margin-top:20px; padding:12px 20px; background:#ff3b30; color:#fff; border:none; border-radius:100px; font-weight:700; cursor:pointer; width:100%;}
  #result{margin-top:16px; font-size:14px;}
</style>
</head>
<body>
  <h1>Тестовая отметка «Оплачено»</h1>
  <p>Временная страница для проверки сценария до подключения BCC Pay.</p>

  <label>Номер участника (например, PR-0001)</label>
  <input id="pnum" placeholder="PR-0001">

  <label>Ключ доступа</label>
  <input id="key" placeholder="ключ из TEST_ADMIN_KEY">

  <button onclick="markPaid()">Отметить как оплачено</button>
  <button onclick="deleteParticipant()" style="background:#6b6470; margin-top:10px;">Удалить участника</button>
  <div id="result"></div>

<script>
async function markPaid(){
  const participantNumber = document.getElementById('pnum').value.trim();
  const key = document.getElementById('key').value.trim();
  const resultEl = document.getElementById('result');
  resultEl.textContent = 'Отправка...';
  try {
    const res = await fetch('/api/test/mark-paid', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ participantNumber, key }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Ошибка');
    resultEl.textContent = 'Готово: ' + participantNumber + ' отмечен как оплаченный.';
    resultEl.style.color = 'green';
  } catch(err) {
    resultEl.textContent = 'Ошибка: ' + err.message;
    resultEl.style.color = 'red';
  }
}

async function deleteParticipant(){
  const participantNumber = document.getElementById('pnum').value.trim();
  const key = document.getElementById('key').value.trim();
  const resultEl = document.getElementById('result');
  if(!confirm('Точно удалить участника ' + participantNumber + '? Это необратимо.')) return;
  resultEl.textContent = 'Удаление...';
  try {
    const res = await fetch('/api/test/delete', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ participantNumber, key }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Ошибка');
    resultEl.textContent = 'Готово: ' + participantNumber + ' удалён из базы.';
    resultEl.style.color = 'green';
  } catch(err) {
    resultEl.textContent = 'Ошибка: ' + err.message;
    resultEl.style.color = 'red';
  }
}
</script>
</body>
</html>
  `);
});

// POST /api/test/mark-paid — отметить участника оплаченным (требует ключ доступа)
router.post('/api/test/mark-paid', async (req, res) => {
  try {
    const { participantNumber, key } = req.body;

    if (key !== TEST_KEY) {
      return res.status(403).json({ error: 'Неверный ключ доступа' });
    }
    if (!participantNumber) {
      return res.status(400).json({ error: 'Не указан номер участника' });
    }

    const result = await pool.query(
      `UPDATE participants SET status = 'paid' WHERE participant_number = $1 RETURNING id`,
      [participantNumber]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Участник с таким номером не найден' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка тестовой отметки оплаты:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// POST /api/test/delete — удалить тестового участника из базы (требует ключ доступа)
router.post('/api/test/delete', async (req, res) => {
  try {
    const { participantNumber, key } = req.body;

    if (key !== TEST_KEY) {
      return res.status(403).json({ error: 'Неверный ключ доступа' });
    }
    if (!participantNumber) {
      return res.status(400).json({ error: 'Не указан номер участника' });
    }

    const result = await pool.query(
      `DELETE FROM participants WHERE participant_number = $1 RETURNING id`,
      [participantNumber]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Участник с таким номером не найден' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления участника:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
