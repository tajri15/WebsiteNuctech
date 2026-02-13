const parseLogLine = (line) => {
  console.log('🔍 Parsing line:', line.substring(0, 200) + '...');

  // Extract timestamp dari log line
  const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}/);
  const logTimestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

  // PRIORITAS 1: DETEKSI SCAN LINE (YANG BENAR)
  const isScanLine = line.includes('center response:') && 
                     line.includes('response code: 200') && 
                     line.includes('response text:') &&
                     !line.includes('**FTP**  UPLOAD'); // PASTIKAN BUKAN FTP
  
  if (isScanLine) {
    // Extract ID Scan dari format: "center response:62001FS02202602130008,"
    const idScanMatch = line.match(/center response:([^,\s]+)/);
    const idScan = idScanMatch ? idScanMatch[1].trim() : null;
    
    console.log('✅✅✅ SCAN VALID TERDETEKSI - ID:', idScan);
    console.log('📋 Timestamp:', logTimestamp);
    
    // Extract JSON dari response text
    // Format: response text: {"resultCode":false,...}
    const jsonMatch = line.match(/response text:\s*(\{.*\})/);
    
    if (jsonMatch) {
      try {
        // Parse JSON langsung
        const data = JSON.parse(jsonMatch[1]);
        console.log('📦 JSON parsed - resultCode:', data.resultCode);
        return processScanData(data, idScan, logTimestamp);
        
      } catch (e) {
        console.log('⚠️ JSON parse error, mencoba perbaiki...');
        
        try {
          // Perbaiki JSON jika rusak
          let jsonStr = jsonMatch[1];
          
          // Tambah kurung tutup jika kurang
          if (!jsonStr.endsWith('}')) {
            jsonStr = jsonStr + '}';
          }
          
          // Hapus karakter aneh
          jsonStr = jsonStr.replace(/[^\x20-\x7E{}:",\[\]truefalsenul]+/g, '');
          
          const data = JSON.parse(jsonStr);
          console.log('✅ JSON berhasil diperbaiki');
          return processScanData(data, idScan, logTimestamp);
          
        } catch (e2) {
          console.error('❌ GAGAL parse JSON setelah perbaikan:', e2.message);
          return null; // SKIP LINE INI
        }
      }
    } else {
      console.log('⚠️ Scan line tanpa JSON, diabaikan');
      return null;
    }
  }

  // ====================================================
  // PRIORITAS 2: DETEKSI FTP UPLOAD
  // ====================================================
  // Harus mengandung "**FTP**  UPLOAD" (exact match)
  if (line.includes('**FTP**  UPLOAD')) {
    console.log('📤 FTP UPLOAD TERDETEKSI');
    
    // Extract IP dari "---TO:10.226.62.31\home\..."
    const ipMatch = line.match(/---TO:([^\\]+)/);
    
    // Extract filename dari "---FROM:D:/Image/.../filename.jpg"
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
  // PRIORITAS 3: DETEKSI CONNECTION LOGS
  // ====================================================
  if (line.includes('login') || 
      line.includes('logout') || 
      line.includes('connected') || 
      line.includes('disconnected') ||
      line.includes('FTP connection')) {
    
    return {
      type: 'CONNECTION',
      data: {
        message: line.trim(),
        timestamp: logTimestamp
      }
    };
  }

  // ====================================================
  // DEFAULT: SYSTEM LOG (DIABAIKAN)
  // ====================================================
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
// FUNGSI PROCESS SCAN DATA
// ====================================================
function processScanData(data, idScan, logTimestamp) {
  
  // CASE 1: SCAN NOK (resultCode: false)
  if (data.resultCode === false) {
    console.log('🔴 SCAN NOK - ID:', idScan);
    console.log('🔴 Error:', data.resultDesc);
    
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
        errorMessage: data.resultDesc || 'Scan failed',
        rawData: data
      }
    };
  }

  // CASE 2: SCAN OK (resultCode: true)
  if (data.resultCode === true) {
    console.log('🟢 SCAN OK - ID:', idScan);
    
    let resultData = data.resultData;
    
    // Parse resultData jika berupa string JSON
    if (typeof resultData === 'string' && resultData.trim().startsWith('{')) {
      try {
        resultData = JSON.parse(resultData);
        console.log('📦 resultData parsed from string');
      } catch (e) {
        console.log('⚠️ resultData bukan JSON string');
      }
    }

    // Jika resultData adalah object yang valid
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
    } else {
      // Fallback jika resultData tidak ada
      return {
        type: 'SCAN',
        data: {
          idScan: idScan || 'UNKNOWN',
          containerNo: 'N/A',
          truckNo: 'N/A',
          scanTime: logTimestamp,
          status: 'OK',
          image1_path: null,
          image2_path: null,
          image3_path: null,
          image4_path: null,
          image5_path: null,
          image6_path: null,
          errorMessage: null,
          rawData: data
        }
      };
    }
  }

  // CASE 3: Format tidak dikenal
  console.log('⚠️ Unknown scan format:', data);
  return null;
}

module.exports = { parseLogLine };