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

// Simpan waktu start server
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
app.use(express.json({ limit: '50mb' }));
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

// Validasi format container
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

// Hitung Levenshtein distance untuk perbandingan string
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i-1) === a.charAt(j-1)) {
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i-1][j-1] + 1,
                    matrix[i][j-1] + 1,
                    matrix[i-1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 100;
    const distance = levenshteinDistance(longer, shorter);
    return ((longer.length - distance) / longer.length) * 100;
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

        let csvContent = 'NO,ID SCAN,NO. CONTAINER,NO. TRUCK,SCAN TIME,UPDATE TIME,STATUS,VALIDATION_STATUS,CONFIDENCE,IMAGE1_PATH,IMAGE2_PATH,IMAGE3_PATH,IMAGE4_PATH\r\n';
        data.forEach((item, i) => {
            csvContent += [
                i + 1,
                `"${item.id_scan || item.id}"`,
                `"${item.container_no || '-'}"`,
                `"${item.truck_no || '-'}"`,
                `"${item.scan_time ? new Date(item.scan_time).toLocaleString('id-ID') : '-'}"`,
                `"${item.updated_at ? new Date(item.updated_at).toLocaleString('id-ID') : '-'}"`,
                `"${item.status || '-'}"`,
                `"${item.validation_status || 'UNKNOWN'}"`,
                `"${item.validation_confidence || '0'}%"`,
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
// === API CONTAINER VALIDATION (DENGAN AUTO DETECT) ===
// =======================================================================

// GET data validasi container
app.get('/api/container-validation', async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        // CEK DULU apakah kolom id_scan ada
        const checkColumn = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'scans' AND column_name = 'id_scan'
        `);
        
        const hasIdScan = checkColumn.rows.length > 0;
        
        // Pilih kolom berdasarkan yang tersedia
        let selectColumns;
        if (hasIdScan) {
            selectColumns = `id, id_scan, container_no, truck_no, scan_time, status,
                             image1_path, image2_path, image3_path, image4_path,
                             image5_path, image6_path, image7_path, image8_path,
                             validation_status, validation_confidence, image_text_detected,
                             manual_validated, manual_validation_time, original_ocr_result`;
        } else {
            selectColumns = `id, id as id_scan, container_no, truck_no, scan_time, status,
                             image1_path, image2_path, image3_path, image4_path,
                             image5_path, image6_path, image7_path, image8_path,
                             validation_status, validation_confidence, image_text_detected,
                             manual_validated, manual_validation_time, original_ocr_result`;
        }
        
        let baseQuery = `SELECT ${selectColumns} FROM scans`;
        let whereClauses = [];
        let queryParams = [];

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
        
        // Enrich data dengan validasi format
        const enriched = result.rows.map(item => {
            const validation = validateContainerFormat(item.container_no);
            const images = [
                item.image1_path, item.image2_path, item.image3_path,
                item.image4_path, item.image5_path, item.image6_path,
                item.image7_path, item.image8_path
            ].filter(Boolean);
            
            return {
                ...item,
                isValid: validation.isValid,
                validationReason: validation.reason,
                confidence: validation.isValid ? 95 : 0,
                images,
                // Status validasi gambar
                imageValidationStatus: item.validation_status || 'UNCHECKED',
                imageValidationConfidence: item.validation_confidence || 0,
                imageTextDetected: item.image_text_detected || null
            };
        });
        
        res.json({ success: true, data: enriched, total: enriched.length });
    } catch (err) {
        console.error("❌ /api/container-validation:", err);
        res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
});

// API untuk menyimpan hasil validasi gambar (dari Tesseract.js)
app.post('/api/update-validation-result', async (req, res) => {
    try {
        const { scanId, imageText, isMatch, similarity } = req.body;
        
        console.log(`📝 Updating validation result for scan ${scanId}:`);
        console.log(`   - OCR Database: ${req.body.ocrResult || 'N/A'}`);
        console.log(`   - Text from Image: ${imageText}`);
        console.log(`   - Match: ${isMatch ? 'YES' : 'NO'}, Similarity: ${similarity}%`);
        
        const validationStatus = isMatch ? 'MATCH' : 'MISMATCH';
        
        await db.query(
            `UPDATE scans 
             SET image_text_detected = $1,
                 validation_confidence = $2,
                 validation_status = $3,
                 validation_time = NOW()
             WHERE id = $4`,
            [imageText, similarity, validationStatus, scanId]
        );
        
        res.json({ 
            success: true, 
            message: isMatch ? 'Container number matches image' : 'Container number does not match image',
            validationStatus,
            similarity 
        });
        
    } catch (err) {
        console.error('❌ Error updating validation result:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API untuk validasi manual (user menginput nomor container yang benar)
app.post('/api/manual-container-validation', async (req, res) => {
    try {
        const { scanId, correctContainerNo } = req.body;
        
        // Ambil data lama dulu
        const oldData = await db.query('SELECT container_no FROM scans WHERE id = $1', [scanId]);
        const oldContainerNo = oldData.rows[0]?.container_no;
        
        // Update database dengan nomor container yang benar
        const result = await db.query(
            `UPDATE scans 
             SET container_no = $1,
                 manual_validated = true,
                 manual_validation_time = NOW(),
                 original_ocr_result = $2,
                 validation_status = 'MANUAL_FIX',
                 validation_confidence = 100
             WHERE id = $3
             RETURNING *`,
            [correctContainerNo.toUpperCase(), oldContainerNo, scanId]
        );
        
        console.log(`✏️ Manual validation for scan ${scanId}:`);
        console.log(`   - Old: ${oldContainerNo}`);
        console.log(`   - New: ${correctContainerNo.toUpperCase()}`);
        
        res.json({
            success: true,
            message: 'Container number updated successfully',
            data: result.rows[0]
        });
        
    } catch (err) {
        console.error('❌ Error manual validation:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error',
            message: err.message 
        });
    }
});

// API untuk get statistik validasi
app.get('/api/container-validation/statistics', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = '';
        let queryParams = [];
        
        if (startDate && endDate) {
            queryParams.push(startDate, endDate);
            dateFilter = `WHERE scan_time BETWEEN $1 AND $2`;
        }
        
        const result = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN validation_status = 'MATCH' THEN 1 END) as match_count,
                COUNT(CASE WHEN validation_status = 'MISMATCH' THEN 1 END) as mismatch_count,
                COUNT(CASE WHEN validation_status = 'MANUAL_FIX' THEN 1 END) as manual_fix_count,
                COUNT(CASE WHEN validation_status IS NULL THEN 1 END) as unchecked_count,
                AVG(CASE WHEN validation_confidence IS NOT NULL THEN validation_confidence ELSE 0 END) as avg_confidence
            FROM scans ${dateFilter}
        `, queryParams);
        
        res.json({
            success: true,
            statistics: result.rows[0]
        });
        
    } catch (err) {
        console.error('❌ Error getting validation statistics:', err);
        res.status(500).json({ success: false, error: err.message });
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
            ADD COLUMN IF NOT EXISTS image8_path      TEXT,
            ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20),
            ADD COLUMN IF NOT EXISTS validation_confidence DECIMAL(5,2),
            ADD COLUMN IF NOT EXISTS validation_time TIMESTAMP,
            ADD COLUMN IF NOT EXISTS image_text_detected TEXT,
            ADD COLUMN IF NOT EXISTS manual_validated BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS manual_validation_time TIMESTAMP,
            ADD COLUMN IF NOT EXISTS original_ocr_result VARCHAR(50)
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
                            if (parsed && parsed.type === 'SCAN') {
                                const pData = parsed.data;
                                
                                try {
                                    const checkExisting = await db.query(
                                        'SELECT id, scan_time, created_at FROM scans WHERE id_scan = $1',
                                        [pData.idScan]
                                    );

                                    // Jika data sudah ada
                                    if (checkExisting.rows.length > 0) {
                                        const existingData = checkExisting.rows[0];
                                        const existingTime = new Date(existingData.scan_time);
                                        const newTime = new Date(pData.scanTime);
                                        const timeDiffMinutes = Math.abs(newTime - existingTime) / (1000 * 60);
                                        
                                        console.log(`⚠️ Duplicate ID scan detected: ${pData.idScan}`);
                                        console.log(`   - Existing time: ${existingTime.toISOString()}`);
                                        console.log(`   - New time: ${newTime.toISOString()}`);
                                        console.log(`   - Time difference: ${timeDiffMinutes.toFixed(2)} minutes`);
                                        
                                        if (timeDiffMinutes > 5) {
                                            // Ini adalah retry dari data lama (seperti kasus 02:39 ke 02:48)
                                            console.log(`⏭️  SKIP - Data lama di-retry (beda ${timeDiffMinutes.toFixed(2)} menit): ${pData.idScan}`);
                                            continue; // Skip insert, lanjut ke line berikutnya
                                        } else {
                                            // Perbedaan waktu kecil, mungkin update dari data yang sama
                                            console.log(`🔄 UPDATE - Data dalam rentang 5 menit, update jika lebih baru: ${pData.idScan}`);
                                            
                                            // Update hanya jika data baru lebih baru dari data existing
                                            if (newTime > existingTime) {
                                                const updateRes = await db.query(
                                                    `UPDATE scans SET
                                                        container_no = $1,
                                                        truck_no = $2,
                                                        scan_time = $3,
                                                        status = $4,
                                                        error_message = $5,
                                                        image1_path = $6,
                                                        image2_path = $7,
                                                        image3_path = $8,
                                                        image4_path = $9,
                                                        image5_path = $10,
                                                        image6_path = $11,
                                                        updated_at = NOW()
                                                     WHERE id_scan = $12
                                                     RETURNING *`,
                                                    [
                                                        pData.containerNo, pData.truckNo,
                                                        pData.scanTime, pData.status, pData.errorMessage,
                                                        pData.image1_path, pData.image2_path, pData.image3_path,
                                                        pData.image4_path, pData.image5_path, pData.image6_path,
                                                        pData.idScan
                                                    ]
                                                );
                                                
                                                if (updateRes.rows.length > 0) {
                                                    console.log(`✅ Scan UPDATED: ${pData.idScan} dengan data lebih baru`);
                                                    io.emit('scan_updated', updateRes.rows[0]);
                                                }
                                            } else {
                                                console.log(`⏭️  SKIP - Data existing lebih baru: ${pData.idScan}`);
                                            }
                                            continue;
                                        }
                                    }

                                    const dbRes = await db.query(
                                        `INSERT INTO scans(
                                            id_scan, container_no, truck_no, scan_time, 
                                            status, error_message,
                                            image1_path, image2_path, image3_path, 
                                            image4_path, image5_path, image6_path
                                         )
                                         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) 
                                         RETURNING *`,
                                        [
                                            pData.idScan, pData.containerNo, pData.truckNo, 
                                            pData.scanTime, pData.status, pData.errorMessage,
                                            pData.image1_path, pData.image2_path, pData.image3_path,
                                            pData.image4_path, pData.image5_path, pData.image6_path
                                        ]
                                    );
                                    
                                    const newScan = dbRes.rows[0];
                                    console.log(`✅ NEW SCAN saved: ID ${newScan.id}, Container: ${newScan.container_no}, Status: ${newScan.status}`);
                                    io.emit('new_scan', newScan);

                                    // Update stats
                                    const [tr, ok, nok] = await Promise.all([
                                        db.query('SELECT COUNT(*) FROM scans'),
                                        db.query(`SELECT COUNT(*) FROM scans WHERE status='OK'`),
                                        db.query(`SELECT COUNT(*) FROM scans WHERE status='NOK'`)
                                    ]);
                                    
                                    io.emit('stats_update', { 
                                        total: parseInt(tr.rows[0].count), 
                                        ok: parseInt(ok.rows[0].count), 
                                        nok: parseInt(nok.rows[0].count) 
                                    });

                                } catch (dbErr) {
                                    // Handle unique constraint violation jika ada
                                    if (dbErr.code === '23505') { // PostgreSQL unique violation
                                        console.log(`⚠️ Unique constraint violation untuk ${pData.idScan} - data sudah ada`);
                                    } else {
                                        console.error('❌ Database error:', dbErr.message);
                                    }
                                }
                            }
                            
                            if (parsed && parsed.type === 'FTP_UPLOAD') {
                                io.emit('ftp_update', {
                                    ftpServer: {
                                        status: 'uploading',
                                        lastActivity: parsed.data.timestamp,
                                        details: `Uploading: ${parsed.data.file}`,
                                        currentActivity: `Mengupload ${parsed.data.file}`
                                    }
                                });
                            }
                            
                            if (parsed && parsed.type === 'FTP_ERROR') {
                                io.emit('ftp_update', {
                                    ftpServer: {
                                        status: 'error',
                                        lastActivity: parsed.data.timestamp,
                                        details: parsed.data.error,
                                        currentActivity: 'Error - perlu perhatian'
                                    }
                                });
                            }
                            
                        } catch (lineErr) { 
                            console.error('❌ Line error:', lineErr); 
                        }
                    }
                    lastSize = currentSize;
                } catch (processErr) { 
                    console.error('❌ Process error:', processErr); 
                }
            });
        } catch (err) {
            console.error("❌ Watcher change error:", err);
            try { lastSize = fs.statSync(filePath).size; } catch (e) {}
        }
    });

    watcher.on('add', (f) => { 
        try { 
            lastSize = fs.statSync(f).size; 
            console.log(`📄 File added/watched: ${f}`);
        } catch (e) {} 
    });
    
    watcher.on('error', (e) => console.error('❌ Watcher error:', e));
    
    console.log(`✅ Log file watcher aktif dengan proteksi duplikasi`);
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
            initialData: 'GET /api/initial-data', config: 'GET /api/config',
            export: 'GET /api/export/csv-v2', images: 'GET /images/*',
            containerValidation: 'GET /api/container-validation',
            containerValidationStats: 'GET /api/container-validation/statistics',
            updateValidation: 'POST /api/update-validation-result',
            manualValidation: 'POST /api/manual-container-validation',
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
    console.log(`📊 API Endpoints:`);
    console.log(`📊   GET    /api/health`);
    console.log(`📊   GET    /api/scans`);
    console.log(`📊   GET    /api/container-validation (dengan AUTO DETECT support)`);
    console.log(`📊   POST   /api/update-validation-result (untuk Tesseract.js)`);
    console.log(`📊   POST   /api/manual-container-validation`);
    console.log(`👀 Log monitoring: ${fs.existsSync(LOG_FILE_PATH) ? 'AKTIF ✅' : 'NON-AKTIF ⚠️'}`);
    console.log(`==========================================\n`);
});

process.on('SIGINT',  () => { console.log('\n🛑 Shutdown...'); server.close(() => { console.log('✅ Server berhenti'); process.exit(0); }); });
process.on('SIGTERM', () => { console.log('\n🛑 Shutdown...'); server.close(() => { console.log('✅ Server berhenti'); process.exit(0); }); });

module.exports = app;