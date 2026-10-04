const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const router = express.Router();
const { pool } = require('../db');

/*
 * Подтверждение оплаты через Kaspi.
 *
 * Чек передаётся с сайта как «сырое» тело запроса (JPG / PNG / PDF).
 * Сам файл хранится в Cloudinary. В PostgreSQL сохраняются только метаданные
 * и ссылка на файл. Это не расходует дисковое место БД на изображения/PDF.
 */

function getCloudinaryConfig() {
  const value = process.env.CLOUDINARY_URL;
  if (!value) throw new Error('CLOUDINARY_URL не задан');

  const parsed = new URL(value);
  return {
    cloudName: parsed.hostname,
    apiKey: decodeURIComponent(parsed.username),
    apiSecret: decodeURIComponent(parsed.password),
  };
}

function cloudinarySignature(params, apiSecret) {
  const source = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(source + apiSecret)
    .digest('hex');
}

async function uploadReceipt(buffer, contentType, participantId) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'pinkrun/receipts';
  const publicId = `participant-${participantId}-${crypto.randomUUID()}`;
  const signedParams = { folder, public_id: publicId, timestamp };
  const signature = cloudinarySignature(signedParams, apiSecret);

  const body = new URLSearchParams();
  body.set('file', `data:${contentType};base64,${buffer.toString('base64')}`);
  body.set('api_key', apiKey);
  body.set('timestamp', String(timestamp));
  body.set('folder', folder);
  body.set('public_id', publicId);
  body.set('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    { method: 'POST', body }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Cloudinary upload failed');
  }

  return result;
}

async function deleteCloudinaryAsset(publicId, resourceType = 'image') {
  if (!publicId) return;

  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = { public_id: publicId, timestamp };
  const signature = cloudinarySignature(signedParams, apiSecret);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature,
  });

  // Удаление старого файла — вспомогательная операция. Ошибка удаления не
  // должна отменять уже успешно сохранённый новый чек.
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
    { method: 'POST', body }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary delete failed: ${text}`);
  }
}

router.post(
  '/payment-claim',
  express.raw({
    type: ['image/jpeg', 'image/png', 'application/pdf'],
    limit: '10mb',
  }),
  async (req, res) => {
    let uploadedAsset = null;

    try {
      const participantId = req.get('X-Participant-Id') || req.query.participantId;
      const fileName = req.query.fileName || 'receipt';
      const contentType = req.headers['content-type'];

      if (!participantId) {
        return res.status(400).json({ error: 'Не указан ID регистрации' });
      }

      if (!req.body || !req.body.length) {
        return res.status(400).json({ error: 'Файл чека не получен' });
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ error: 'Разрешены только JPG, PNG и PDF' });
      }

      const participantResult = await pool.query(
        `
        SELECT
          id,
          participant_number,
          status,
          receipt_public_id,
          receipt_resource_type
        FROM participants
        WHERE id = $1
        `,
        [participantId]
      );

      if (participantResult.rowCount === 0) {
        return res.status(404).json({ error: 'Регистрация не найдена' });
      }

      uploadedAsset = await uploadReceipt(req.body, contentType, participantId);

      const oldReceipt = participantResult.rows[0];

      await pool.query(
        `
        UPDATE participants
        SET
          receipt_url = $1,
          receipt_public_id = $2,
          receipt_resource_type = $3,
          receipt_filename = $4,
          receipt_content_type = $5,
          receipt_uploaded_at = NOW(),
          receipt_data = NULL,
          status = 'payment_review'
        WHERE id = $6
        `,
        [
          uploadedAsset.secure_url,
          uploadedAsset.public_id,
          uploadedAsset.resource_type || 'image',
          fileName,
          contentType,
          participantId,
        ]
      );

      // После успешного UPDATE удаляем предыдущий файл из Cloudinary.
      if (oldReceipt.receipt_public_id && oldReceipt.receipt_public_id !== uploadedAsset.public_id) {
        deleteCloudinaryAsset(
          oldReceipt.receipt_public_id,
          oldReceipt.receipt_resource_type || 'image'
        ).catch((error) => console.error('Не удалось удалить старый чек из Cloudinary:', error));
      }

      return res.json({
        success: true,
        status: 'payment_review',
        participantNumber: participantResult.rows[0].participant_number,
      });
    } catch (error) {
      console.error('Ошибка загрузки чека:', error);

      // Если файл успел загрузиться, а БД не обновилась, удаляем «осиротевший» файл.
      if (uploadedAsset?.public_id) {
        deleteCloudinaryAsset(
          uploadedAsset.public_id,
          uploadedAsset.resource_type || 'image'
        ).catch(() => {});
      }

      return res.status(500).json({ error: 'Не удалось сохранить чек' });
    }
  }
);

/*
 * Получение чека организатором.
 * URL Cloudinary наружу не отдаём: backend получает файл и возвращает его
 * тем же endpoint, который использовался раньше.
 *
 * Для старых регистраций оставлен fallback на receipt_data, чтобы уже
 * загруженные до миграции чеки не пропали.
 */
router.get('/payment-claim/:participantId/receipt', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        receipt_url,
        receipt_data,
        receipt_filename,
        receipt_content_type
      FROM participants
      WHERE id = $1
      `,
      [req.params.participantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Чек не найден' });
    }

    const receipt = result.rows[0];

    const safeFileName = String(receipt.receipt_filename || 'receipt')
      .replace(/["\r\n]/g, '');

    // Для PDF принудительно отдаём правильный MIME type,
    // даже если старый файл был сохранён как application/octet-stream.
    let responseContentType =
      receipt.receipt_content_type || 'application/octet-stream';

    if (
      safeFileName.toLowerCase().endsWith('.pdf') ||
      responseContentType === 'application/pdf'
    ) {
      responseContentType = 'application/pdf';
    }

    res.setHeader('Content-Type', responseContentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFileName}"`
    );

    if (receipt.receipt_url) {
      const cloudinaryResponse = await fetch(receipt.receipt_url);
      if (!cloudinaryResponse.ok) {
        throw new Error(`Cloudinary returned ${cloudinaryResponse.status}`);
      }
      const fileBuffer = await cloudinaryResponse.buffer();
      return res.send(fileBuffer);
    }

    if (receipt.receipt_data) {
      return res.send(receipt.receipt_data);
    }

    return res.status(404).json({ error: 'Чек не найден' });
  } catch (error) {
    console.error('Ошибка получения чека:', error);
    return res.status(500).json({ error: 'Не удалось получить чек' });
  }
});

module.exports = router;
