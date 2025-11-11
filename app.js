// ===============================
//  app.js - Node.js + HiveMQ + MySQL + Express
// ===============================

const express = require('express');
const mysql = require('mysql2/promise');
const mqtt = require('mqtt');

const app = express();
const port = process.env.PORT || 3000;

// ===============================
//  Konfigurasi Database
// ===============================
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'db_sensor'
};

// ===============================
//  Konfigurasi MQTT
// ===============================
const TOPIC_SUHU = 'coba/suhu';
const TOPIC_LDR  = 'coba/ldr';

const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883', {
  clientId: 'node-bridge-' + Math.random().toString(16).slice(2) + '-' + Date.now(),
  reconnectPeriod: 2000,
  connectTimeout: 10000,
  keepalive: 60,
  clean: true
});

// ===============================
//  MQTT Event Handlers
// ===============================
mqttClient.on('connect', (connack) => {
  console.log('✅ MQTT Connected to broker.hivemq.com:', connack);
  mqttClient.subscribe([TOPIC_SUHU, TOPIC_LDR], (err) => {
    if (err) console.error('❌ Subscribe failed:', err.message);
    else console.log('📡 Subscribed to topics:', TOPIC_SUHU, TOPIC_LDR);
  });
});

mqttClient.on('error', (err) => console.error('❌ MQTT Error:', err.message));
mqttClient.on('reconnect', () => console.log('↻ MQTT reconnecting...'));
mqttClient.on('offline', () => console.log('⏸️ MQTT offline'));
mqttClient.on('close', () => console.log('🔌 MQTT connection closed'));

// ===============================
//  Saat Pesan MQTT Diterima
// ===============================
mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const conn = await mysql.createConnection(dbConfig);

    if (topic === TOPIC_SUHU) {
      await conn.execute(
        'INSERT INTO data_sensor (suhu, humidity) VALUES (?, ?)',
        [data.temperature, data.humidity]
      );
      console.log(`💾 Suhu tersimpan: ${data.temperature}°C, Hum=${data.humidity}%`);
    } else if (topic === TOPIC_LDR) {
      await conn.execute(
        'UPDATE data_sensor SET lux = ? ORDER BY id DESC LIMIT 1',
        [data.brightness]
      );
      console.log(`💾 Kecerahan diperbarui: ${data.brightness}`);
    }

    await conn.end();
  } catch (err) {
    console.error('❌ MQTT → SQL Error:', err.message);
  }
});

// ===============================
//  API: tampilkan data sensor
// ===============================
app.get('/api/sensor', async (req, res) => {
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);

    const [statsRows] = await conn.execute(`
      SELECT 
        MAX(suhu) AS suhumax, 
        MIN(suhu) AS suhumin, 
        ROUND(AVG(suhu),2) AS suhurata 
      FROM data_sensor
    `);

    const stats = statsRows[0];

    // === Diubah: lux AS kecerahan ===
    const [rows] = await conn.execute(`
      SELECT id, suhu, humidity, lux AS kecerahan, 
      DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') AS waktu
      FROM data_sensor
      ORDER BY id DESC
      LIMIT 10
    `);

    res.json({
      suhumax: stats.suhumax,
      suhumin: stats.suhumin,
      suhurata: stats.suhurata,
      data: rows
    });

  } catch (err) {
    console.error('❌ API Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// ===============================
//  Route utama
// ===============================
app.get('/', (req, res) => {
  res.send(`
    <h2>✅ Server Node.js Aktif (HiveMQ Publik)</h2>
    <p>Broker: <b>mqtt://broker.hivemq.com:1883</b></p>
    <ul>
      <li>Topic suhu: <code>${TOPIC_SUHU}</code></li>
      <li>Topic LDR: <code>${TOPIC_LDR}</code></li>
      <li><a href="/api/sensor">/api/sensor</a> → lihat data JSON</li>
    </ul>
  `);
});

// ===============================
//  Jalankan server
// ===============================
app.listen(port, () => {
  console.log(`🚀 Server berjalan di http://localhost:${port}`);
});
