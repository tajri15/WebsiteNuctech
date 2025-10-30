const parseLogLine = (line) => {
  console.log('🔍 Parsing line:', line.substring(0, 200) + '...');

  // 1. Cari JSON di dalam line (pattern yang lebih general)
  const jsonMatch = line.match(/\{"resultCode":false,"resultDesc":"[^"]*","resultData":"[^"]*"\}/);
  
  if (jsonMatch) {
    const jsonString = jsonMatch[0];
    console.log('🚨 FOUND NOK JSON:', jsonString);
    
    try {
      const data = JSON.parse(jsonString);
      
      // Extract ID Scan dari line (sebelum JSON)
      const idScanMatch = line.match(/center response:([^,]+),/);
      const idScan = idScanMatch ? idScanMatch[1].trim() : 'UNKNOWN';
      
      // Extract timestamp
      const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}/);
      const logTimestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

      console.log('🔴 PROCESSING REAL NOK:', {
        idScan: idScan,
        error: data.resultDesc,
        timestamp: logTimestamp
      });

      return {
        type: 'SCAN',
        data: {
          idScan: idScan,
          containerNo: 'N/A',
          truckNo: 'N/A',
          scanTime: logTimestamp,
          status: 'NOK',
          image1_path: null,
          image2_path: null,
          image3_path: null,
          image4_path: null,
          errorMessage: data.resultDesc,
          rawData: data
        }
      };

    } catch (error) {
      console.error('❌ JSON parse error:', error.message);
    }
  }

  // 2. Juga cari untuk OK scans
  const okJsonMatch = line.match(/\{"resultCode":true[^}]*\}/);
  if (okJsonMatch) {
    const jsonString = okJsonMatch[0];
    console.log('✅ FOUND OK JSON:', jsonString.substring(0, 200) + '...');
    
    try {
      const data = JSON.parse(jsonString);
      
      // Extract ID Scan
      const idScanMatch = line.match(/center response:([^,]+),/);
      const idScan = idScanMatch ? idScanMatch[1].trim() : 'UNKNOWN';
      
      // Extract timestamp
      const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}/);
      const logTimestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

      const resultData = data.resultData || {};

      console.log('🟢 PROCESSING OK SCAN:', {
        idScan: idScan,
        container: resultData.CONTAINER_NO,
        timestamp: logTimestamp
      });

      return {
        type: 'SCAN',
        data: {
          idScan: idScan,
          containerNo: resultData.CONTAINER_NO || 'N/A',
          truckNo: resultData.FYCO_PRESENT || 'N/A',
          scanTime: resultData.SCANTIME || logTimestamp,
          status: 'OK',
          image1_path: resultData.IMAGE1_PATH || null,
          image2_path: resultData.IMAGE2_PATH || null,
          image3_path: resultData.IMAGE3_PATH || null,
          image4_path: resultData.IMAGE4_PATH || null,
          image5_path: resultData.IMAGE5_PATH || null,
          image6_path: resultData.IMAGE6_PATH || null,
          rawData: resultData
        }
      };

    } catch (error) {
      console.error('❌ OK JSON parse error:', error.message);
    }
  }

  // 3. FTP Upload (tetap proses)
  if ((line.includes('FTP') && line.includes('UPLOAD')) || 
      (line.includes('ftp') && line.includes('upload'))) {
    
    const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    const fileMatch = line.match(/([\w\-\.]+\.(jpg|png|jpeg|txt|log|zip|rar|img))/i);
    
    return {
      type: 'FTP_UPLOAD',
      data: {
        ip: ipMatch ? ipMatch[1] : 'Unknown IP',
        file: fileMatch ? fileMatch[1] : 'Unknown file',
        timestamp: new Date().toISOString(),
        rawMessage: line.trim()
      }
    };
  }

  // 4. Abaikan semua line lainnya
  return { 
    type: 'SYSTEM_LOG',
    data: {
      message: line.trim(),
      timestamp: new Date().toISOString(),
      ignored: true
    }
  };
};

module.exports = { parseLogLine };