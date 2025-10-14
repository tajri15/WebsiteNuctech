require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const ini = require('ini');

const { parseLogLine } = require('./logParser');
const db = require('./db');

// --- Konfigurasi Path (Disesuaikan untuk Laptop Anda) ---
const LOG_FILE_PATH = 'C:\\Users\\ramal\\Downloads\\Proyek\\WebsiteNuctech\\server\\Transmission.log';
const CONFIG_FILE_PATH = 'C:\\Users\\ramal\\Downloads\\Proyek\\WebsiteNuctech\\server\\config.ini';
const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Membaca Konfigurasi (Logika Diperkuat) ---
let ftpConfig = {};
try {
    console.log(`🔍 Mencoba membaca konfigurasi dari: ${CONFIG_FILE_PATH}`);
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
        throw new Error(`File config.ini tidak ditemukan.`);
    }
    const configFile = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    const config = ini.parse(configFile);

    if (config?.Ftp_Server?.ip) {
        ftpConfig.server1_ip = config.Ftp_Server.ip;
    } else {
        throw new Error("Section [Ftp_Server] atau key 'ip' tidak ditemukan.");
    }

    if (config?.Http_Server?.no_conclusion_url) {
        ftpConfig.server2_ip = new URL(config.Http_Server.no_conclusion_url).hostname;
    } else {
        throw new Error("Section [Http_Server] atau key 'no_conclusion_url' tidak ditemukan.");
    }
    
    console.log('✅ Konfigurasi FTP berhasil dimuat:', ftpConfig);
} catch (error) {
    console.error(`❌ Gagal memuat config.ini, menggunakan IP fallback. Error: ${error.message}`);
    ftpConfig = { server1_ip: '10.226.62.31', server2_ip: '10.226.62.32' };
}

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- API Endpoints ---
app.get('/api/scans', async (req, res) => {
    try {
        const { page = 1, pageSize = 10, status, search } = req.query;
        const offset = (page - 1) * pageSize;

        let baseQuery = 'FROM scans';
        let whereClauses = [];
        let queryParams = [];

        if (status) {
            queryParams.push(status);
            whereClauses.push(`UPPER(status) = UPPER($${queryParams.length})`);
        }
        
        if (search) {
            queryParams.push(`%${search}%`);
            whereClauses.push(`(container_no ILIKE $${queryParams.length} OR id::text ILIKE $${queryParams.length})`);
        }
        
        if (whereClauses.length > 0) {
            baseQuery += ' WHERE ' + whereClauses.join(' AND ');
        }

        const totalQuery = `SELECT COUNT(*) ${baseQuery}`;
        const totalResult = await db.query(totalQuery, queryParams);
        const total = parseInt(totalResult.rows[0].count, 10);

        queryParams.push(pageSize);
        queryParams.push(offset);
        const dataQuery = `SELECT * ${baseQuery} ORDER BY scan_time DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
        
        const dataResult = await db.query(dataQuery, queryParams);

        res.json({ data: dataResult.rows, total: total });

    } catch (err) {
        console.error("Error fetching from /api/scans:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =======================================================================
// === API STATISTIK ===
// =======================================================================
app.get('/api/stats', async (req, res) => {
    try {
        const query = `
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'OK') AS ok,
                COUNT(*) FILTER (WHERE status = 'NOK') AS nok
            FROM scans;
        `;
        const result = await db.query(query);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error fetching from /api/stats:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =======================================================================
// === API ENDPOINT UNTUK EXPORT CSV (FIXED - RETURN FILENAME IN JSON) ===
// =======================================================================
app.get('/api/export/csv-v2', async (req, res) => {
    try {
        const { status, search, logType } = req.query;

        console.log('📊 Export CSV v2 requested with params:', { status, search, logType });

        let baseQuery = 'SELECT * FROM scans';
        let whereClauses = [];
        let queryParams = [];

        if (status && status !== 'all') {
            queryParams.push(status);
            whereClauses.push(`UPPER(status) = UPPER($${queryParams.length})`);
        } else if (logType && logType !== 'all') {
            queryParams.push(logType);
            whereClauses.push(`UPPER(status) = UPPER($${queryParams.length})`);
        }
        
        if (search) {
            queryParams.push(`%${search}%`);
            whereClauses.push(`(container_no ILIKE $${queryParams.length} OR id::text ILIKE $${queryParams.length})`);
        }
        
        if (whereClauses.length > 0) {
            baseQuery += ' WHERE ' + whereClauses.join(' AND ');
        }

        baseQuery += ' ORDER BY scan_time DESC';

        const result = await db.query(baseQuery, queryParams);
        const data = result.rows;

        console.log(`📊 Found ${data.length} records for export`);

        // Tentukan jenis log untuk nama file
        let filename;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        if (status === 'ok' || logType === 'ok') {
            filename = `scan_data_ok_${timestamp}.csv`;
        } else if (status === 'nok' || logType === 'nok') {
            filename = `scan_data_nok_${timestamp}.csv`;
        } else {
            filename = `scan_data_all_${timestamp}.csv`;
        }

        // Create CSV content
        const headers = ['NO', 'ID SCAN', 'NO. CONTAINER', 'NO. TRUCK', 'SCAN TIME', 'UPDATE TIME', 'STATUS'];
        let csvContent = headers.join(',') + '\r\n';

        data.forEach((item, index) => {
            const row = [
                index + 1,
                `"${item.id}"`,
                `"${item.container_no || '-'}"`,
                `"${item.truck_no || '-'}"`,
                `"${item.scan_time ? new Date(item.scan_time).toLocaleString('id-ID') : '-'}"`,
                `"${item.updated_at ? new Date(item.updated_at).toLocaleString('id-ID') : '-'}"`,
                `"${item.status || '-'}"`
            ];
            csvContent += row.join(',') + '\r\n';
        });

        // Force download dengan nama yang benar
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);

        console.log(`✅ CSV v2 export successful: ${filename}`);

    } catch (err) {
        console.error("❌ Error exporting to CSV v2:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =======================================================================
// === API UNTUK MENGAMBIL GAMBAR ===
// =======================================================================
app.use('/images', express.static(path.join(__dirname, 'images')));

// =======================================================================
// === API HEALTH CHECK ===
// =======================================================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// --- Koneksi WebSocket ---
io.on('connection', (socket) => {
    console.log(`🔌 Pengguna terhubung: ${socket.id}`);
    socket.on('disconnect', () => console.log(`🔌 Pengguna terputus: ${socket.id}`));
});

// --- SIMPLE CATCH-ALL ROUTE UNTUK REACT APP ---
app.get('/', (req, res) => {
    res.json({ 
        message: 'Backend server is running!',
        instructions: 'Frontend should be running on http://localhost:3000',
        endpoints: {
            scans: '/api/scans',
            stats: '/api/stats',
            export: '/api/export/csv',
            health: '/api/health'
        }
    });
});

// --- Log File Watcher ---
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`❌ KRITIS: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
    process.exit(1); 
}

console.log(`👀 Memantau perubahan pada file: ${LOG_FILE_PATH}`);
let lastSize = fs.statSync(LOG_FILE_PATH).size;

chokidar.watch(LOG_FILE_PATH, { usePolling: true, interval: 500 }).on('change', (filePath) => {
    try {
        const stats = fs.statSync(filePath);
        const currentSize = stats.size;
        if (currentSize <= lastSize) {
            lastSize = currentSize;
            return;
        }
    
        const stream = fs.createReadStream(filePath, { start: lastSize, end: currentSize, encoding: 'utf-8' });
    
        stream.on('data', (buffer) => {
            const lines = buffer.toString().trim().split(/\r?\n/);
            lines.forEach(async (line) => {
                if (!line) return;
                const parsed = parseLogLine(line);
                if (parsed.type === 'SCAN') {
                    try {
                        const pData = parsed.data;
                        const query = `INSERT INTO scans(container_no, truck_no, scan_time, status, image1_path, image2_path, image3_path, image4_path) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
                        const values = [pData.containerNo, pData.truckNo, pData.scanTime, pData.status, pData.image1_path, pData.image2_path, pData.image3_path, pData.image4_path];
                        
                        const dbRes = await db.query(query, values);
                        const newScanFromDB = dbRes.rows[0];
    
                        console.log(`✅ [DB] SUKSES! Data untuk ${newScanFromDB.container_no} disimpan.`);
                        io.emit('new_scan', newScanFromDB); 
                        
                    } catch (dbErr) {
                        console.error('❌ [DB] GAGAL menyimpan ke DB:', dbErr.stack);
                    }
                }
            });
        });
        lastSize = currentSize;
    } catch (err) {
        console.error("❌ Error saat memproses file log:", err);
    }
});

// =======================================================================
// === ERROR HANDLING MIDDLEWARE ===
// =======================================================================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: err.message 
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    console.log(`📊 API Endpoints:`);
    console.log(`   GET  /api/scans - Mendapatkan data scans`);
    console.log(`   GET  /api/stats - Mendapatkan statistik`);
    console.log(`   GET  /api/export/csv - Export data ke CSV`);
    console.log(`   GET  /api/health - Health check`);
    console.log(`   WS   / - WebSocket untuk real-time updates`);
    console.log(`\n📱 Frontend harus dijalankan terpisah di http://localhost:3000`);
});