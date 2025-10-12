// --- 1. IMPORT MODUL ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const http = require('http');
const { Server } = require("socket.io");
const { parseLogLine } = require('./logParser');
const db = require('./db');

// --- 2. KONFIGURASI UTAMA ---
// PENTING: Ganti path di bawah ini sesuai dengan lokasi di komputer Anda.
const LOG_FILE_PATH = 'C:\\path\\to\\your\\Transmission.log';
const IMAGE_FOLDER_PATH = 'D:/Image';
const PORT = process.env.PORT || 5000;

// --- 3. INISIALISASI SERVER ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:5173"], // Izinkan koneksi dari React
        methods: ["GET", "POST"]
    }
});

// --- 4. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
// Middleware untuk menyajikan file gambar dari folder yang ditentukan
app.use('/images', express.static(IMAGE_FOLDER_PATH));

// --- 5. SOCKET.IO CONNECTION HANDLER ---
io.on('connection', (socket) => {
    console.log(`🔌 User terhubung: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 User terputus: ${socket.id}`);
    });
});

// --- 6. API ENDPOINTS ---

// Endpoint dasar untuk memeriksa status server
app.get('/', (req, res) => res.send('Server is running with real-time capabilities!'));

// Endpoint untuk mengambil data log dengan paginasi
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
        
        res.json({ data: result.rows, total });
    } catch (err) {
        console.error("Error fetching scans from DB:", err.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint untuk mengambil data statistik harian
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

// Endpoint untuk mengambil konfigurasi server
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


// --- 7. LOG FILE WATCHER ---
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`\n[ERROR] File log tidak ditemukan di: ${LOG_FILE_PATH}`);
    console.error("Pastikan path sudah benar dan server memiliki izin untuk membacanya.\n");
    process.exit(1);
}

const watcher = chokidar.watch(LOG_FILE_PATH, { persistent: true, usePolling: true });
console.log(`\n👀 Memantau perubahan pada file: ${LOG_FILE_PATH}`);
let lastSize = fs.statSync(LOG_FILE_PATH).size;

watcher.on('change', (path) => {
  fs.stat(path, (err, stats) => {
    if (err) return console.error("Error mendapatkan status file:", err);
    if (stats.size <= lastSize) {
      lastSize = stats.size; // Handle log rotation/reset
      return;
    }
    
    const stream = fs.createReadStream(path, { start: lastSize, end: stats.size });
    stream.on('data', (buffer) => {
      const lines = buffer.toString('utf8').trim().split('\n');
      lines.forEach(async (line) => {
        if (!line) return;
        const parsedData = parseLogLine(line);
        if (parsedData) {
          try {
            const query = `INSERT INTO scans(container_no, truck_no, scan_time, status, image1_path, image2_path, image3_path, image4_path) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
            const values = [parsedData.containerNo, parsedData.truckNo, parsedData.scanTime, parsedData.status, parsedData.image1_path, parsedData.image2_path, parsedData.image3_path, parsedData.image4_path];
            const res = await db.query(query, values);
            const newScanData = res.rows[0];
            
            console.log(`[OK] Data [${newScanData.id}] disimpan. Mengirim via socket...`);
            io.emit('new_scan', newScanData);

          } catch (dbErr) {
            console.error('[ERROR] Gagal menyimpan ke DB:', dbErr.stack);
          }
        }
      });
    });
    lastSize = stats.size;
  });
});

// --- 8. START SERVER ---
server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}\n`);
});
