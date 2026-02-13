const parseLogLine = (line) => {
  console.log('🔍 Parsing line:', line.substring(0, 200) + '...');

  // Extract timestamp dari log line
  const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}/);
  const logTimestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

  // ====================================================
  // PRIORITAS 1: DETEKSI SCAN LINE (YANG BENAR)
  // ====================================================
  const isScanLine = line.includes('center response:') && 
                     line.includes('response code:') && 
                     line.includes('response text:') &&
                     !line.includes('**FTP**  UPLOAD');
  
  if (isScanLine) {
    // Extract ID Scan
    const idScanMatch = line.match(/center response:([^,\s]+)/);
    const idScan = idScanMatch ? idScanMatch[1].trim() : null;
    
    // Extract RESPONSE CODE (penting untuk bedakan OK vs NOK)
    const responseCodeMatch = line.match(/response code:\s*(\d+)/);
    const responseCode = responseCodeMatch ? parseInt(responseCodeMatch[1]) : null;
    
    console.log('✅ SCAN LINE DETECTED - ID:', idScan, '| Response Code:', responseCode);
    
    // Extract JSON dari response text
    const jsonMatch = line.match(/response text:\s*(\{.*\})/);
    
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        
        // ================================================
        // LOGIKA BARU UNTUK OK vs NOK:
        // ================================================
        // SCAN OK: response code = 200 DAN resultCode = true
        // SCAN NOK: response code = 200 TAPI resultCode = false
        // ATAU response code != 200 (timeout, server down, dll)
        // ================================================
        
        // CASE 1: SCAN NOK - GAGAL TERKIRIM KE SERVER UTAMA
        if (responseCode !== 200) {
          console.log('🔴 SCAN NOK - GAGAL TERKIRIM (Response Code:', responseCode, ')');
          console.log('🔴 ID Scan:', idScan);
          
          return {
            type: 'SCAN',
            data: {
              idScan: idScan || 'UNKNOWN',
              containerNo: 'N/A',
              truckNo: 'N/A',
              scanTime: logTimestamp,
              status: 'NOK',
              image1_path: null,
              image2_path: null,
              image3_path: null,
              image4_path: null,
              image5_path: null,
              image6_path: null,
              errorMessage: `Failed to send to main server - Response code: ${responseCode}`,
              rawData: data
            }
          };
        }
        
        // CASE 2: SCAN NOK - TERKIRIM TAPI DIREJECT SERVER (resultCode: false)
        if (data.resultCode === false) {
          console.log('🔴 SCAN NOK - DIREJECT SERVER:', data.resultDesc);
          console.log('🔴 ID Scan:', idScan);
          
          // AMBIL DATA DARI LOG UNTUK NOK (ada container number, gambar, dll)
          // Karena scan BERHASIL secara teknis, tapi data ditolak server
          
          // Extract data dari line atau dari JSON response
          let containerNo = 'N/A';
          let truckNo = 'N/A';
          
          // Coba cari container number dari line log
          // Biasanya ada di response JSON atau di sekitar line
          
          return {
            type: 'SCAN',
            data: {
              idScan: idScan || 'UNKNOWN',
              containerNo: containerNo, // Ini harus diisi dengan container number asli
              truckNo: truckNo,
              scanTime: logTimestamp,
              status: 'NOK', // STATUS NOK KARENA DITOLAK SERVER
              image1_path: null, // Harusnya ada path gambar
              image2_path: null,
              image3_path: null,
              image4_path: null,
              image5_path: null,
              image6_path: null,
              errorMessage: data.resultDesc || 'Server rejected scan data',
              rawData: data
            }
          };
        }
        
        // CASE 3: SCAN OK - BERHASIL TOTAL (response code 200, resultCode: true)
        if (responseCode === 200 && data.resultCode === true) {
          console.log('🟢 SCAN OK - BERHASIL TOTAL');
          console.log('🟢 ID Scan:', idScan);
          
          return processScanData(data, idScan, logTimestamp);
        }
        
        // CASE 4: FORMAT TIDAK DIKENAL
        console.log('⚠️ Unknown scan format');
        return null;
        
      } catch (e) {
        console.error('❌ JSON parse error:', e.message);
        return null;
      }
    }
  }

  // ====================================================
  // PRIORITAS 2: DETEKSI FTP UPLOAD
  // ====================================================
  if (line.includes('**FTP**  UPLOAD')) {
    console.log('📤 FTP UPLOAD DETECTED');
    
    const ipMatch = line.match(/---TO:([^\\]+)/);
    const fileMatch = line.match(/---FROM:.*\\([^\\]+\.(jpg|png|jpeg|img))/i);
    
    return {
      type: 'FTP_UPLOAD',
      data: {
        ip: ipMatch ? ipMatch[1].trim() : '10.226.62.31',
        file: fileMatch ? fileMatch[1] : 'Unknown file',
        timestamp: logTimestamp,
        rawMessage: line.trim()
      }
    };
  }

  // ====================================================
  // PRIORITAS 3: DETEKSI ERROR FTP (No space left on device)
  // ====================================================
  if (line.includes('No space left on device') || line.includes('550')) {
    console.log('⚠️ FTP ERROR DETECTED - No space');
    
    return {
      type: 'FTP_ERROR',
      data: {
        message: line.trim(),
        timestamp: logTimestamp,
        error: 'No space left on device'
      }
    };
  }

  return { 
    type: 'SYSTEM_LOG',
    data: {
      message: line.trim(),
      timestamp: logTimestamp,
      ignored: true
    }
  };
};

// ====================================================
// FUNGSI PROCESS SCAN DATA (UNTUK SCAN OK)
// ====================================================
function processScanData(data, idScan, logTimestamp) {
  console.log('🟢 PROCESSING OK SCAN - ID:', idScan);
  
  let resultData = data.resultData;
  
  if (typeof resultData === 'string' && resultData.trim().startsWith('{')) {
    try {
      resultData = JSON.parse(resultData);
    } catch (e) {}
  }

  if (resultData && typeof resultData === 'object') {
    return {
      type: 'SCAN',
      data: {
        idScan: idScan || resultData.PICNO || resultData.ID || 'UNKNOWN',
        containerNo: resultData.CONTAINER_NO || 'N/A',
        truckNo: resultData.FYCO_PRESENT || resultData.TRUCK_NO || 'N/A',
        scanTime: resultData.SCANTIME || logTimestamp,
        status: 'OK',
        image1_path: resultData.IMAGE1_PATH || null,
        image2_path: resultData.IMAGE2_PATH || null,
        image3_path: resultData.IMAGE3_PATH || null,
        image4_path: resultData.IMAGE4_PATH || null,
        image5_path: resultData.IMAGE5_PATH || null,
        image6_path: resultData.IMAGE6_PATH || null,
        errorMessage: null,
        rawData: resultData
      }
    };
  }
  
  return null;
}

module.exports = { parseLogLine };