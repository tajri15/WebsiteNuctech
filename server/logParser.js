const parseLogLine = (line) => {
  console.log('🔍 Parsing line:', line.substring(0, 200) + '...');

  // Extract ID Scan dari log line (sebelum response JSON)
  const idScanMatch = line.match(/center response:([^,]+),/);
  const idScan = idScanMatch ? idScanMatch[1].trim() : null;

  // Extract timestamp dari log line
  const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d{3}/);
  const logTimestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

  // 1. Cek untuk log FTP Upload
  if ((line.includes('FTP') && line.includes('UPLOAD')) || 
      (line.includes('ftp') && line.includes('upload')) ||
      (line.includes('Ftp') && line.includes('Upload'))) {
    
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

  // 2. PATTERN UTAMA UNTUK RESPONSE NOK & OK
  const responsePattern = /center response:.*?response text:\s*(\{.*?\})/i;
  const responseMatch = line.match(responsePattern);
  
  if (responseMatch) {
    const jsonString = responseMatch[1];
    console.log('✅ Found response JSON:', jsonString);
    
    try {
      const data = JSON.parse(jsonString);
      console.log('📋 JSON parsed successfully - resultCode:', data.resultCode);

      // 🚨 HANDLE NOK CASE - resultCode: false
      if (data.resultCode === false) {
        console.log('🔴 PROCESSING NOK SCAN - ID:', idScan);
        console.log('🔴 Error Description:', data.resultDesc);
        
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

      // ✅ HANDLE OK CASE - resultCode: true
      if (data.resultCode === true) {
        console.log('🟢 PROCESSING OK SCAN - ID:', idScan);
        
        let resultData = data.resultData;
        
        // Parse resultData jika berupa string JSON
        if (typeof resultData === 'string' && resultData.trim().startsWith('{')) {
          try {
            resultData = JSON.parse(resultData);
            console.log('📦 Parsed resultData from string');
          } catch (e) {
            console.log('⚠️ Could not parse resultData string, using as-is');
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
          // Jika resultData tidak ada atau bukan object
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

    } catch (error) {
      console.error('❌ JSON parse error:', error.message);
      console.log('Problematic JSON:', jsonString);
    }
  }

  // 3. FALLBACK PATTERN - Cari JSON dengan resultCode:false secara langsung
  // Pattern khusus untuk menangkap {"resultCode":false,...}
  const nokPattern = /\{"resultCode":false[^}]*\}/;
  const nokMatch = line.match(nokPattern);
  
  if (nokMatch) {
    const jsonString = nokMatch[0];
    console.log('🔄 NOK Fallback pattern matched:', jsonString);
    
    try {
      const data = JSON.parse(jsonString);
      
      if (data.resultCode === false) {
        console.log('🔴 PROCESSING NOK SCAN (Fallback) - ID:', idScan);
        console.log('🔴 Error Description:', data.resultDesc);
        
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
    } catch (error) {
      console.log('⚠️ NOK Fallback JSON parse failed');
    }
  }

  // 4. FALLBACK 2 - Cari pattern response text dengan JSON
  const responseTextPattern = /response text:\s*(\{.*\})/i;
  const responseTextMatch = line.match(responseTextPattern);
  
  if (responseTextMatch) {
    const jsonString = responseTextMatch[1];
    console.log('🔄 Response text fallback:', jsonString);
    
    try {
      const data = JSON.parse(jsonString);
      
      if (data.resultCode === false) {
        console.log('🔴 PROCESSING NOK SCAN (Response Text Fallback) - ID:', idScan);
        
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
      
      if (data.resultCode === true) {
        console.log('🟢 PROCESSING OK SCAN (Response Text Fallback) - ID:', idScan);
        // ... (sama seperti bagian OK di atas)
      }
      
    } catch (error) {
      console.log('⚠️ Response text fallback parse failed');
    }
  }

  // 5. Cek untuk connection logs
  if (line.includes('connected') || line.includes('connection') || 
      line.includes('Connected') || line.includes('connect') ||
      line.includes('disconnect') || line.includes('Disconnected')) {
    return {
      type: 'CONNECTION',
      data: {
        message: line.trim(),
        timestamp: new Date().toISOString()
      }
    };
  }

  // 6. Debug: Tampilkan line yang mengandung kata kunci scan tapi tidak terdeteksi
  if (line.includes('center response') || line.includes('resultCode') || 
      line.includes('response text') || (line.includes('false') && line.includes('resultCode'))) {
    console.log('⚠️  POTENTIAL SCAN LINE NOT PARSED:', line.substring(0, 300));
    
    // Debug khusus untuk line yang mengandung resultCode:false tapi tidak terdeteksi
    if (line.includes('resultCode":false')) {
      console.log('🚨 MISSED NOK SCAN - Contains resultCode:false but not parsed!');
      console.log('Full line:', line);
    }
  }

  // 7. Jika bukan keduanya, anggap sebagai log system
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