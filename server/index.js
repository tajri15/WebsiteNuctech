require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const chokidar = require('chokidar');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const ini = require('ini');
const axios = require('axios');

const { parseLogLine } = require('./logParser');
const db = require('./db');

// --- Konfigurasi Path ---
const LOG_FILE_PATH = '\\\\192.111.111.80\\logs\\Transmission.log';
const CONFIG_FILE_PATH = '\\\\192.111.111.80\\logs\\config.ini';
const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Simpan waktu start server (harus di atas calculateUptime)
let serverStartTime = new Date();

// --- Membaca Konfigurasi ---
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
const imageFolderPath = '\\\\192.111.111.80\\Image';
app.use('/images', express.static(imageFolderPath));
console.log(`🖼️  Menyajikan gambar dari folder: ${imageFolderPath}`);

// =======================================================================
// === HELPER FUNCTIONS ===
// =======================================================================

function calculateUptime() {
    const diff = new Date() - new Date(serverStartTime);
    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${days} days ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

// Helper validasi format container (digunakan oleh API validasi)
function validateContainerFormat(containerNo) {
    if (!containerNo || containerNo.trim() === '' ||
        containerNo.toUpperCase().includes('SCAN FAILED') ||
        containerNo.toUpperCase().includes('FAILED')) {
        return { isValid: false, reason: 'empty_or_failed' };
    }
    const singlePattern = /^[A-Z]{4}\d{7}$/;
    const doublePattern  = /^[A-Z]{4}\d{7}\/[A-Z]{4}\d{7}$/;
    const trimmed = containerNo.trim().toUpperCase();
    if (singlePattern.test(trimmed) || doublePattern.test(trimmed)) {
        return { isValid: true, reason: 'valid' };
    }
    return { isValid: false, reason: 'invalid_format' };
}

// =======================================================================
// === API ENDPOINTS ===
// =======================================================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        uptime: calculateUptime(),
        activeConnections: io.engine.clientsCount,
        version: '1.0.0'
    });
});

// --- GET Scans (pagination + filter) ---
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
            whereClauses.push(`(container_no ILIKE $${queryParams.length} OR id_scan ILIKE $${queryParams.length} OR id::text ILIKE $${queryParams.length})`);
        }
        if (whereClauses.length > 0) baseQuery += ' WHERE ' + whereClauses.join(' AND ');

        const totalResult = await db.query(`SELECT COUNT(*) ${baseQuery}`, queryParams);
        const total = parseInt(totalResult.rows[0].count, 10);

        queryParams.push(pageSize);
        queryParams.push(offset);
        const dataResult = await db.query(
            `SELECT * ${baseQuery} ORDER BY scan_time DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
            queryParams
        );

        res.json({ success: true, data: dataResult.rows, total, page: parseInt(page), pageSize: parseInt(pageSize), totalPages: Math.ceil(total / pageSize) });
    } catch (err) {
        console.error("❌ /api/scans:", err);
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- RESEND ke MTI ---
app.post('/api/scans/:id/resend', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🔄 Resend scan ID: ${id}`);

        const result = await db.query('SELECT * FROM scans WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Scan not found' });

        const scanData = result.rows[0];
        if (scanData.status !== 'OK') return res.status(400).json({ success: false, message: 'Resend hanya bisa untuk data dengan status OK' });

        const mtiPayload = {
            resultCode: true,
            resultDesc: "",
            resultData: {
                IDX: scanData.id,
                ID: scanData.id_scan || `scan-${scanData.id}`,
                PICNO: scanData.id_scan,
                PATH: "/62001FS03/2025/1015/0304/",
                SCANTIME: scanData.scan_time,
                IMAGEFOLDER: new Date(scanData.scan_time).getTime(),
                TIME_VEH_ENTER: Math.floor(Date.now() / 1000) - 300,
                TIME_SCANSTART: Math.floor(Date.now() / 1000) - 240,
                TIME_SCAN_STOP: Math.floor(Date.now() / 1000) - 180,
                CONTAINER_NO: scanData.container_no,
                FYCO_PRESENT: scanData.truck_no || "0000000",
                WORKFLOW: "",
                UPDATE_TIME: new Date().toISOString().replace('T', ' ').substring(0, 19),
                RESPON_TPKS_API: "OK",
                IMAGE1_PATH: scanData.image1_path || "",
                IMAGE2_PATH: scanData.image2_path || "",
                IMAGE3_PATH: scanData.image3_path || "",
                IMAGE4_PATH: scanData.image4_path || "",
                IMAGE5_PATH: scanData.image5_path || "",
                IMAGE6_PATH: scanData.image6_path || "",
                IMAGE7_PATH: "",
                SCANTIME_START: "",
                SCANTIME_END: ""
            }
        };

        const mtiServerUrl = `http://${ftpConfig.server2_ip || '10.226.62.32'}:8040/services/xRaySby/out`;
        const response = await axios.post(mtiServerUrl, mtiPayload, { timeout: 10000, headers: { 'Content-Type': 'application/json' } });

        await db.query(`UPDATE scans SET resend_count = COALESCE(resend_count, 0) + 1, last_resend_time = NOW(), resend_status = 'SUCCESS' WHERE id = $1`, [id]);

        io.emit('resend_success', { scanId: id, containerNo: scanData.container_no, timestamp: new Date().toISOString(), response: response.data });

        res.json({ success: true, message: 'Data berhasil dikirim ulang ke server MTI', scanId: id, containerNo: scanData.container_no, mtiResponse: response.data });
    } catch (err) {
        console.error("❌ resend:", err);
        if (req.params.id) {
            try { await db.query(`UPDATE scans SET resend_status = 'FAILED', error_message = $1 WHERE id = $2`, [err.message, req.params.id]); } catch (e) {}
        }
        io.emit('resend_failed', { scanId: req.params.id, error: err.message, timestamp: new Date().toISOString() });
        res.status(500).json({ success: false, error: 'Gagal mengirim ulang data', message: err.message, details: err.response?.data || 'Tidak ada response dari server MTI' });
    }
});

// --- Stats Basic ---
app.get('/api/stats', async (req, res) => {
    try {
        const result = await db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'OK') AS ok, COUNT(*) FILTER (WHERE status = 'NOK') AS nok FROM scans`);
        const total = parseInt(result.rows[0].total);
        const ok    = parseInt(result.rows[0].ok);
        res.json({ success: true, ...result.rows[0], successRate: total > 0 ? parseFloat(((ok / total) * 100).toFixed(1)) : 0 });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Stats Daily ---
app.get('/api/stats/daily', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DATE(scan_time) as date,
                   COUNT(*) as total_count,
                   COUNT(*) FILTER (WHERE status = 'OK') as ok_count,
                   COUNT(*) FILTER (WHERE status = 'NOK') as nok_count
            FROM scans
            WHERE scan_time >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(scan_time)
            ORDER BY date DESC
            LIMIT 30
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Stats Summary ---
app.get('/api/stats/summary', async (req, res) => {
    try {
        const [totalR, todayR, weekR, monthR] = await Promise.all([
            db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='OK') AS ok, COUNT(*) FILTER (WHERE status='NOK') AS nok FROM scans`),
            db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='OK') AS ok, COUNT(*) FILTER (WHERE status='NOK') AS nok FROM scans WHERE DATE(scan_time)=CURRENT_DATE`),
            db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='OK') AS ok, COUNT(*) FILTER (WHERE status='NOK') AS nok FROM scans WHERE scan_time>=DATE_TRUNC('week',CURRENT_DATE)`),
            db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='OK') AS ok, COUNT(*) FILTER (WHERE status='NOK') AS nok FROM scans WHERE scan_time>=DATE_TRUNC('month',CURRENT_DATE)`)
        ]);
        const total = parseInt(totalR.rows[0].total);
        const ok    = parseInt(totalR.rows[0].ok);
        res.json({
            overall: { total, ok, nok: parseInt(totalR.rows[0].nok) },
            today:   { total: parseInt(todayR.rows[0].total), ok: parseInt(todayR.rows[0].ok), nok: parseInt(todayR.rows[0].nok) },
            week:    { total: parseInt(weekR.rows[0].total),  ok: parseInt(weekR.rows[0].ok),  nok: parseInt(weekR.rows[0].nok) },
            month:   { total: parseInt(monthR.rows[0].total), ok: parseInt(monthR.rows[0].ok), nok: parseInt(monthR.rows[0].nok) },
            successRate: total > 0 ? parseFloat(((ok / total) * 100).toFixed(1)) : 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Initial Data (Overview) ---
app.get('/api/initial-data', async (req, res) => {
    try {
        const statsResult = await db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='OK') AS ok, COUNT(*) FILTER (WHERE status='NOK') AS nok FROM scans`);
        const stats = statsResult.rows[0];
        const recentScans = (await db.query(`SELECT * FROM scans ORDER BY scan_time DESC LIMIT 10`)).rows;
        const successRate = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) + '%' : '0%';

        res.json({
            success: true,
            stats,
            recentScans,
            systemState: {
                ftpServer1: { name: 'FTP Server 1', status: 'connected', lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Connected and monitoring log files', ip: ftpConfig.server1_ip || '10.226.62.31' },
                ftpServer2: { name: 'FTP Server 2', status: 'standby',   lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Standby - Ready for failover',       ip: ftpConfig.server2_ip || '10.226.62.32' }
            },
            systemActivity: {
                uptime: calculateUptime(), lastUpdate: new Date().toLocaleTimeString('id-ID'),
                activeConnections: io.engine.clientsCount, logFiles: 'Active - Transmission.log',
                totalScans: parseInt(stats.total), successfulScans: parseInt(stats.ok),
                failedScans: parseInt(stats.nok), successRate
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Config ---
app.get('/api/config', (req, res) => {
    try {
        res.json({
            success: true,
            logFilePath: LOG_FILE_PATH,
            imageFolderPath: path.join(__dirname, 'images'),
            ftpServer: { ip: ftpConfig.server1_ip || '10.226.62.31', status: 'connected', description: 'FTP Server untuk upload gambar', type: 'FTP', activities: ['Upload gambar container', 'File transfer'] },
            apiServer: { ip: ftpConfig.server2_ip || '10.226.62.32', status: 'standby',   description: 'API Server untuk menerima data JSON', type: 'HTTP API', activities: ['Menerima data scan', 'Processing JSON', 'Response status'] },
            databaseHost: process.env.DB_HOST || 'localhost',
            databasePort: process.env.DB_PORT || '5432',
            databaseName: process.env.DB_NAME || 'nuctech_db',
            databaseUser: process.env.DB_USER || 'postgres',
            serverPort: PORT,
            serverEnvironment: process.env.NODE_ENV || 'development',
            serverUptime: calculateUptime(),
            serverStartTime: serverStartTime.toLocaleString('id-ID'),
            logMonitoring: fs.existsSync(LOG_FILE_PATH) ? 'Active' : 'Inactive',
            logFileSize: fs.existsSync(LOG_FILE_PATH) ? `${(fs.statSync(LOG_FILE_PATH).size / 1024 / 1024).toFixed(2)} MB` : 'File not found',
            websocketConnections: io.engine.clientsCount,
            activeProcesses: 'Log Monitoring, WebSocket, API Server'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Update Config ---
app.put('/api/config/update', async (req, res) => {
    try {
        const { setting, value } = req.body;
        res.json({ success: true, message: `Configuration ${setting} updated successfully`, updatedSetting: setting, newValue: value, timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Export CSV ---
app.get('/api/export/csv-v2', async (req, res) => {
    try {
        const { status, search, logType } = req.query;
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
            whereClauses.push(`(container_no ILIKE $${queryParams.length} OR id_scan ILIKE $${queryParams.length} OR id::text ILIKE $${queryParams.length})`);
        }
        if (whereClauses.length > 0) baseQuery += ' WHERE ' + whereClauses.join(' AND ');
        baseQuery += ' ORDER BY scan_time DESC';

        const data = (await db.query(baseQuery, queryParams)).rows;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        let filename = `scan_data_all_${timestamp}.csv`;
        if (status === 'ok' || logType === 'ok') filename = `scan_data_ok_${timestamp}.csv`;
        else if (status === 'nok' || logType === 'nok') filename = `scan_data_nok_${timestamp}.csv`;

        let csvContent = 'NO,ID SCAN,NO. CONTAINER,NO. TRUCK,SCAN TIME,UPDATE TIME,STATUS,IMAGE1_PATH,IMAGE2_PATH,IMAGE3_PATH,IMAGE4_PATH\r\n';
        data.forEach((item, i) => {
            csvContent += [
                i + 1,
                `"${item.id_scan || item.id}"`,
                `"${item.container_no || '-'}"`,
                `"${item.truck_no || '-'}"`,
                `"${item.scan_time ? new Date(item.scan_time).toLocaleString('id-ID') : '-'}"`,
                `"${item.updated_at ? new Date(item.updated_at).toLocaleString('id-ID') : '-'}"`,
                `"${item.status || '-'}"`,
                `"${item.image1_path || '-'}"`,
                `"${item.image2_path || '-'}"`,
                `"${item.image3_path || '-'}"`,
                `"${item.image4_path || '-'}"`
            ].join(',') + '\r\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- Gambar static tambahan ---
app.use('/images', express.static(path.join(__dirname, 'images')));

// --- GET Scan Detail ---
app.get('/api/scans/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM scans WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Scan not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// --- DELETE Scan ---
app.delete('/api/scans/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM scans WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Scan not found' });
        io.emit('scan_deleted', { id: req.params.id });
        res.json({ success: true, message: 'Scan deleted successfully', deletedScan: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// =======================================================================
// === API CONTAINER VALIDATION (BARU) ===
// =======================================================================

// GET data validasi container
app.get('/api/container-validation', async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        let baseQuery = `
            SELECT id, id_scan, container_no, truck_no, scan_time, status,
                   image1_path, image2_path, image3_path, image4_path,
                   image5_path, image6_path, image7_path, image8_path
            FROM scans
        `;
        let whereClauses = [];
        let queryParams  = [];

        if (startDate && endDate) {
            queryParams.push(startDate, endDate);
            whereClauses.push(`scan_time BETWEEN $${queryParams.length - 1} AND $${queryParams.length}`);
        }
        if (status) {
            queryParams.push(status);
            whereClauses.push(`UPPER(status) = UPPER($${queryParams.length})`);
        }
        if (whereClauses.length > 0) baseQuery += ' WHERE ' + whereClauses.join(' AND ');
        baseQuery += ' ORDER BY scan_time DESC';

        const result = await db.query(baseQuery, queryParams);
        res.json({ success: true, data: result.rows, total: result.rows.length });
    } catch (err) {
        console.error("❌ /api/container-validation:", err);
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// GET statistik validasi container
app.get('/api/container-validation/statistics', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter  = '';
        let queryParams = [];
        if (startDate && endDate) {
            queryParams.push(startDate, endDate);
            dateFilter = `WHERE scan_time BETWEEN $1 AND $2`;
        }

        const result = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(CASE
                    WHEN container_no IS NOT NULL AND container_no != ''
                    AND container_no NOT ILIKE '%scan failed%'
                    AND container_no NOT ILIKE '%failed%'
                    AND (container_no ~ '^[A-Z]{4}[0-9]{7}$'
                         OR container_no ~ '^[A-Z]{4}[0-9]{7}/[A-Z]{4}[0-9]{7}$')
                    THEN 1 END) as valid,
                COUNT(CASE
                    WHEN container_no IS NULL OR container_no = ''
                    OR container_no ILIKE '%scan failed%'
                    OR container_no ILIKE '%failed%'
                    OR (container_no !~ '^[A-Z]{4}[0-9]{7}$'
                        AND container_no !~ '^[A-Z]{4}[0-9]{7}/[A-Z]{4}[0-9]{7}$')
                    THEN 1 END) as invalid
            FROM scans ${dateFilter}
        `, queryParams);

        const total = parseInt(result.rows[0].total);
        const valid = parseInt(result.rows[0].valid);
        res.json({
            success: true,
            statistics: {
                total,
                valid,
                invalid: total - valid,
                validPercentage: total > 0 ? parseFloat(((valid / total) * 100).toFixed(2)) : 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// POST validasi container (single) via OCR
app.post('/api/validate-container-ocr', async (req, res) => {
    try {
        const { containerId } = req.body;
        const result = await db.query(
            `SELECT id, container_no, image1_path, image2_path, image3_path,
                    image4_path, image5_path, image6_path, image7_path, image8_path
             FROM scans WHERE id = $1`,
            [containerId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Container not found' });

        const container = result.rows[0];
        const images = [
            container.image1_path, container.image2_path, container.image3_path,
            container.image4_path, container.image5_path, container.image6_path,
            container.image7_path, container.image8_path
        ].filter(Boolean);

        const isValid = validateContainerFormat(container.container_no);
        res.json({ success: true, containerId: container.id, containerNo: container.container_no, isValid: isValid.isValid, reason: isValid.reason, imageCount: images.length, images });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// =======================================================================
// === DEBUG ENDPOINTS ===
// =======================================================================

app.get('/api/debug/db-schema', async (req, res) => {
    try {
        const result = await db.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'scans' ORDER BY ordinal_position`);
        res.json({ success: true, columns: result.rows, totalColumns: result.rows.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/debug/recent-scans', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM scans ORDER BY scan_time DESC LIMIT 5`);
        res.json({ success: true, scans: result.rows, total: result.rows.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/debug/fix-schema', async (req, res) => {
    try {
        await db.query(`
            ALTER TABLE scans
            ADD COLUMN IF NOT EXISTS error_message    TEXT,
            ADD COLUMN IF NOT EXISTS id_scan          VARCHAR(100),
            ADD COLUMN IF NOT EXISTS resend_count     INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_resend_time TIMESTAMP,
            ADD COLUMN IF NOT EXISTS resend_status    VARCHAR(20),
            ADD COLUMN IF NOT EXISTS image5_path      TEXT,
            ADD COLUMN IF NOT EXISTS image6_path      TEXT,
            ADD COLUMN IF NOT EXISTS image7_path      TEXT,
            ADD COLUMN IF NOT EXISTS image8_path      TEXT
        `);
        res.json({ success: true, message: 'Schema checked/fixed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =======================================================================
// === WEBSOCKET ===
// =======================================================================

io.on('connection', (socket) => {
    console.log(`🔌 Pengguna terhubung: ${socket.id}`);
    io.emit('system_activity_update', { activeConnections: io.engine.clientsCount, lastUpdate: new Date().toLocaleTimeString('id-ID') });

    socket.on('disconnect', () => {
        console.log(`🔌 Pengguna terputus: ${socket.id}`);
        io.emit('system_activity_update', { activeConnections: io.engine.clientsCount, lastUpdate: new Date().toLocaleTimeString('id-ID') });
    });
});

// =======================================================================
// === LOG FILE WATCHER ===
// =======================================================================

if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`❌ KRITIS: File log tidak ditemukan: ${LOG_FILE_PATH}`);
    console.log('⚠️  Server tetap berjalan tanpa file log monitoring');
} else {
    console.log(`👀 Memantau: ${LOG_FILE_PATH}`);
    let lastSize = fs.statSync(LOG_FILE_PATH).size;

    const watcher = chokidar.watch(LOG_FILE_PATH, { usePolling: true, interval: 500, persistent: true, ignoreInitial: true });

    watcher.on('change', async (filePath) => {
        try {
            const currentSize = fs.statSync(filePath).size;
            if (currentSize <= lastSize) { lastSize = currentSize; return; }

            const stream = fs.createReadStream(filePath, { start: lastSize, end: currentSize, encoding: 'utf-8' });
            let bufferData = '';
            stream.on('data', (chunk) => { bufferData += chunk; });

            stream.on('end', async () => {
                try {
                    if (!bufferData.trim()) { lastSize = currentSize; return; }
                    const lines = bufferData.split(/\r?\n/).filter(l => l.trim());

                    for (const line of lines) {
                        try {
                            const parsed = parseLogLine(line);
                            if (parsed.type === 'SCAN') {
                                const pData = parsed.data;
                                try {
                                    const dbRes = await db.query(
                                        `INSERT INTO scans(id_scan,container_no,truck_no,scan_time,status,image1_path,image2_path,image3_path,image4_path,image5_path,image6_path)
                                         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
                                        [pData.idScan, pData.containerNo, pData.truckNo, pData.scanTime, pData.status,
                                         pData.image1_path, pData.image2_path, pData.image3_path, pData.image4_path,
                                         pData.image5_path || null, pData.image6_path || null]
                                    );
                                    const newScan = dbRes.rows[0];
                                    console.log(`✅ Scan saved: ID ${newScan.id}, Container: ${newScan.container_no}`);
                                    io.emit('new_scan', newScan);

                                    const [tr, ok, nok] = await Promise.all([
                                        db.query('SELECT COUNT(*) FROM scans'),
                                        db.query(`SELECT COUNT(*) FROM scans WHERE status='OK'`),
                                        db.query(`SELECT COUNT(*) FROM scans WHERE status='NOK'`)
                                    ]);
                                    io.emit('stats_update', { total: parseInt(tr.rows[0].count), ok: parseInt(ok.rows[0].count), nok: parseInt(nok.rows[0].count) });

                                    io.emit('api_update', {
                                        apiServer: { status: 'processing', lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Processing JSON data from scan', ip: ftpConfig.server2_ip, type: 'HTTP API', currentActivity: 'Memproses data JSON scan' },
                                        ftpServer: { status: 'connected',  lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Ready for next upload',            ip: ftpConfig.server1_ip, type: 'FTP',      currentActivity: 'Siap upload berikutnya' }
                                    });
                                    setTimeout(() => {
                                        io.emit('api_update', {
                                            apiServer: { status: 'standby',   lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Ready to receive JSON data', ip: ftpConfig.server2_ip, type: 'HTTP API', currentActivity: 'Menunggu data JSON' },
                                            ftpServer: { status: 'connected', lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Monitoring for uploads',      ip: ftpConfig.server1_ip, type: 'FTP',      currentActivity: 'Monitoring upload' }
                                        });
                                    }, 2000);
                                } catch (dbErr) {
                                    if (dbErr.message.includes('column') && dbErr.message.includes('does not exist')) {
                                        try {
                                            const fb = await db.query(
                                                `INSERT INTO scans(id_scan,container_no,truck_no,scan_time,status,image1_path,image2_path,image3_path,image4_path)
                                                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                                                [pData.idScan, pData.containerNo, pData.truckNo, pData.scanTime, pData.status,
                                                 pData.image1_path, pData.image2_path, pData.image3_path, pData.image4_path]
                                            );
                                            io.emit('new_scan', fb.rows[0]);
                                        } catch (fbErr) { console.error('❌ Fallback failed:', fbErr); }
                                    }
                                }
                            } else if (parsed.type === 'FTP_UPLOAD') {
                                io.emit('ftp_update', {
                                    ftpServer: { status: 'uploading', lastActivity: new Date().toLocaleTimeString('id-ID'), details: `Uploading ${parsed.data.file}`, ip: parsed.data.ip, type: 'FTP', currentActivity: 'Mengupload file gambar' },
                                    apiServer: { status: 'standby',   lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Ready to receive JSON data',   ip: ftpConfig.server2_ip, type: 'HTTP API', currentActivity: 'Menunggu data JSON' }
                                });
                                setTimeout(() => {
                                    io.emit('ftp_update', {
                                        ftpServer: { status: 'connected', lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Upload completed',           ip: ftpConfig.server1_ip, type: 'FTP', currentActivity: 'Upload selesai' },
                                        apiServer: { status: 'standby',   lastActivity: new Date().toLocaleTimeString('id-ID'), details: 'Ready to receive JSON data', ip: ftpConfig.server2_ip, type: 'HTTP API', currentActivity: 'Menunggu data JSON' }
                                    });
                                }, 3000);
                            }
                        } catch (lineErr) { console.error('❌ Line error:', lineErr); }
                    }
                    lastSize = currentSize;
                } catch (processErr) { console.error('❌ Process error:', processErr); }
            });

            stream.on('error', (e) => { console.error('❌ Stream error:', e); lastSize = currentSize; });
        } catch (err) {
            console.error("❌ Watcher change error:", err);
            try { lastSize = fs.statSync(filePath).size; } catch (e) {}
        }
    });

    watcher.on('add',   (f) => { try { lastSize = fs.statSync(f).size; } catch (e) {} });
    watcher.on('error', (e) => console.error('❌ Watcher error:', e));
    console.log(`✅ Log file watcher aktif`);
}

// =======================================================================
// === BASIC ROUTES ===
// =======================================================================

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Nuctech Transmission Dashboard Backend Server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: 'GET /api/health',
            scans: 'GET /api/scans', scanDetail: 'GET /api/scans/:id',
            resend: 'POST /api/scans/:id/resend', deleteScan: 'DELETE /api/scans/:id',
            stats: 'GET /api/stats', statsDaily: 'GET /api/stats/daily', statsSummary: 'GET /api/stats/summary',
            initialData: 'GET /api/initial-data', config: 'GET /api/config', updateConfig: 'PUT /api/config/update',
            export: 'GET /api/export/csv-v2', images: 'GET /images/*',
            containerValidation: 'GET /api/container-validation',
            containerValidationStats: 'GET /api/container-validation/statistics',
            validateOcr: 'POST /api/validate-container-ocr',
            debug: { dbSchema: 'GET /api/debug/db-schema', recentScans: 'GET /api/debug/recent-scans', fixSchema: 'POST /api/debug/fix-schema' }
        }
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found', message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error', message: err.message });
});

// =======================================================================
// === SERVER STARTUP ===
// =======================================================================

server.listen(PORT, () => {
    console.log(`\n🚀 ==========================================`);
    console.log(`🚀 Nuctech Transmission Dashboard Server`);
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`🚀 Start : ${serverStartTime.toLocaleString('id-ID')}`);
    console.log(`📊 ==========================================`);
    console.log(`📊 API Endpoints (Existing):`);
    console.log(`📊   GET    /api/health`);
    console.log(`📊   GET    /api/scans`);
    console.log(`📊   GET    /api/scans/:id`);
    console.log(`📊   POST   /api/scans/:id/resend`);
    console.log(`📊   DELETE /api/scans/:id`);
    console.log(`📊   GET    /api/stats`);
    console.log(`📊   GET    /api/stats/daily`);
    console.log(`📊   GET    /api/stats/summary`);
    console.log(`📊   GET    /api/initial-data`);
    console.log(`📊   GET    /api/config`);
    console.log(`📊   PUT    /api/config/update`);
    console.log(`📊   GET    /api/export/csv-v2`);
    console.log(`📊   GET    /images/*`);
    console.log(`📊 ==========================================`);
    console.log(`✅ API Endpoints (Container Validation - NEW):`);
    console.log(`✅   GET    /api/container-validation`);
    console.log(`✅   GET    /api/container-validation/statistics`);
    console.log(`✅   POST   /api/validate-container-ocr`);
    console.log(`📊 ==========================================`);
    console.log(`📊 Debug Endpoints:`);
    console.log(`📊   GET    /api/debug/db-schema`);
    console.log(`📊   GET    /api/debug/recent-scans`);
    console.log(`📊   POST   /api/debug/fix-schema`);
    console.log(`👀 Log monitoring: ${fs.existsSync(LOG_FILE_PATH) ? 'AKTIF ✅' : 'NON-AKTIF ⚠️'}`);
    console.log(`==========================================\n`);
});

process.on('SIGINT',  () => { console.log('\n🛑 Shutdown...'); server.close(() => { console.log('✅ Server berhenti'); process.exit(0); }); });
process.on('SIGTERM', () => { console.log('\n🛑 Shutdown...'); server.close(() => { console.log('✅ Server berhenti'); process.exit(0); }); });

module.exports = app;