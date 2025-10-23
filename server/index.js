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

// --- Konfigurasi Path (Disesuaikan untuk Laptop Anda) ---
const LOG_FILE_PATH = '\\\\192.111.111.80\\logs\\Transmission.log';
const CONFIG_FILE_PATH = '\\\\192.111.111.80\\logs\\config.ini';
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
const imageFolderPath = '\\\\192.111.111.80\\Image'; 
app.use('/images', express.static(imageFolderPath));
console.log(`🖼️  Menyajikan gambar dari folder: ${imageFolderPath}`);

// =======================================================================
// === API ENDPOINTS ===
// =======================================================================

// --- API Health Check ---
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

// --- API untuk mendapatkan data scans dengan pagination dan filter ---
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

        res.json({ 
            success: true,
            data: dataResult.rows, 
            total: total,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(total / pageSize)
        });

    } catch (err) {
        console.error("❌ Error fetching from /api/scans:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API RESEND DATA KE SERVER MTI ===
// =======================================================================
app.post('/api/scans/:id/resend', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔄 Request resend data untuk scan ID: ${id}`);
        
        // 1. Ambil data dari database
        const query = 'SELECT * FROM scans WHERE id = $1';
        const result = await db.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Scan not found',
                message: `Scan with ID ${id} not found`
            });
        }
        
        const scanData = result.rows[0];
        
        // 2. Validasi hanya untuk status OK
        if (scanData.status !== 'OK') {
            return res.status(400).json({
                success: false,
                error: 'Invalid operation',
                message: 'Resend hanya bisa untuk data dengan status OK'
            });
        }
        
        // 3. Format data untuk dikirim ke server MTI
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
        
        console.log('📤 Payload untuk resend:', JSON.stringify(mtiPayload, null, 2));
        
        // 4. Kirim ke server MTI (gunakan IP dari config)
        const mtiServerUrl = `http://${ftpConfig.server2_ip || '10.226.62.32'}:8040/services/xRaySby/out`;
        
        console.log(`🌐 Mengirim data ke MTI Server: ${mtiServerUrl}`);
        
        const response = await axios.post(mtiServerUrl, mtiPayload, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`✅ Resend berhasil! Response dari MTI:`, response.data);
        
        // 5. Update status di database untuk tracking
        const updateQuery = `
            UPDATE scans 
            SET resend_count = COALESCE(resend_count, 0) + 1,
                last_resend_time = NOW(),
                resend_status = 'SUCCESS'
            WHERE id = $1
        `;
        await db.query(updateQuery, [id]);
        
        // 6. Kirim notifikasi real-time
        io.emit('resend_success', {
            scanId: id,
            containerNo: scanData.container_no,
            timestamp: new Date().toISOString(),
            response: response.data
        });
        
        res.json({
            success: true,
            message: 'Data berhasil dikirim ulang ke server MTI',
            scanId: id,
            containerNo: scanData.container_no,
            mtiResponse: response.data,
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error("❌ Error dalam resend data:", err);
        
        // Update status error di database
        if (req.params.id) {
            try {
                const updateQuery = `
                    UPDATE scans 
                    SET resend_status = 'FAILED',
                        error_message = $1
                    WHERE id = $2
                `;
                await db.query(updateQuery, [err.message, req.params.id]);
            } catch (updateError) {
                console.error('❌ Gagal update status error:', updateError);
            }
        }
        
        // Kirim notifikasi error real-time
        io.emit('resend_failed', {
            scanId: req.params.id,
            error: err.message,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Gagal mengirim ulang data',
            message: err.message,
            details: err.response?.data || 'Tidak ada response dari server MTI'
        });
    }
});

// =======================================================================
// === API STATISTIK ===
// =======================================================================

// --- API Stats Basic ---
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
        
        const total = parseInt(result.rows[0].total);
        const ok = parseInt(result.rows[0].ok);
        const successRate = total > 0 ? ((ok / total) * 100).toFixed(1) : 0;
        
        res.json({
            success: true,
            ...result.rows[0],
            successRate: parseFloat(successRate)
        });
        
    } catch (err) {
        console.error("❌ Error fetching from /api/stats:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API STATISTICS - DAILY SCANS (UNTUK STATISTICS PAGE) ===
// =======================================================================
app.get('/api/stats/daily', async (req, res) => {
    try {
        console.log('📊 Fetching daily statistics...');
        
        const query = `
            SELECT 
                DATE(scan_time) as date,
                COUNT(*) as total_count,
                COUNT(*) FILTER (WHERE status = 'OK') as ok_count,
                COUNT(*) FILTER (WHERE status = 'NOK') as nok_count
            FROM scans 
            WHERE scan_time >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(scan_time)
            ORDER BY date DESC
            LIMIT 30
        `;
        
        const result = await db.query(query);
        
        console.log(`✅ Daily stats loaded: ${result.rows.length} days of data`);
        
        res.json(result.rows);
        
    } catch (err) {
        console.error("❌ Error fetching daily statistics:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message 
        });
    }
});

// =======================================================================
// === API STATISTICS - SUMMARY (UNTUK STATISTICS PAGE) ===
// =======================================================================
app.get('/api/stats/summary', async (req, res) => {
    try {
        console.log('📊 Fetching statistics summary...');
        
        // Total stats
        const totalQuery = `
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'OK') AS ok,
                COUNT(*) FILTER (WHERE status = 'NOK') AS nok
            FROM scans;
        `;
        const totalResult = await db.query(totalQuery);
        
        // Today's stats
        const todayQuery = `
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'OK') AS ok,
                COUNT(*) FILTER (WHERE status = 'NOK') AS nok
            FROM scans 
            WHERE DATE(scan_time) = CURRENT_DATE;
        `;
        const todayResult = await db.query(todayQuery);
        
        // This week stats
        const weekQuery = `
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'OK') AS ok,
                COUNT(*) FILTER (WHERE status = 'NOK') AS nok
            FROM scans 
            WHERE scan_time >= DATE_TRUNC('week', CURRENT_DATE);
        `;
        const weekResult = await db.query(weekQuery);
        
        // This month stats
        const monthQuery = `
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'OK') AS ok,
                COUNT(*) FILTER (WHERE status = 'NOK') AS nok
            FROM scans 
            WHERE scan_time >= DATE_TRUNC('month', CURRENT_DATE);
        `;
        const monthResult = await db.query(monthQuery);
        
        // Success rate
        const total = parseInt(totalResult.rows[0].total);
        const ok = parseInt(totalResult.rows[0].ok);
        const successRate = total > 0 ? ((ok / total) * 100).toFixed(1) : 0;
        
        const summary = {
            overall: {
                total: parseInt(totalResult.rows[0].total),
                ok: parseInt(totalResult.rows[0].ok),
                nok: parseInt(totalResult.rows[0].nok)
            },
            today: {
                total: parseInt(todayResult.rows[0].total),
                ok: parseInt(todayResult.rows[0].ok),
                nok: parseInt(todayResult.rows[0].nok)
            },
            week: {
                total: parseInt(weekResult.rows[0].total),
                ok: parseInt(weekResult.rows[0].ok),
                nok: parseInt(weekResult.rows[0].nok)
            },
            month: {
                total: parseInt(monthResult.rows[0].total),
                ok: parseInt(monthResult.rows[0].ok),
                nok: parseInt(monthResult.rows[0].nok)
            },
            successRate: parseFloat(successRate)
        };
        
        console.log('✅ Statistics summary loaded:', summary);
        
        res.json(summary);
        
    } catch (err) {
        console.error("❌ Error fetching statistics summary:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message 
        });
    }
});

// =======================================================================
// === API UNTUK INITIAL DATA OVERVIEW (UNTUK OVERVIEW PAGE) ===
// =======================================================================
app.get('/api/initial-data', async (req, res) => {
    try {
        console.log('📊 Fetching initial data for overview...');

        // Get stats
        const statsQuery = `
            SELECT 
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'OK') AS ok,
                COUNT(*) FILTER (WHERE status = 'NOK') AS nok
            FROM scans;
        `;
        const statsResult = await db.query(statsQuery);
        const stats = statsResult.rows[0];

        // Get recent scans (last 10)
        const recentScansQuery = `
            SELECT * FROM scans 
            ORDER BY scan_time DESC 
            LIMIT 10
        `;
        const recentScansResult = await db.query(recentScansQuery);
        const recentScans = recentScansResult.rows;

        // Calculate success rate
        const successRate = stats.total > 0 ? ((stats.ok / stats.total) * 100).toFixed(1) + '%' : '0%';

        // System state dengan data real
        const systemState = {
            ftpServer1: { 
                name: 'FTP Server 1', 
                status: 'connected', 
                lastActivity: new Date().toLocaleTimeString('id-ID'),
                details: 'Connected and monitoring log files',
                ip: ftpConfig.server1_ip || '10.226.62.31'
            },
            ftpServer2: { 
                name: 'FTP Server 2', 
                status: 'standby', 
                lastActivity: new Date().toLocaleTimeString('id-ID'),
                details: 'Standby - Ready for failover',
                ip: ftpConfig.server2_ip || '10.226.62.32'
            }
        };

        // System activity dengan data real
        const systemActivity = {
            uptime: calculateUptime(),
            lastUpdate: new Date().toLocaleTimeString('id-ID'),
            activeConnections: io.engine.clientsCount,
            logFiles: 'Active - Transmission.log',
            totalScans: parseInt(stats.total),
            successfulScans: parseInt(stats.ok),
            failedScans: parseInt(stats.nok),
            successRate: successRate
        };

        console.log('✅ Initial data loaded successfully:', {
            stats,
            recentScans: recentScans.length,
            systemActivity
        });

        res.json({
            success: true,
            stats,
            recentScans,
            systemState,
            systemActivity
        });

    } catch (err) {
        console.error("❌ Error in /api/initial-data:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API CONFIGURATION (UNTUK SETTINGS PAGE) ===
// =======================================================================
app.get('/api/config', (req, res) => {
    try {
        console.log('⚙️ Fetching system configuration...');
        
        const configData = {
            // File paths
            logFilePath: LOG_FILE_PATH,
            imageFolderPath: path.join(__dirname, 'images'),
            
            // FTP Server Configuration
            ftpServer: {
                ip: ftpConfig.server1_ip || '10.226.62.31',
                status: 'connected',
                description: 'FTP Server untuk upload gambar',
                type: 'FTP',
                activities: ['Upload gambar container', 'File transfer']
            },
            
            // API Server Configuration  
            apiServer: {
                ip: ftpConfig.server2_ip || '10.226.62.32', 
                status: 'standby',
                description: 'API Server untuk menerima data JSON',
                type: 'HTTP API',
                activities: ['Menerima data scan', 'Processing JSON', 'Response status']
            },
            
            // Database Configuration
            databaseHost: process.env.DB_HOST || 'localhost',
            databasePort: process.env.DB_PORT || '5432',
            databaseName: process.env.DB_NAME || 'nuctech_db',
            databaseUser: process.env.DB_USER || 'postgres',
            
            // Server Configuration
            serverPort: PORT,
            serverEnvironment: process.env.NODE_ENV || 'development',
            serverUptime: calculateUptime(),
            serverStartTime: serverStartTime.toLocaleString('id-ID'),
            
            // Log Configuration
            logMonitoring: fs.existsSync(LOG_FILE_PATH) ? 'Active' : 'Inactive',
            logFileSize: fs.existsSync(LOG_FILE_PATH) ? 
                `${(fs.statSync(LOG_FILE_PATH).size / 1024 / 1024).toFixed(2)} MB` : 'File not found',
            
            // System Status
            websocketConnections: io.engine.clientsCount,
            activeProcesses: 'Log Monitoring, WebSocket, API Server'
        };

        console.log('✅ Configuration data loaded successfully');
        
        res.json({
            success: true,
            ...configData
        });
        
    } catch (err) {
        console.error("❌ Error fetching configuration:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API UPDATE CONFIGURATION (OPSIONAL) ===
// =======================================================================
app.put('/api/config/update', async (req, res) => {
    try {
        const { setting, value } = req.body;
        
        console.log(`⚙️ Update configuration request: ${setting} = ${value}`);
        
        // Di sini Anda bisa menambahkan logika untuk update konfigurasi
        // Misalnya: update database, restart services, dll.
        
        res.json({
            success: true,
            message: `Configuration ${setting} updated successfully`,
            updatedSetting: setting,
            newValue: value,
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error("❌ Error updating configuration:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API ENDPOINT UNTUK EXPORT CSV ===
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
            whereClauses.push(`(container_no ILIKE $${queryParams.length} OR id_scan ILIKE $${queryParams.length} OR id::text ILIKE $${queryParams.length})`);
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

        // Create CSV content dengan header yang lengkap
        const headers = [
            'NO', 
            'ID SCAN', 
            'NO. CONTAINER', 
            'NO. TRUCK', 
            'SCAN TIME', 
            'UPDATE TIME', 
            'STATUS',
            'IMAGE1_PATH',
            'IMAGE2_PATH', 
            'IMAGE3_PATH',
            'IMAGE4_PATH'
        ];
        let csvContent = headers.join(',') + '\r\n';

        data.forEach((item, index) => {
            const row = [
                index + 1,
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
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API UNTUK MENGAMBIL GAMBAR ===
// =======================================================================
app.use('/images', express.static(path.join(__dirname, 'images')));

// =======================================================================
// === API UNTUK SCAN DETAIL BY ID ===
// =======================================================================
app.get('/api/scans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Fetching scan detail for ID: ${id}`);
        
        const query = 'SELECT * FROM scans WHERE id = $1';
        const result = await db.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Scan not found',
                message: `Scan with ID ${id} not found`
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (err) {
        console.error("❌ Error fetching scan detail:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API UNTUK DELETE SCAN (OPSIONAL) ===
// =======================================================================
app.delete('/api/scans/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Deleting scan with ID: ${id}`);
        
        const query = 'DELETE FROM scans WHERE id = $1 RETURNING *';
        const result = await db.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Scan not found',
                message: `Scan with ID ${id} not found`
            });
        }
        
        // Emit event untuk update real-time
        io.emit('scan_deleted', { id });
        
        res.json({
            success: true,
            message: 'Scan deleted successfully',
            deletedScan: result.rows[0]
        });
        
    } catch (err) {
        console.error("❌ Error deleting scan:", err);
        res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === DEBUG ENDPOINTS ===
// =======================================================================

// Endpoint untuk mengecek schema database
app.get('/api/debug/db-schema', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'scans' 
            ORDER BY ordinal_position;
        `);
        
        res.json({
            success: true,
            columns: result.rows,
            totalColumns: result.rows.length
        });
    } catch (error) {
        console.error('❌ Error checking schema:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint untuk mengecek data terbaru
app.get('/api/debug/recent-scans', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM scans 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        
        res.json({
            success: true,
            scans: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        console.error('❌ Error fetching recent scans:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint untuk memperbaiki schema (opsional)
app.post('/api/debug/fix-schema', async (req, res) => {
    try {
        // Tambahkan kolom error_message jika belum ada
        await db.query(`
            ALTER TABLE scans 
            ADD COLUMN IF NOT EXISTS error_message TEXT,
            ADD COLUMN IF NOT EXISTS id_scan VARCHAR(100),
            ADD COLUMN IF NOT EXISTS resend_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_resend_time TIMESTAMP,
            ADD COLUMN IF NOT EXISTS resend_status VARCHAR(20),
            ADD COLUMN IF NOT EXISTS image5_path TEXT,
            ADD COLUMN IF NOT EXISTS image6_path TEXT
        `);
        
        res.json({
            success: true,
            message: 'Schema checked/fixed successfully'
        });
    } catch (error) {
        console.error('❌ Error fixing schema:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =======================================================================
// === HELPER FUNCTIONS ===
// =======================================================================

// Helper function untuk menghitung uptime
function calculateUptime() {
    const startTime = new Date(serverStartTime);
    const now = new Date();
    const diff = now - startTime;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${days} days ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// =======================================================================
// === WEBSOCKET HANDLING ===
// =======================================================================

// --- Koneksi WebSocket ---
io.on('connection', (socket) => {
    console.log(`🔌 Pengguna terhubung: ${socket.id}`);
    
    // Kirim update status saat koneksi baru
    socket.emit('system_activity_update', {
        activeConnections: io.engine.clientsCount,
        lastUpdate: new Date().toLocaleTimeString('id-ID')
    });

    // Broadcast ke semua client tentang koneksi baru
    io.emit('system_activity_update', {
        activeConnections: io.engine.clientsCount,
        lastUpdate: new Date().toLocaleTimeString('id-ID')
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Pengguna terputus: ${socket.id}`);
        
        // Update active connections count
        io.emit('system_activity_update', {
            activeConnections: io.engine.clientsCount,
            lastUpdate: new Date().toLocaleTimeString('id-ID')
        });
    });
});

// =======================================================================
// === LOG FILE WATCHER ===
// =======================================================================

// --- Log File Watcher ---
if (!fs.existsSync(LOG_FILE_PATH)) {
    console.error(`❌ KRITIS: File log tidak ditemukan di path: ${LOG_FILE_PATH}`);
    console.log('⚠️  Server tetap berjalan tanpa file log monitoring');
} else {
    console.log(`👀 Memantau perubahan pada file: ${LOG_FILE_PATH}`);
    let lastSize = fs.statSync(LOG_FILE_PATH).size;

    const watcher = chokidar.watch(LOG_FILE_PATH, { 
        usePolling: true, 
        interval: 500,
        persistent: true,
        ignoreInitial: true
    });

    watcher.on('change', async (filePath) => {
        try {
            console.log(`📁 File changed: ${filePath}`);
            const stats = fs.statSync(filePath);
            const currentSize = stats.size;
            
            if (currentSize <= lastSize) {
                console.log(`📏 No new content. Current: ${currentSize}, Last: ${lastSize}`);
                lastSize = currentSize;
                return;
            }

            console.log(`📖 Reading new content from position ${lastSize} to ${currentSize}`);
            
            const stream = fs.createReadStream(filePath, { 
                start: lastSize, 
                end: currentSize, 
                encoding: 'utf-8' 
            });

            let bufferData = '';
            
            stream.on('data', (chunk) => {
                bufferData += chunk;
            });

            stream.on('end', async () => {
                try {
                    if (!bufferData.trim()) {
                        console.log('📭 No new data to process');
                        lastSize = currentSize;
                        return;
                    }

                    const lines = bufferData.split(/\r?\n/).filter(line => line.trim());
                    console.log(`📝 Processing ${lines.length} new lines`);
                    
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        
                        try {
                            console.log(`🔍 Processing line: ${line.substring(0, 100)}...`);
                            const parsed = parseLogLine(line);
                            console.log(`📝 Log line parsed:`, JSON.stringify(parsed, null, 2));
                            
                            if (parsed.type === 'SCAN') {
                                const pData = parsed.data;
                                
                                // Debug data yang akan disimpan
                                console.log('💾 Preparing to save scan data:', {
                                    idScan: pData.idScan,
                                    containerNo: pData.containerNo,
                                    truckNo: pData.truckNo,
                                    scanTime: pData.scanTime,
                                    status: pData.status,
                                    hasImages: !!(pData.image1_path || pData.image2_path || pData.image3_path || pData.image4_path)
                                });

                                // QUERY YANG DIPERBAIKI - DENGAN ID_SCAN
                                const query = `INSERT INTO scans(
                                    id_scan, container_no, truck_no, scan_time, status, 
                                    image1_path, image2_path, image3_path, image4_path, image5_path, image6_path
                                ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`;
                                
                                const values = [
                                    pData.idScan, // ID Scan dari log line
                                    pData.containerNo, 
                                    pData.truckNo, 
                                    pData.scanTime, 
                                    pData.status, 
                                    pData.image1_path, 
                                    pData.image2_path, 
                                    pData.image3_path, 
                                    pData.image4_path,
                                    pData.image5_path || null,
                                    pData.image6_path || null
                                ];
                                
                                console.log('🗄️ Executing database query...');
                                const dbRes = await db.query(query, values);
                                const newScanFromDB = dbRes.rows[0];

                                console.log(`✅ [DB] SUKSES! Data scan ${newScanFromDB.status} disimpan. ID: ${newScanFromDB.id}, Container: ${newScanFromDB.container_no}`);
                                
                                // Emit new scan event ke semua client
                                console.log(`📢 Emitting new_scan event to ${io.engine.clientsCount} clients`);
                                io.emit('new_scan', newScanFromDB);
                                
                                // Emit stats update dengan error handling
                                try {
                                    const totalResult = await db.query('SELECT COUNT(*) FROM scans');
                                    const okResult = await db.query('SELECT COUNT(*) FROM scans WHERE status = $1', ['OK']);
                                    const nokResult = await db.query('SELECT COUNT(*) FROM scans WHERE status = $1', ['NOK']);
                                    
                                    io.emit('stats_update', {
                                        total: parseInt(totalResult.rows[0].count),
                                        ok: parseInt(okResult.rows[0].count),
                                        nok: parseInt(nokResult.rows[0].count)
                                    });
                                    
                                    console.log('📊 Stats updated:', {
                                        total: parseInt(totalResult.rows[0].count),
                                        ok: parseInt(okResult.rows[0].count),
                                        nok: parseInt(nokResult.rows[0].count)
                                    });
                                } catch (statsError) {
                                    console.error('❌ Error updating stats:', statsError);
                                }
                                
                                // Emit API update - API Server processing data
                                io.emit('api_update', {
                                    apiServer: {
                                        status: 'processing',
                                        lastActivity: new Date().toLocaleTimeString('id-ID'),
                                        details: 'Processing JSON data from scan',
                                        ip: ftpConfig.server2_ip,
                                        type: 'HTTP API',
                                        currentActivity: 'Memproses data JSON scan'
                                    },
                                    ftpServer: {
                                        status: 'connected',
                                        lastActivity: new Date().toLocaleTimeString('id-ID'),
                                        details: 'Ready for next upload',
                                        ip: ftpConfig.server1_ip,
                                        type: 'FTP',
                                        currentActivity: 'Siap upload berikutnya'
                                    }
                                });
                                
                                // Kembalikan API Server ke standby setelah 2 detik
                                setTimeout(() => {
                                    io.emit('api_update', {
                                        apiServer: {
                                            status: 'standby',
                                            lastActivity: new Date().toLocaleTimeString('id-ID'),
                                            details: 'Ready to receive JSON data',
                                            ip: ftpConfig.server2_ip,
                                            type: 'HTTP API',
                                            currentActivity: 'Menunggu data JSON'
                                        },
                                        ftpServer: {
                                            status: 'connected',
                                            lastActivity: new Date().toLocaleTimeString('id-ID'),
                                            details: 'Monitoring for uploads',
                                            ip: ftpConfig.server1_ip,
                                            type: 'FTP',
                                            currentActivity: 'Monitoring upload'
                                        }
                                    });
                                }, 2000);
                                
                            } else if (parsed.type === 'FTP_UPLOAD') {
                                console.log(`📤 FTP Upload detected: ${parsed.data.file}`);
                                
                                // Emit FTP update - FTP Server uploading images
                                io.emit('ftp_update', {
                                    ftpServer: {
                                        status: 'uploading',
                                        lastActivity: new Date().toLocaleTimeString('id-ID'),
                                        details: `Uploading ${parsed.data.file}`,
                                        ip: parsed.data.ip,
                                        type: 'FTP',
                                        currentActivity: 'Mengupload file gambar'
                                    },
                                    apiServer: {
                                        status: 'standby',
                                        lastActivity: new Date().toLocaleTimeString('id-ID'),
                                        details: 'Ready to receive JSON data',
                                        ip: ftpConfig.server2_ip,
                                        type: 'HTTP API', 
                                        currentActivity: 'Menunggu data JSON'
                                    }
                                });
                                
                                // Kembalikan FTP Server ke connected setelah 3 detik
                                setTimeout(() => {
                                    io.emit('ftp_update', {
                                        ftpServer: {
                                            status: 'connected',
                                            lastActivity: new Date().toLocaleTimeString('id-ID'),
                                            details: 'Upload completed',
                                            ip: ftpConfig.server1_ip,
                                            type: 'FTP',
                                            currentActivity: 'Upload selesai'
                                        },
                                        apiServer: {
                                            status: 'standby',
                                            lastActivity: new Date().toLocaleTimeString('id-ID'),
                                            details: 'Ready to receive JSON data',
                                            ip: ftpConfig.server2_ip,
                                            type: 'HTTP API',
                                            currentActivity: 'Menunggu data JSON'
                                        }
                                    });
                                }, 3000);
                                
                            } else if (parsed.type === 'CONNECTION') {
                                console.log(`🔗 Connection log: ${parsed.data.message}`);
                                
                            } else if (parsed.type === 'SYSTEM_LOG') {
                                // Skip system log untuk mengurangi console spam
                                // console.log(`⚙️ System log: ${parsed.data.message}`);
                            }
                            
                        } catch (lineError) {
                            console.error('❌ Error processing log line:', lineError);
                            console.log('Problematic line:', line);
                            
                            // Jika error karena database, coba dengan query yang lebih sederhana
                            if (lineError.message.includes('column') && lineError.message.includes('does not exist')) {
                                console.log('🔄 Trying fallback query without error_message...');
                                try {
                                    const fallbackQuery = `INSERT INTO scans(
                                        id_scan, container_no, truck_no, scan_time, status, 
                                        image1_path, image2_path, image3_path, image4_path
                                    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;
                                    
                                    const pData = parsed.data;
                                    const fallbackValues = [
                                        pData.idScan,
                                        pData.containerNo, 
                                        pData.truckNo, 
                                        pData.scanTime, 
                                        pData.status, 
                                        pData.image1_path, 
                                        pData.image2_path, 
                                        pData.image3_path, 
                                        pData.image4_path
                                    ];
                                    
                                    const fallbackRes = await db.query(fallbackQuery, fallbackValues);
                                    const fallbackScan = fallbackRes.rows[0];
                                    console.log(`✅ [DB FALLBACK] Data scan disimpan. ID: ${fallbackScan.id}`);
                                    
                                    io.emit('new_scan', fallbackScan);
                                } catch (fallbackError) {
                                    console.error('❌ Fallback query also failed:', fallbackError);
                                }
                            }
                        }
                    }
                    
                    lastSize = currentSize;
                    console.log(`📊 Processing complete. Last size updated to: ${lastSize}`);
                    
                } catch (processError) {
                    console.error('❌ Error processing buffer data:', processError);
                }
            });

            stream.on('error', (streamError) => {
                console.error('❌ Stream error:', streamError);
                lastSize = currentSize; // Reset lastSize to avoid infinite loop
            });
            
        } catch (err) {
            console.error("❌ Error saat memproses file log:", err);
            // Try to reset lastSize to prevent getting stuck
            try {
                lastSize = fs.statSync(filePath).size;
            } catch (e) {
                console.error('❌ Cannot reset lastSize:', e);
            }
        }
    });

    // Handle file addition (if recreated)
    watcher.on('add', (filePath) => {
        console.log(`📁 File log ditemukan/dibuat: ${filePath}`);
        try {
            lastSize = fs.statSync(filePath).size;
            console.log(`📏 Reset lastSize to: ${lastSize}`);
        } catch (error) {
            console.error('❌ Error getting file size on add:', error);
        }
    });

    // Handle errors
    watcher.on('error', (error) => {
        console.error('❌ Watcher error:', error);
    });

    console.log(`✅ Log file watcher aktif untuk: ${LOG_FILE_PATH}`);
}

// =======================================================================
// === BASIC ROUTES ===
// =======================================================================

// --- SIMPLE CATCH-ALL ROUTE UNTUK REACT APP ---
app.get('/', (req, res) => {
    res.json({ 
        success: true,
        message: 'Nuctech Transmission Dashboard Backend Server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        instructions: 'Frontend should be running on http://localhost:3000',
        endpoints: {
            health: 'GET /api/health',
            scans: 'GET /api/scans',
            scanDetail: 'GET /api/scans/:id',
            resend: 'POST /api/scans/:id/resend',
            stats: 'GET /api/stats',
            statsDaily: 'GET /api/stats/daily',
            statsSummary: 'GET /api/stats/summary',
            initialData: 'GET /api/initial-data',
            config: 'GET /api/config',
            updateConfig: 'PUT /api/config/update',
            export: 'GET /api/export/csv-v2',
            images: 'GET /images/*',
            deleteScan: 'DELETE /api/scans/:id',
            debug: {
                dbSchema: 'GET /api/debug/db-schema',
                recentScans: 'GET /api/debug/recent-scans',
                fixSchema: 'POST /api/debug/fix-schema'
            }
        },
        websocket: {
            new_scan: 'New scan data',
            ftp_update: 'FTP server status update',
            system_activity_update: 'System activity update',
            scan_deleted: 'Scan deleted event',
            stats_update: 'Statistics update',
            resend_success: 'Resend success event',
            resend_failed: 'Resend failed event'
        }
    });
});

// =======================================================================
// === ERROR HANDLING MIDDLEWARE ===
// =======================================================================

// 404 Handler untuk route yang tidak ditemukan
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: [
            'GET  /api/health',
            'GET  /api/scans',
            'GET  /api/scans/:id',
            'POST /api/scans/:id/resend',
            'GET  /api/stats',
            'GET  /api/stats/daily',
            'GET  /api/stats/summary',
            'GET  /api/initial-data',
            'GET  /api/config',
            'PUT  /api/config/update',
            'GET  /api/export/csv-v2',
            'DELETE /api/scans/:id',
            'GET  /images/*',
            'GET  /api/debug/db-schema',
            'GET  /api/debug/recent-scans',
            'POST /api/debug/fix-schema'
        ]
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// =======================================================================
// === SERVER STARTUP ===
// =======================================================================

// Simpan waktu start server
let serverStartTime = new Date();

server.listen(PORT, () => {
    console.log(`\n🚀 ==========================================`);
    console.log(`🚀 Nuctech Transmission Dashboard Server`);
    console.log(`🚀 ==========================================`);
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    console.log(`🚀 Start time: ${serverStartTime.toLocaleString('id-ID')}`);
    console.log(`🚀 Uptime: ${calculateUptime()}`);
    console.log(`📊 ==========================================`);
    console.log(`📊 API Endpoints:`);
    console.log(`📊   GET  /api/health         - Health check`);
    console.log(`📊   GET  /api/scans          - Data scans dengan pagination`);
    console.log(`📊   GET  /api/scans/:id      - Detail scan by ID`);
    console.log(`📊   POST /api/scans/:id/resend - Resend data ke MTI`);
    console.log(`📊   DELETE /api/scans/:id    - Delete scan`);
    console.log(`📊   GET  /api/stats          - Statistik dasar`);
    console.log(`📊   GET  /api/stats/daily    - Statistik harian (30 hari)`);
    console.log(`📊   GET  /api/stats/summary  - Ringkasan statistik`);
    console.log(`📊   GET  /api/initial-data   - Data untuk overview`);
    console.log(`📊   GET  /api/config         - Konfigurasi sistem`);
    console.log(`📊   PUT  /api/config/update  - Update konfigurasi`);
    console.log(`📊   GET  /api/export/csv-v2  - Export data ke CSV`);
    console.log(`📊   GET  /images/*           - Serve gambar`);
    console.log(`📊   GET  /api/debug/db-schema- Debug database schema`);
    console.log(`📊   GET  /api/debug/recent-scans - Debug recent scans`);
    console.log(`📊   POST /api/debug/fix-schema - Fix database schema`);
    console.log(`📊 ==========================================`);
    console.log(`🔌 WebSocket Events:`);
    console.log(`🔌   new_scan                - Data scan baru`);
    console.log(`🔌   ftp_update              - Update status FTP`);
    console.log(`🔌   system_activity_update  - Update aktivitas sistem`);
    console.log(`🔌   scan_deleted            - Scan dihapus`);
    console.log(`🔌   stats_update            - Update statistik`);
    console.log(`🔌   resend_success          - Resend berhasil`);
    console.log(`🔌   resend_failed           - Resend gagal`);
    console.log(`🔌 ==========================================`);
    console.log(`👀 Log monitoring: ${fs.existsSync(LOG_FILE_PATH) ? 'AKTIF' : 'NON-AKTIF'}`);
    if (!fs.existsSync(LOG_FILE_PATH)) {
        console.log(`⚠️  File log tidak ditemukan: ${LOG_FILE_PATH}`);
    }
    console.log(`📱 Frontend: http://localhost:3000`);
    console.log(`==========================================\n`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Server menerima SIGINT, shutdown gracefully...');
    server.close(() => {
        console.log('✅ Server berhenti');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Server menerima SIGTERM, shutdown gracefully...');
    server.close(() => {
        console.log('✅ Server berhenti');
        process.exit(0);
    });
});

module.exports = app;