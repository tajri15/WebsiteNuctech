// =================================================================
// ==                 REALTIME SCANNER DASHBOARD                  ==
// ==                  BACKEND SERVER (index.js)                  ==
// =================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const http = require('http');
const { Server } = require("socket.io");

const { parseLogLine } = require('./logParser');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:5173"],
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

// --- KONFIGURASI UTAMA ---
// Ganti path di bawah ini sesuai dengan lokasi di komputer Anda.
// Gunakan double backslash (\\) untuk path Windows.
const LOG_FILE_PATH = 'C:\\Users\\ramal\\Downloads\\Proyek\\WebsiteNuctech\\server\\Transmission.log';
const IMAGE_FOLDER_PATH = 'D:\\Image';
// -------------------------

app.use(cors());
app.use(express.json());
app.use('/images', express.static(IMAGE_FOLDER_PATH));

io.on('connection', (socket) => {
    console.log(`🔌 User terhubung: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 User terputus: ${socket.id}`);
    });
});

app.get('/', (req, res) => res.send('Server is running with real-time capabilities!'));

// Endpoint API untuk data log dengan paginasi
app.get('/api/scans', async (req, res) => {
    try {
        const { status, page = 1, pageSize = 10 } = req.query;
        const offset = (page - 1) * pageSize;
        let filterClause = '';
        if (status && status.toLowerCase() === 'ok') filterClause = "WHERE status = 'OK'";
        else if (status && status.toLowerCase() === 'nok') filterClause = "WHERE status = 'NOK'";
        
        const totalQuery = `SELECT COUNT(*) FROM scans ${filterClause}`;
        const totalResult = await db.query(totalQuery);
        const total = parseInt(totalResult.rows[0].count, 10);

        const dataQuery = `SELECT * FROM scans ${filterClause} ORDER BY scan_time DESC LIMIT $1 OFFSET $2`;
        const result = await db.query(dataQuery, [pageSize, offset]);
        
        res.json({ data: result.rows, total: total });
    } catch (err) {
        console.error("Error fetching scans from DB:", err.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint API untuk statistik harian (halaman Statistics)
app.get('/api/stats/daily', async (req, res) => {
    try {
        const queryText = `
            SELECT DATE(scan_time) as date, COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'OK') as ok_count,
                   COUNT(*) FILTER (WHERE status = 'NOK') as nok_count
            FROM scans GROUP BY DATE(scan_time) ORDER BY date DESC LIMIT 30;`;
        const result = await db.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching daily stats:", err.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint API khusus untuk statistik halaman Overview
app.get('/api/stats/overview', async (req, res) => {
    try {
        const queryText = `
            SELECT COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status = 'OK') as ok,
                   COUNT(*) FILTER (WHERE status = 'NOK') as nok
            FROM scans;`;
        const result = await db.query(queryText);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching overview stats:", err.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint API untuk konfigurasi sistem (halaman Settings)
app.get('/api/config', (req, res) => {
    try {
        res.json({
            logFilePath: LOG_FILE_PATH,
            imageFolderPath: IMAGE_FOLDER_PATH,
            databaseHost: db.pool.options.host,
            databaseName: db.pool.options.database,
        });
    } catch (err) {
        console.error("Error fetching config:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Log file watcher
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`ERROR: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
    process.exit(1);
}
const watcher = chokidar.watch(LOG_FILE_PATH, { persistent: true, usePolling: true });
console.log(`👀 Memantau perubahan pada file: ${LOG_FILE_PATH}`);
let lastSize = fs.statSync(LOG_FILE_PATH).size;

watcher.on('change', (path) => {
  fs.stat(path, (err, stats) => {
    if (err) return console.error("Error mendapatkan status file:", err);
    if (stats.size > lastSize) {
      const stream = fs.createReadStream(path, { start: lastSize, end: stats.size });
      stream.on('data', (buffer) => {
        const lines = buffer.toString('utf8').trim().split('\n');
        lines.forEach(async (line) => {
          if (!line) return;
          const parsedData = parseLogLine(line);
          if (parsedData) {
            try {
              const queryText = `INSERT INTO scans(container_no, truck_no, scan_time, status, image1_path, image2_path, image3_path, image4_path) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
              const values = [parsedData.containerNo, parsedData.truckNo, parsedData.scanTime, parsedData.status, parsedData.image1_path, parsedData.image2_path, parsedData.image3_path, parsedData.image4_path];
              const res = await db.query(queryText, values);
              const newScanData = res.rows[0];
              console.log(`[OK] Data ${newScanData.id} disimpan. Mengirim via socket...`);
              io.emit('new_scan', newScanData);
            } catch (dbErr) {
              console.error('Gagal menyimpan ke DB:', dbErr.stack);
            }
          }
        });
      });
      lastSize = stats.size;
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));

