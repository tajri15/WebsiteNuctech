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

  // 2. PATTERN UTAMA - Cari response JSON dengan berbagai pattern
  const responsePatterns = [
    /center response:.*?response text:\s*(\{.*?})\s*$/i,  // Pattern utama
    /response text:\s*(\{.*?})\s*$/i,  // Fallback 1
    /(\{"resultCode":(true|false).*?})/i  // Fallback 2
  ];

  for (const pattern of responsePatterns) {
    const match = line.match(pattern);
    if (match) {
      let jsonString = match[1];
      console.log('✅ Pattern matched:', pattern.toString());
      console.log('📋 Raw JSON string:', jsonString);

      try {
        // Coba parse JSON langsung
        const data = JSON.parse(jsonString);
        console.log('✅ JSON parsed successfully - resultCode:', data.resultCode);

        return processScanData(data, idScan, logTimestamp);

      } catch (parseError) {
        console.log('⚠️ First parse failed, trying to fix JSON...');
        
        // Coba perbaiki JSON yang rusak
        try {
          // Tambahkan kurung tutup jika diperlukan
          if (!jsonString.endsWith('}')) {
            jsonString = jsonString + '}';
            console.log('🔧 Fixed JSON - added closing brace');
          }
          
          // Hapus karakter newline atau spasi berlebih
          jsonString = jsonString.trim();
          
          const data = JSON.parse(jsonString);
          console.log('✅ JSON fixed and parsed successfully - resultCode:', data.resultCode);
          
          return processScanData(data, idScan, logTimestamp);
          
        } catch (fixError) {
          console.error('❌ JSON fix failed:', fixError.message);
          continue; // Coba pattern berikutnya
        }
      }
    }
  }

  // 3. FALLBACK - Cari JSON secara manual di line
  const jsonStart = line.indexOf('{"resultCode":');
  if (jsonStart !== -1) {
    const jsonSubstring = line.substring(jsonStart);
    const jsonEnd = jsonSubstring.indexOf('}');
    
    if (jsonEnd !== -1) {
      let jsonString = jsonSubstring.substring(0, jsonEnd + 1);
      console.log('🔄 Manual JSON extraction:', jsonString);
      
      try {
        const data = JSON.parse(jsonString);
        console.log('✅ Manual JSON parsed - resultCode:', data.resultCode);
        
        return processScanData(data, idScan, logTimestamp);
        
      } catch (error) {
        console.log('❌ Manual JSON parse failed');
      }
    }
  }

  // 4. Cek untuk connection logs
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

  // 5. Debug: Tampilkan line yang mengandung kata kunci scan tapi tidak terdeteksi
  if (line.includes('center response') || line.includes('resultCode') || 
      line.includes('response text')) {
    console.log('⚠️  POTENTIAL SCAN LINE NOT PARSED:', line.substring(0, 300));
  }

  // 6. Jika bukan keduanya, anggap sebagai log system
  return { 
    type: 'SYSTEM_LOG',
    data: {
      message: line.trim(),
      timestamp: new Date().toISOString(),
      ignored: true
    }
  };
};

// 🔧 FUNGSI BARU UNTUK PROCESS SCAN DATA
function processScanData(data, idScan, logTimestamp) {
  // Handle case NOK (resultCode: false)
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

  // Handle case OK (resultCode: true)
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
}

module.exports = { parseLogLine };