const parseLogLine = (line) => {
  console.log('🔍 Parsing line:', line.substring(0, 200) + '...');

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

  // 2. Cek untuk response JSON yang berisi data scan - PATTERN DIPERBAIKI
  // Pattern yang lebih fleksibel
  const responsePatterns = [
    /center response:.*?response code: 200,response text:\s*(\{.*\})/i,
    /response text:\s*(\{.*\})/i,
    /"resultCode":(true|false)/i
  ];

  for (const pattern of responsePatterns) {
    const match = line.match(pattern);
    if (match) {
      console.log('✅ Pattern matched:', pattern.toString());
      
      let jsonString = match[1] || line;
      
      // Jika pattern ketiga, cari JSON object lengkap
      if (pattern === responsePatterns[2]) {
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        }
      }

      try {
        console.log('📋 Attempting to parse JSON:', jsonString.substring(0, 200) + '...');
        const data = JSON.parse(jsonString);

        console.log('✅ JSON parsed successfully:', {
          resultCode: data.resultCode,
          hasResultData: !!data.resultData,
          resultDataType: typeof data.resultData
        });

        // Handle case NOK (resultCode: false)
        if (data.resultCode === false) {
          console.log('🔴 Processing NOK scan');
          return {
            type: 'SCAN',
            data: {
              containerNo: 'N/A',
              truckNo: 'N/A',
              scanTime: new Date().toISOString(),
              status: 'NOK',
              image1_path: null,
              image2_path: null,
              image3_path: null,
              image4_path: null,
              errorMessage: data.resultDesc || 'Scan failed',
              rawData: data
            }
          };
        }

        // Handle case OK (resultCode: true) dengan resultData object
        if (data.resultCode === true && data.resultData && typeof data.resultData === 'object') {
          const resultData = data.resultData;
          console.log('🟢 Processing OK scan with resultData object');
          
          return {
            type: 'SCAN',
            data: {
              containerNo: resultData.CONTAINER_NO || 'N/A',
              truckNo: resultData.FYCO_PRESENT || 'N/A',
              scanTime: resultData.SCANTIME || new Date().toISOString(),
              status: 'OK',
              image1_path: resultData.IMAGE1_PATH || null,
              image2_path: resultData.IMAGE2_PATH || null,
              image3_path: resultData.IMAGE3_PATH || null,
              image4_path: resultData.IMAGE4_PATH || null,
              rawData: resultData
            }
          };
        }

        // Handle case OK dengan resultData string atau format lain
        if (data.resultCode === true) {
          console.log('🟢 Processing OK scan without resultData object');
          return {
            type: 'SCAN',
            data: {
              containerNo: 'N/A',
              truckNo: 'N/A',
              scanTime: new Date().toISOString(),
              status: 'OK',
              image1_path: null,
              image2_path: null,
              image3_path: null,
              image4_path: null,
              rawData: data
            }
          };
        }

      } catch (error) {
        console.error('❌ JSON parse error:', error.message);
        continue; // Coba pattern berikutnya
      }
    }
  }

  // 3. Fallback: Cek untuk JSON langsung di baris
  const jsonMatch = line.match(/\{.*\}/);
  if (jsonMatch) {
    try {
      const jsonString = jsonMatch[0];
      console.log('🔍 Fallback JSON detection attempt:', jsonString.substring(0, 200) + '...');
      
      const data = JSON.parse(jsonString);
      
      // Cek jika ini adalah struktur scan data
      if (data.resultCode !== undefined) {
        console.log('🔄 Processing via fallback JSON');
        
        // Handle NOK case
        if (data.resultCode === false) {
          return {
            type: 'SCAN',
            data: {
              containerNo: 'N/A',
              truckNo: 'N/A',
              scanTime: new Date().toISOString(),
              status: 'NOK',
              image1_path: null,
              image2_path: null,
              image3_path: null,
              image4_path: null,
              errorMessage: data.resultDesc || 'Scan failed',
              rawData: data
            }
          };
        }
        
        // Handle OK case dengan resultData
        if (data.resultCode === true && data.resultData && typeof data.resultData === 'object') {
          const resultData = data.resultData;
          return {
            type: 'SCAN',
            data: {
              containerNo: resultData.CONTAINER_NO || 'N/A',
              truckNo: resultData.FYCO_PRESENT || 'N/A',
              scanTime: resultData.SCANTIME || new Date().toISOString(),
              status: 'OK',
              image1_path: resultData.IMAGE1_PATH || null,
              image2_path: resultData.IMAGE2_PATH || null,
              image3_path: resultData.IMAGE3_PATH || null,
              image4_path: resultData.IMAGE4_PATH || null,
              rawData: resultData
            }
          };
        }
      }

    } catch (error) {
      console.log('⚠️ Fallback JSON parse failed, ignoring line');
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

  // 5. Jika bukan keduanya, anggap sebagai log system
  return { 
    type: 'SYSTEM_LOG',
    data: {
      message: line.trim(),
      timestamp: new Date().toISOString()
    }
  };
};

module.exports = { parseLogLine };