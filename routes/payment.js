const express = require('express');
const router = express.Router();
const { pool } = require('../db');

/*
 * Подтверждение оплаты через Kaspi.
 *
 * Чек передаётся с сайта в формате multipart/form-data:
 * participantId — ID регистрации
 * receipt       — JPG / PNG / PDF
 *
 * Сам файл сохраняется в PostgreSQL.
 */

router.post(
  '/payment-claim',
  express.raw({
    type: [
      'image/jpeg',
      'image/png',
      'application/pdf'
    ],
    limit: '10mb'
  }),
  async (req, res) => {

    try {

      const participantId = req.query.participantId;
      const fileName = req.query.fileName || 'receipt';
      const contentType = req.headers['content-type'];

      if (!participantId) {
        return res.status(400).json({
          error: 'Не указан ID регистрации'
        });
      }

      if (!req.body || !req.body.length) {
        return res.status(400).json({
          error: 'Файл чека не получен'
        });
      }

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'application/pdf'
      ];

      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({
          error: 'Разрешены только JPG, PNG и PDF'
        });
      }

      const participantResult = await pool.query(
        `
        SELECT
          id,
          participant_number,
          status
        FROM participants
        WHERE id = $1
        `,
        [participantId]
      );

      if (participantResult.rowCount === 0) {
        return res.status(404).json({
          error: 'Регистрация не найдена'
        });
      }

      /*
       * Создаём поля для хранения чека, если их ещё нет.
       */

      await pool.query(`
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS receipt_data BYTEA
      `);

      await pool.query(`
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS receipt_filename TEXT
      `);

      await pool.query(`
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS receipt_content_type TEXT
      `);

      await pool.query(`
        ALTER TABLE participants
        ADD COLUMN IF NOT EXISTS receipt_uploaded_at TIMESTAMP
      `);

      /*
       * Сохраняем чек и переводим регистрацию
       * в статус проверки оплаты.
       */

      await pool.query(
        `
        UPDATE participants
        SET
          receipt_data = $1,
          receipt_filename = $2,
          receipt_content_type = $3,
          receipt_uploaded_at = NOW(),
          status = 'payment_review'
        WHERE id = $4
        `,
        [
          req.body,
          fileName,
          contentType,
          participantId
        ]
      );

      return res.json({
        success: true,
        status: 'payment_review',
        participantNumber:
          participantResult.rows[0].participant_number
      });

    } catch (error) {

      console.error(
        'Ошибка загрузки чека:',
        error
      );

      return res.status(500).json({
        error: 'Не удалось сохранить чек'
      });
    }
  }
);


/*
 * Получение чека организатором.
 */

router.get(
  '/payment-claim/:participantId/receipt',
  async (req, res) => {

    try {

      const result = await pool.query(
        `
        SELECT
          receipt_data,
          receipt_filename,
          receipt_content_type
        FROM participants
        WHERE id = $1
        `,
        [req.params.participantId]
      );

      if (
        result.rowCount === 0 ||
        !result.rows[0].receipt_data
      ) {
        return res.status(404).json({
          error: 'Чек не найден'
        });
      }

      const receipt = result.rows[0];

      res.setHeader(
        'Content-Type',
        receipt.receipt_content_type
      );

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${receipt.receipt_filename || 'receipt'}"`
      );

      return res.send(receipt.receipt_data);

    } catch (error) {

      console.error(
        'Ошибка получения чека:',
        error
      );

      return res.status(500).json({
        error: 'Не удалось получить чек'
      });
    }
  }
);


module.exports = router;
