require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const { parseLogLine } = require('./logParser');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// GANTI DENGAN PATH ABSOLUT (LENGKAP) KE FILE LOG ANDA!
const LOG_FILE_PATH = "C:\Users\ramal\Downloads\Proyek\WebsiteNuctech\server\Transmission.log";

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running and connected to the database!');
});

// API Endpoint untuk mengambil data scan dari database
app.get('/api/scans', async (req, res) => {
    try {
        const { status, limit = 100 } = req.query; // Ambil filter status & limit dari query
        let queryText;
        const queryParams = [limit];

        if (status && status.toLowerCase() === 'ok') {
            queryText = "SELECT * FROM scans WHERE status = 'OK' ORDER BY scan_time DESC LIMIT $1";
        } else if (status && status.toLowerCase() === 'nok') {
            queryText = "SELECT * FROM scans WHERE status = 'NOK' ORDER BY scan_time DESC LIMIT $1";
        } else {
            queryText = 'SELECT * FROM scans ORDER BY scan_time DESC LIMIT $1';
        }

        const result = await db.query(queryText, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching scans from DB:", err.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Pastikan file log ada sebelum mulai memantau
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`ERROR: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
    process.exit(1);
}

const watcher = chokidar.watch(LOG_FILE_PATH, {
  persistent: true,
  usePolling: true,
});

console.log(`Memantau perubahan pada file: ${LOG_FILE_PATH}`);

let lastSize = fs.statSync(LOG_FILE_PATH).size;

watcher.on('change', (path) => {
  fs.stat(path, (err, stats) => {
    if (err) {
      console.error("Error mendapatkan status file:", err);
      return;
    }

    if (stats.size > lastSize) {
      const stream = fs.createReadStream(path, { start: lastSize, end: stats.size });
      stream.on('data', (buffer) => {
        const lines = buffer.toString('utf8').trim().split('\n');
        
        lines.forEach(async (line) => { // <-- jadikan async
          if (!line) return;

          const parsedData = parseLogLine(line);
          if (parsedData) {
            console.log('--- DATA TRANSAKSI BARU ---');
            console.log(parsedData);
            
            // --> Blok untuk menyimpan ke Database
            try {
              const queryText = `
                INSERT INTO scans(container_no, truck_no, scan_time, status, image1_path, image2_path, image3_path, image4_path) 
                VALUES($1, $2, $3, $4, $5, $6, $7, $8) 
                RETURNING *`;
              const values = [
                parsedData.containerNo,
                parsedData.truckNo,
                parsedData.scanTime,
                parsedData.status,
                parsedData.image1_path,
                parsedData.image2_path,
                parsedData.image3_path,
                parsedData.image4_path,
              ];
              
              const res = await db.query(queryText, values);
              console.log('Data berhasil disimpan ke DB:', res.rows[0].id);

              // TODO: Kirim data `res.rows[0]` ini ke frontend melalui WebSocket.
            } catch (dbErr) {
              console.error('Gagal menyimpan ke DB:', dbErr.stack);
            }
            // <-- Akhir blok penyimpanan
          }
        });
      });
      lastSize = stats.size;
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});