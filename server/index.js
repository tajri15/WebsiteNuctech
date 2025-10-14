// index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const os = require('os');
const ini = require('ini'); // Tambahkan library untuk membaca file .ini

const { parseLogLine } = require('./logParser');
const db = require('./db');

// --- Konfigurasi Path ---
const LOG_FILE_PATH = 'C:\\Users\\ramal\\Downloads\\Proyek\\WebsiteNuctech\\server\\Transmission.log';
const CONFIG_FILE_PATH = 'C:\\Users\\ramal\\Downloads\\Proyek\\WebsiteNuctech\\server\\config.ini'; // Path ke config.ini
const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Membaca Konfigurasi dari config.ini ---
let ftpConfig = {};
try {
    const configFile = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    const config = ini.parse(configFile);
    ftpConfig = {
        server1_ip: config.Ftp_Server.ip,
        server2_ip: new URL(config.Http_Server.no_conclusion_url).hostname // Ekstrak IP dari URL
    };
    console.log('✅ Konfigurasi FTP berhasil dimuat:', ftpConfig);
} catch (error) {
    console.error('❌ Gagal memuat config.ini, menggunakan IP fallback:', error);
    ftpConfig = {
        server1_ip: '10.226.62.31', // Fallback
        server2_ip: '10.226.62.32'  // Fallback
    };
}


// --- State Management ---
let systemState = {
  ftpServer1: {
    name: 'FTP Server 1 (File Upload)',
    status: 'standby',
    lastActivity: '-',
    details: 'Waiting for activity...',
    ip: ftpConfig.server1_ip
  },
  ftpServer2: {
    name: 'API Server 2 (Data Transfer)',
    status: 'standby',
    lastActivity: '-',
    details: 'Standby server',
    ip: ftpConfig.server2_ip
  }
};
// ... (sisa state management Anda tetap sama)
let systemActivity = {
    uptime: '0 days 00:00:00',
    lastUpdate: new Date().toLocaleTimeString('en-US', { hour12: false }),
    activeConnections: 0,
    logFiles: '0 files',
    totalScans: 0, successfulScans: 0, failedScans: 0, successRate: '0%'
};
let serverStartTime = Date.now();
let processedLogs = new Set();


// --- Fungsi Helper --- (Fungsi updateUptime dan updateSystemActivity tetap sama)
const updateUptime = () => { /* ...kode sama seperti sebelumnya... */ };
const updateSystemActivity = async () => { /* ...kode sama seperti sebelumnya... */ };


const updateFTPStatus = (serverNum, status, details) => {
    const serverKey = `ftpServer${serverNum}`;
    if (systemState[serverKey]) {
        systemState[serverKey].status = status;
        systemState[serverKey].lastActivity = new Date().toLocaleTimeString('en-US', { hour12: true });
        systemState[serverKey].details = details;
    }
    
    io.emit('ftp_update', {
        server1: systemState.ftpServer1,
        server2: systemState.ftpServer2
    });
};

// --- Middleware & API & WebSocket (Tetap sama) ---
app.use(cors());
app.use(express.json());
io.on('connection', (socket) => { /* ...kode sama seperti sebelumnya... */ });
app.get('/api/initial-data', async (req, res) => { /* ...kode sama seperti sebelumnya... */ });


// --- Log File Watcher (MODIFIKASI UTAMA DI SINI) ---
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`ERROR: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
    process.exit(1);
}
const watcher = chokidar.watch(LOG_FILE_PATH, { persistent: true, usePolling: true, interval: 1000 });
console.log(`👀 Memantau perubahan pada file: ${LOG_FILE_PATH}`);
let lastSize = fs.statSync(LOG_FILE_PATH).size;

watcher.on('change', (path) => {
    // ... (Logika pembacaan stream tetap sama)
    const currentSize = fs.statSync(path).size;
    if (currentSize <= lastSize) {
        lastSize = currentSize;
        return;
    }

    const stream = fs.createReadStream(path, { start: lastSize, end: currentSize });
    let buffer = '';
    stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
    stream.on('end', async () => {
        const lines = buffer.trim().split('\n');
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            // Mencegah duplikasi
            const lineHash = Buffer.from(line).toString('base64');
            if (processedLogs.has(lineHash)) continue;
            processedLogs.add(lineHash);

            const parsed = parseLogLine(line);

            // Jika ada log SCAN baru, update KEDUA server
            if (parsed.type === 'SCAN') {
                const pData = parsed.data;
                try {
                    const query = `INSERT INTO scans(container_no, truck_no, scan_time, status, image1_path) VALUES($1, $2, $3, $4, $5) RETURNING *`;
                    const values = [pData.containerNo, pData.truckNo, pData.scanTime, pData.status, pData.image1_path];
                    const dbRes = await db.query(query, values);
                    const newScanFromDB = dbRes.rows[0];

                    console.log(`[SCAN] Data untuk ${newScanFromDB.container_no} disimpan. Memulai transaksi...`);
                    
                    // 1. Update status Server 1 (FTP Upload)
                    updateFTPStatus(1, 'uploading', `Uploading images for ${pData.containerNo}`);
                    
                    // 2. Update status Server 2 (API Call)
                    updateFTPStatus(2, 'processing', `Sending data for ${pData.containerNo}`);

                    // Siarkan scan baru ke frontend
                    io.emit('new_scan', { scan: newScanFromDB });
                    await updateSystemActivity();

                    // 3. Simulasikan proses selesai setelah beberapa detik
                    setTimeout(() => {
                        updateFTPStatus(1, 'connected', `Completed: ${pData.containerNo}`);
                        updateFTPStatus(2, 'connected', `Data received for ${pData.containerNo}`);
                    }, 4000); // Waktu simulasi 4 detik

                } catch (dbErr) {
                    console.error('Gagal menyimpan ke DB:', dbErr.stack);
                    updateFTPStatus(1, 'error', `DB Error: ${dbErr.message}`);
                    updateFTPStatus(2, 'error', `Transaction failed due to DB error`);
                }
            }
        }
        lastSize = currentSize;
    });
});


// --- Interval & Server Start (Tetap sama) ---
setInterval(updateUptime, 60000);
setInterval(updateSystemActivity, 5000);
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    updateUptime();
});