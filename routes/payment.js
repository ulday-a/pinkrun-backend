const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { pool } = require('../db');

router.post('/payment/init', async (req, res) => {
  try {
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ error: 'Не указан ID регистрации' });
    }

    const result = await pool.query(
      `SELECT id, participant_number, price FROM participants WHERE id = $1`,
      [participantId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Регистрация не найдена' });
    }
    const participant = result.rows[0];

    if (!process.env.BCC_API_BASE_URL || !process.env.BCC_MERCHANT_ID) {
      return res.status(501).json({
        error: 'BCC Pay ещё не подключён. Заполните BCC_MERCHANT_ID / BCC_API_KEY / BCC_API_SECRET / BCC_API_BASE_URL в переменных окружения после получения доступа на developer.bcc.kz.',
      });
    }

    const response = await fetch(`${process.env.BCC_API_BASE_URL}/payments/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BCC_API_KEY}`,
      },
      body: JSON.stringify({
        merchantId: process.env.BCC_MERCHANT_ID,
        orderId: participant.participant_number,
        amount: participant.price,
        currency: 'KZT',
        description: `Регистрационный взнос Pink Run — ${participant.participant_number}`,
        returnUrl: 'https://pinkrun.kz/?payment=success',
        webhookUrl: `${req.protocol}://${req.get('host')}/api/payment/webhook`,
      }),
    });

    const data = await response.json();

    await pool.query(
      `UPDATE participants SET payment_id = $1 WHERE id = $2`,
      [data.paymentId || data.id || null, participantId]
    );

    res.json({ success: true, paymentUrl: data.paymentUrl || data.redirectUrl });
  } catch (err) {
    console.error('Ошибка инициации оплаты:', err);
    res.status(500).json({ error: 'Не удалось создать платёж' });
  }
});

router.post('/payment/webhook', async (req, res) => {
  try {
    const { orderId, status, paymentId } = req.body;

    if (status === 'success' || status === 'paid') {
      await pool.query(
        `UPDATE participants SET status = 'paid', payment_id = $1 WHERE participant_number = $2`,
        [paymentId, orderId]
      );
    } else if (status === 'failed' || status === 'cancelled') {
      await pool.query(
        `UPDATE participants SET status = 'payment_failed' WHERE participant_number = $1`,
        [orderId]
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Ошибка обработки webhook от BCC Pay:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
