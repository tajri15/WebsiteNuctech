// Tambahkan endpoint ini di index.js setelah endpoint /api/scans

// =======================================================================
// === API CONTAINER VALIDATION ===
// =======================================================================
app.get('/api/container-validation', async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        let baseQuery = `
            SELECT 
                id,
                id_scan,
                container_no,
                truck_no,
                scan_time,
                status,
                image1_path,
                image2_path,
                image3_path,
                image4_path,
                image5_path,
                image6_path,
                image7_path,
                image8_path
            FROM scans
        `;
        
        let whereClauses = [];
        let queryParams = [];
        
        // Filter berdasarkan tanggal
        if (startDate && endDate) {
            queryParams.push(startDate, endDate);
            whereClauses.push(`scan_time BETWEEN $${queryParams.length - 1} AND $${queryParams.length}`);
        }
        
        // Filter berdasarkan status jika diperlukan
        if (status) {
            queryParams.push(status);
            whereClauses.push(`UPPER(status) = UPPER($${queryParams.length})`);
        }
        
        if (whereClauses.length > 0) {
            baseQuery += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        baseQuery += ' ORDER BY scan_time DESC';
        
        const result = await db.query(baseQuery, queryParams);
        
        res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });
        
    } catch (err) {
        console.error("❌ Error fetching container validation data:", err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// =======================================================================
// === API OCR VALIDATION (Optional - untuk validasi dengan OCR real) ===
// =======================================================================
app.post('/api/validate-container-ocr', async (req, res) => {
    try {
        const { containerId } = req.body;
        
        // Ambil data container dari database
        const query = `
            SELECT 
                id,
                container_no,
                image1_path,
                image2_path,
                image3_path,
                image4_path,
                image5_path,
                image6_path,
                image7_path,
                image8_path
            FROM scans 
            WHERE id = $1
        `;
        
        const result = await db.query(query, [containerId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Container not found'
            });
        }
        
        const container = result.rows[0];
        
        // Kumpulkan semua path gambar yang ada
        const imagePaths = [
            container.image1_path,
            container.image2_path,
            container.image3_path,
            container.image4_path,
            container.image5_path,
            container.image6_path,
            container.image7_path,
            container.image8_path
        ].filter(Boolean);
        
        // TODO: Implementasi OCR validation dengan library OCR
        // Untuk saat ini, kita akan melakukan validasi format saja
        
        const containerNo = container.container_no || '';
        const isValid = validateContainerFormat(containerNo);
        
        res.json({
            success: true,
            containerId: container.id,
            containerNo: containerNo,
            isValid: isValid.isValid,
            reason: isValid.reason,
            imageCount: imagePaths.length,
            images: imagePaths
        });
        
    } catch (err) {
        console.error("❌ Error validating container with OCR:", err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});

// Helper function untuk validasi format container
function validateContainerFormat(containerNo) {
    if (!containerNo || containerNo.trim() === '' || containerNo.toUpperCase().includes('SCAN FAILED')) {
        return { isValid: false, reason: 'empty_or_failed' };
    }
    
    // Pattern untuk single container: 4 huruf + 7 angka
    const singlePattern = /^[A-Z]{4}\d{7}$/;
    
    // Pattern untuk double container: 4 huruf + 7 angka / 4 huruf + 7 angka
    const doublePattern = /^[A-Z]{4}\d{7}\/[A-Z]{4}\d{7}$/;
    
    const trimmedNo = containerNo.trim().toUpperCase();
    
    if (singlePattern.test(trimmedNo) || doublePattern.test(trimmedNo)) {
        return { isValid: true, reason: 'valid' };
    }
    
    return { isValid: false, reason: 'invalid_format' };
}

// =======================================================================
// === API UNTUK MENDAPATKAN STATISTIK VALIDASI ===
// =======================================================================
app.get('/api/container-validation/statistics', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let dateFilter = '';
        let queryParams = [];
        
        if (startDate && endDate) {
            queryParams.push(startDate, endDate);
            dateFilter = `WHERE scan_time BETWEEN $1 AND $2`;
        }
        
        const query = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE 
                    WHEN container_no IS NOT NULL 
                    AND container_no != '' 
                    AND container_no NOT ILIKE '%scan failed%'
                    AND (container_no ~ '^[A-Z]{4}[0-9]{7}$' 
                         OR container_no ~ '^[A-Z]{4}[0-9]{7}/[A-Z]{4}[0-9]{7}$')
                    THEN 1 
                END) as valid,
                COUNT(CASE 
                    WHEN container_no IS NULL 
                    OR container_no = '' 
                    OR container_no ILIKE '%scan failed%'
                    OR (container_no !~ '^[A-Z]{4}[0-9]{7}$' 
                        AND container_no !~ '^[A-Z]{4}[0-9]{7}/[A-Z]{4}[0-9]{7}$')
                    THEN 1 
                END) as invalid
            FROM scans
            ${dateFilter}
        `;
        
        const result = await db.query(query, queryParams);
        const stats = result.rows[0];
        
        const total = parseInt(stats.total);
        const valid = parseInt(stats.valid);
        const invalid = parseInt(stats.invalid);
        const validPercentage = total > 0 ? ((valid / total) * 100).toFixed(2) : 0;
        
        res.json({
            success: true,
            statistics: {
                total,
                valid,
                invalid,
                validPercentage: parseFloat(validPercentage)
            }
        });
        
    } catch (err) {
        console.error("❌ Error fetching validation statistics:", err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: err.message
        });
    }
});