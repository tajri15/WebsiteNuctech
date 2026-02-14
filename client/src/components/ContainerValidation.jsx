import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  DatePicker,
  Typography,
  message,
  Modal,
  Image,
  Tooltip,
  Row,
  Col,
  Statistic,
  Select,
  Input,
  Divider,
  Badge,
  Alert,
  Progress
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  FilePdfOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
  ScanOutlined,
  EditOutlined,
  QuestionCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import axios from 'axios';
import Tesseract from 'tesseract.js';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const API_BASE = 'http://localhost:5000';

// ============================================================
// Validasi format container (4 huruf + 7 angka)
// ============================================================
const validateContainerFormat = (containerNo) => {
  if (!containerNo || containerNo.trim() === '') {
    return { isValid: false, reason: 'empty' };
  }

  const pattern = /^[A-Z]{4}\d{7}$/;
  const trimmed = containerNo.trim().toUpperCase();

  return {
    isValid: pattern.test(trimmed),
    reason: pattern.test(trimmed) ? 'valid' : 'invalid_format'
  };
};

// ============================================================
// PREPROCESSING GAMBAR (OPTIMASI UNTUK OCR)
// ============================================================
const preprocessImage = (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;
    
    img.onload = () => {
      try {
        // Buat canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize untuk performa dan akurasi
        const maxWidth = 1200; // Resolusi lebih tinggi
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;
        
        // Gambar dengan smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Ambil data pixel
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // ====================================================
        // STEP 1: Grayscale + Kontras Tinggi
        // ====================================================
        for (let i = 0; i < data.length; i += 4) {
          // Konversi ke grayscale
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Rumus grayscale yang baik (mempertahankan kontras)
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          
          // Tingkatkan kontras
          let contrast = 1.5; // Faktor kontras
          let adjusted = 128 + contrast * (gray - 128);
          
          // Clamping
          adjusted = Math.max(0, Math.min(255, adjusted));
          
          // Threshold adaptif (hitam putih tegas)
          const threshold = 120;
          const value = adjusted > threshold ? 255 : 0;
          
          data[i] = value;     // R
          data[i + 1] = value; // G
          data[i + 2] = value; // B
          // Alpha tetap
        }
        
        // ====================================================
        // STEP 2: Sharpen (Tajamkan tepi)
        // ====================================================
        // Sederhana: kita sudah pakai kontras tinggi
        
        ctx.putImageData(imageData, 0, 0);
        
        // Konversi ke blob untuk performa lebih baik
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          resolve(url);
        }, 'image/png', 1.0);
        
      } catch (err) {
        console.error('❌ Preprocessing error:', err);
        reject(err);
      }
    };
    
    img.onerror = (err) => {
      console.error('❌ Image load error:', err);
      reject(err);
    };
  });
};

// ============================================================
// EKSTRAK NOMOR CONTAINER DARI TEKS OCR
// ============================================================
const extractContainerNumber = (text) => {
  if (!text) return null;
  
  console.log('🔍 Mengekstrak dari teks:', text);
  
  // Bersihkan teks
  const cleanText = text.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
  
  // ====================================================
  // POLA 1: Format BAKU (4 huruf + 7 angka)
  // ====================================================
  const pattern1 = /\b([A-Z]{4})\s*(\d{7})\b/;
  const match1 = cleanText.match(pattern1);
  if (match1) {
    const result = match1[1] + match1[2];
    console.log('✅ Pola 1 cocok:', result);
    return result;
  }
  
  // ====================================================
  // POLA 2: 4 huruf + spasi + 7 angka
  // ====================================================
  const pattern2 = /([A-Z]{4})\s+(\d{7})/;
  const match2 = cleanText.match(pattern2);
  if (match2) {
    const result = match2[1] + match2[2];
    console.log('✅ Pola 2 cocok:', result);
    return result;
  }
  
  // ====================================================
  // POLA 3: 4 huruf + 7 angka (tanpa batas kata)
  // ====================================================
  const pattern3 = /[A-Z]{4}\d{7}/;
  const match3 = cleanText.match(pattern3);
  if (match3) {
    console.log('✅ Pola 3 cocok:', match3[0]);
    return match3[0];
  }
  
  // ====================================================
  // POLA 4: Toleransi OCR (huruf mirip angka)
  // ====================================================
  // Ganti huruf yang sering salah terbaca
  let corrected = cleanText
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/G/g, '6');
  
  const pattern4 = /[A-Z0-9]{4}\d{7}/;
  const match4 = corrected.match(pattern4);
  if (match4) {
    console.log('✅ Pola 4 (koreksi) cocok:', match4[0]);
    return match4[0];
  }
  
  // ====================================================
  // POLA 5: Cari kata yang panjangnya 11 karakter (4+7)
  // ====================================================
  const words = cleanText.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[^A-Z0-9]/g, '');
    if (cleanWord.length === 11) {
      // Cek apakah formatnya 4 huruf + 7 angka
      const letters = cleanWord.substring(0, 4);
      const numbers = cleanWord.substring(4);
      if (/^[A-Z]{4}$/.test(letters) && /^\d{7}$/.test(numbers)) {
        console.log('✅ Pola 5 (kata panjang) cocok:', cleanWord);
        return cleanWord;
      }
    }
  }
  
  console.log('❌ Tidak menemukan pola container number');
  return null;
};

// ============================================================
// OCR DENGAN TESSERACT (OFFLINE)
// ============================================================
const extractContainerFromImage = async (imageUrl, retryCount = 0) => {
  try {
    console.log(`🔍 OCR Attempt ${retryCount + 1}:`, imageUrl);
    
    // Preprocessing gambar dulu
    const processedImageUrl = await preprocessImage(imageUrl);
    
    // Konfigurasi Tesseract untuk container number
    const result = await Tesseract.recognize(
      processedImageUrl,
      'eng',
      {
        // Whitelist karakter (hanya huruf kapital dan angka)
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        
        // Mode segmentasi:
        // 6 = Treat as a single uniform block of text
        // 7 = Treat the image as a single text line
        tessedit_pageseg_mode: '7',
        
        // Mode engine: 3 = Default + LSTM (paling akurat)
        tessedit_ocr_engine_mode: '3',
        
        // Optimasi tambahan
        textord_heavy_nr: '1',           // Noise reduction
        textord_min_linesize: '2.5',      // Minimum text size
        textord_words_default_min_height: '10', // Min character height
        
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`📖 OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );
    
    const text = result.data.text;
    console.log('📝 Raw OCR Result:', text);
    
    // Ekstrak nomor container
    const containerNo = extractContainerNumber(text);
    
    if (containerNo) {
      console.log('✅ Berhasil baca:', containerNo);
      return containerNo;
    }
    
    // Coba lagi dengan konfigurasi berbeda jika gagal
    if (retryCount < 2) {
      console.log('⚠️ Gagal, coba lagi dengan konfigurasi berbeda...');
      return extractContainerFromImage(imageUrl, retryCount + 1);
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ OCR Error:', error);
    
    // Retry jika error
    if (retryCount < 2) {
      console.log('⚠️ Error, coba lagi...');
      return extractContainerFromImage(imageUrl, retryCount + 1);
    }
    
    return null;
  }
};

// ============================================================
// Main Component
// ============================================================
const ContainerValidation = () => {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validationRecord, setValidationRecord] = useState(null);
  const [manualContainerNo, setManualContainerNo] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [stats, setStats] = useState({
    total: 0,
    formatValid: 0,
    formatInvalid: 0,
    validImage: 0,
    invalidImage: 0,
    unchecked: 0
  });

  // ============================================================
  // Fetch data dari API
  // ============================================================
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD HH:mm:ss');
      if (dateRange?.[1]) params.endDate = dateRange[1].format('YYYY-MM-DD HH:mm:ss');

      const res = await axios.get(`${API_BASE}/api/container-validation`, { params });

      // Enrich data dengan validasi format
      const enriched = res.data.data.map(item => {
        const formatValidation = validateContainerFormat(item.container_no);
        const images = [
          item.image1_path, item.image2_path, item.image3_path,
          item.image4_path, item.image5_path, item.image6_path,
          item.image7_path, item.image8_path
        ].filter(Boolean);

        return {
          ...item,
          formatValid: formatValidation.isValid,
          formatReason: formatValidation.reason,
          images
        };
      });

      setRawData(enriched);
      
      // Hitung statistik
      const total = enriched.length;
      const formatValid = enriched.filter(d => d.formatValid).length;
      const validImage = enriched.filter(d => d.validation_status === 'VALID').length;
      const invalidImage = enriched.filter(d => d.validation_status === 'INVALID').length;
      const unchecked = enriched.filter(d => !d.validation_status).length;
      
      setStats({
        total,
        formatValid,
        formatInvalid: total - formatValid,
        validImage,
        invalidImage,
        unchecked
      });
      
      messageApi.success(`${enriched.length} data dimuat`);
    } catch (err) {
      console.error(err);
      messageApi.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, messageApi]);

  // ============================================================
  // Filter data
  // ============================================================
  useEffect(() => {
    let d = [...rawData];
    
    if (selectedStatus === 'format_valid') d = d.filter(x => x.formatValid);
    if (selectedStatus === 'format_invalid') d = d.filter(x => !x.formatValid);
    if (selectedStatus === 'image_valid') d = d.filter(x => x.validation_status === 'VALID');
    if (selectedStatus === 'image_invalid') d = d.filter(x => x.validation_status === 'INVALID');
    if (selectedStatus === 'unchecked') d = d.filter(x => !x.validation_status);
    
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      d = d.filter(x =>
        (x.container_no || '').toLowerCase().includes(s) ||
        (x.id_scan || '').toLowerCase().includes(s) ||
        (x.correct_container_no || '').toLowerCase().includes(s)
      );
    }
    
    setFilteredData(d);
  }, [rawData, selectedStatus, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ============================================================
  // VALIDASI SATU RECORD DENGAN OCR
  // ============================================================
  const validateSingleRecord = async (record) => {
    if (!record.images || record.images.length === 0) {
      messageApi.warning('Tidak ada gambar untuk divalidasi');
      return;
    }
    
    setOcrLoading(true);
    
    try {
      // Ambil gambar pertama (biasanya yang paling jelas)
      const imageUrl = `${API_BASE}/images/${record.images[0]}`;
      
      // Tampilkan progress
      const hideLoading = messageApi.loading('Memproses gambar...', 0);
      
      // Baca nomor container dari gambar
      const containerFromImage = await extractContainerFromImage(imageUrl);
      
      hideLoading();
      
      if (containerFromImage) {
        const ocrResult = record.container_no || '';
        const isMatch = containerFromImage === ocrResult;
        
        // Simpan hasil ke database
        await axios.post(`${API_BASE}/api/update-validation-result`, {
          scanId: record.id,
          imageText: containerFromImage,
          isMatch,
          similarity: isMatch ? 100 : 0
        });
        
        if (isMatch) {
          messageApi.success({
            content: `✅ VALID: Nomor container sesuai dengan gambar (${containerFromImage})`,
            duration: 5
          });
        } else {
          messageApi.error({
            content: `❌ INVALID: Gambar="${containerFromImage}", OCR="${ocrResult}"`,
            duration: 8
          });
        }
        
        // Refresh data
        fetchData();
      } else {
        messageApi.warning('Tidak dapat membaca nomor container dari gambar');
      }
    } catch (err) {
      messageApi.error('Gagal memproses gambar');
      console.error(err);
    } finally {
      setOcrLoading(false);
    }
  };

  // ============================================================
  // VALIDASI SEMUA RECORD
  // ============================================================
  const validateAllRecords = async () => {
    const unchecked = filteredData.filter(d => !d.validation_status && d.images?.length > 0);
    
    if (unchecked.length === 0) {
      messageApi.info('Tidak ada data yang perlu divalidasi');
      return;
    }
    
    setValidating(true);
    
    let success = 0;
    let failed = 0;
    
    const hideLoading = messageApi.loading(`Memvalidasi ${unchecked.length} data...`, 0);
    
    for (let i = 0; i < unchecked.length; i++) {
      const record = unchecked[i];
      try {
        const imageUrl = `${API_BASE}/images/${record.images[0]}`;
        const containerFromImage = await extractContainerFromImage(imageUrl);
        
        if (containerFromImage) {
          const isMatch = containerFromImage === (record.container_no || '');
          
          await axios.post(`${API_BASE}/api/update-validation-result`, {
            scanId: record.id,
            imageText: containerFromImage,
            isMatch,
            similarity: isMatch ? 100 : 0
          });
          
          success++;
        } else {
          failed++;
        }
        
        // Update progress setiap 5 data
        if ((i + 1) % 5 === 0) {
          messageApi.loading(`Progress: ${i + 1}/${unchecked.length}`, 0);
        }
        
      } catch (err) {
        failed++;
      }
    }
    
    hideLoading();
    messageApi.success(`Selesai! ${success} berhasil, ${failed} gagal`);
    
    setValidating(false);
    fetchData();
  };

  // ============================================================
  // OPEN MANUAL VALIDATION MODAL
  // ============================================================
  const openManualValidation = async (record) => {
    setValidationRecord(record);
    setManualContainerNo(record.container_no || '');
    setValidationModalVisible(true);
    setOcrResult(null);
    
    // Coba baca dari gambar otomatis
    if (record.images && record.images.length > 0) {
      const imageUrl = `${API_BASE}/images/${record.images[0]}`;
      const result = await extractContainerFromImage(imageUrl);
      if (result) {
        setOcrResult(result);
        setManualContainerNo(result); // Isi otomatis dengan hasil OCR
      }
    }
  };

  // ============================================================
  // HANDLE MANUAL VALIDATION
  // ============================================================
  const handleManualValidation = async () => {
    if (!manualContainerNo.trim()) {
      messageApi.warning('Nomor container tidak boleh kosong');
      return;
    }

    try {
      await axios.post(`${API_BASE}/api/manual-container-validation`, {
        scanId: validationRecord.id,
        correctContainerNo: manualContainerNo.toUpperCase()
      });

      messageApi.success('Nomor container berhasil diperbaiki');
      setValidationModalVisible(false);
      fetchData();
    } catch (err) {
      messageApi.error('Gagal menyimpan');
      console.error(err);
    }
  };

  // ============================================================
  // DOWNLOAD PDF
  // ============================================================
  const downloadPDF = () => {
    if (!filteredData.length) {
      messageApi.warning('Tidak ada data untuk diexport');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });

    // HEADER
    doc.setFontSize(18);
    doc.setTextColor(0, 21, 41);
    doc.text('LAPORAN VALIDASI CONTAINER', 14, 15);

    doc.setFontSize(10);
    doc.setTextColor(100);
    
    let periodeText = 'Periode: SEMUA DATA';
    if (dateRange?.[0] && dateRange?.[1]) {
      periodeText = `Periode: ${dateRange[0].format('DD/MM/YYYY HH:mm')} - ${dateRange[1].format('DD/MM/YYYY HH:mm')}`;
    }
    doc.text(periodeText, 14, 22);
    doc.text(`Dicetak: ${dayjs().format('DD/MM/YYYY HH:mm:ss')}`, 14, 28);
    
    // STATISTIK RINGKAS
    doc.setFontSize(11);
    doc.setTextColor(0, 102, 204);
    doc.text('RINGKASAN', 14, 38);
    
    doc.setFontSize(9);
    doc.setTextColor(50);
    doc.text(`Total Data: ${filteredData.length}`, 14, 45);
    doc.text(`Format Valid: ${filteredData.filter(d => d.formatValid).length}`, 14, 52);
    doc.text(`Format Invalid: ${filteredData.filter(d => !d.formatValid).length}`, 14, 59);
    doc.text(`Valid Gambar: ${filteredData.filter(d => d.validation_status === 'VALID').length}`, 80, 45);
    doc.text(`Invalid Gambar: ${filteredData.filter(d => d.validation_status === 'INVALID').length}`, 80, 52);
    doc.text(`Belum Dicek: ${filteredData.filter(d => !d.validation_status).length}`, 80, 59);

    // TABEL
    autoTable(doc, {
      startY: 70,
      head: [['No', 'ID Scan', 'Hasil OCR', 'Dari Gambar', 'Status Valid', 'Waktu Scan']],
      body: filteredData.map((item, i) => [
        i + 1,
        item.id_scan || '-',
        item.container_no || '-',
        item.correct_container_no || '-',
        item.validation_status || 'BELUM',
        dayjs(item.scan_time).format('DD/MM/YYYY HH:mm')
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 21, 41], textColor: 255 },
      columnStyles: {
        4: { 
          cellWidth: 25,
          halign: 'center',
          cellCallback: (cell, data) => {
            if (cell.raw === 'VALID') cell.styles.fillColor = [230, 255, 230];
            if (cell.raw === 'INVALID') cell.styles.fillColor = [255, 230, 230];
          }
        }
      }
    });

    // HALAMAN KHUSUS UNTUK YANG INVALID
    const invalidData = filteredData.filter(d => d.validation_status === 'INVALID');
    if (invalidData.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(255, 0, 0);
      doc.text('DATA TIDAK VALID (PERLU DIPERBAIKI)', 14, 20);
      
      autoTable(doc, {
        startY: 30,
        head: [['No', 'ID Scan', 'OCR Result', 'Seharusnya', 'Waktu Scan']],
        body: invalidData.map((item, i) => [
          i + 1,
          item.id_scan || '-',
          item.container_no || '-',
          item.correct_container_no || '-',
          dayjs(item.scan_time).format('DD/MM/YYYY HH:mm')
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [255, 0, 0], textColor: 255 }
      });
    }

    doc.save(`Validasi_Container_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`);
    messageApi.success('PDF berhasil didownload');
  };

  // ============================================================
  // TABLE COLUMNS
  // ============================================================
  const columns = [
    {
      title: 'No',
      key: 'no',
      width: 50,
      render: (_, __, i) => i + 1
    },
    {
      title: 'Format',
      key: 'formatStatus',
      width: 80,
      render: (_, record) => (
        record.formatValid 
          ? <Tag color="success">✓ FORMAT</Tag>
          : <Tag color="error">✗ FORMAT</Tag>
      )
    },
    {
      title: 'Validasi Gambar',
      key: 'imageStatus',
      width: 120,
      render: (_, record) => {
        if (record.validation_status === 'VALID') {
          return <Tag icon={<CheckCircleOutlined />} color="success">✓ VALID</Tag>;
        }
        if (record.validation_status === 'INVALID') {
          return (
            <Tooltip title={`OCR: ${record.container_no}, Benar: ${record.correct_container_no}`}>
              <Tag icon={<CloseCircleOutlined />} color="error">✗ INVALID</Tag>
            </Tooltip>
          );
        }
        return <Tag color="default">⏳ BELUM</Tag>;
      }
    },
    {
      title: 'ID Scan',
      dataIndex: 'id_scan',
      width: 180,
      ellipsis: true
    },
    {
      title: 'Hasil OCR',
      dataIndex: 'container_no',
      width: 150,
      render: (text, record) => (
        <Text style={{ 
          color: record.validation_status === 'VALID' ? '#52c41a' : 
                 record.validation_status === 'INVALID' ? '#ff4d4f' : 'inherit',
          fontWeight: 'bold'
        }}>
          {text || '-'}
        </Text>
      )
    },
    {
      title: 'Nomor dari Gambar',
      dataIndex: 'correct_container_no',
      width: 150,
      render: (text) => text || '-'
    },
    {
      title: 'Waktu Scan',
      dataIndex: 'scan_time',
      width: 150,
      render: t => dayjs(t).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Gambar',
      key: 'images',
      width: 60,
      align: 'center',
      render: (_, record) => (
        <Badge count={record.images.length} color="#1890ff" showZero>
          <PictureOutlined style={{ fontSize: 18 }} />
        </Badge>
      )
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<ScanOutlined />}
            onClick={() => validateSingleRecord(record)}
            loading={ocrLoading}
            disabled={!record.images || record.images.length === 0}
          >
            Cek
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRecord(record);
              setImageModalVisible(true);
            }}
            disabled={!record.images || record.images.length === 0}
          />
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openManualValidation(record)}
          >
            Perbaiki
          </Button>
        </Space>
      )
    }
  ];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {contextHolder}

      {/* HEADER */}
      <div style={{
        background: 'linear-gradient(135deg, #001529 0%, #002140 100%)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 12 }} />
          Validasi Container (OFFLINE OCR)
        </Title>
        <Text style={{ color: 'rgba(255,255,255,0.7)' }}>
          Membaca nomor container langsung dari gambar menggunakan Tesseract.js
        </Text>
      </div>

      {/* STATISTIK */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic title="Total Scan" value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic 
              title="Format Valid" 
              value={stats.formatValid} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic 
              title="Format Invalid" 
              value={stats.formatInvalid} 
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ background: '#f6ffed' }}>
            <Statistic 
              title="✓ Valid Gambar" 
              value={stats.validImage} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ background: '#fff1f0' }}>
            <Statistic 
              title="✗ Invalid Gambar" 
              value={stats.invalidImage} 
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card style={{ background: '#e6f7ff' }}>
            <Statistic 
              title="⏳ Belum Dicek" 
              value={stats.unchecked} 
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* FILTER DAN ACTION */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <RangePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: '100%' }}
              onChange={setDateRange}
              placeholder={['Dari', 'Sampai']}
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={setSelectedStatus}
            >
              <Option value="all">🔵 Semua Data</Option>
              <Option value="format_valid">✅ Format Valid</Option>
              <Option value="format_invalid">❌ Format Invalid</Option>
              <Option value="image_valid">✓ Valid Gambar</Option>
              <Option value="image_invalid">✗ Invalid Gambar</Option>
              <Option value="unchecked">⏳ Belum Dicek</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Input
              placeholder="Cari container number..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Button
              type="primary"
              icon={<ScanOutlined />}
              onClick={validateAllRecords}
              loading={validating}
              block
              disabled={stats.unchecked === 0}
            >
              Validasi Semua
            </Button>
          </Col>
          <Col span={4}>
            <Button
              icon={<FilePdfOutlined />}
              onClick={downloadPDF}
              block
            >
              Download PDF
            </Button>
          </Col>
        </Row>
      </Card>

      {/* INFO TESSERACT */}
      <Alert
        message="OCR Offline dengan Tesseract.js"
        description="Membaca nomor container langsung dari gambar secara offline. Hasil tidak 100% akurat, gunakan tombol 'Perbaiki' untuk koreksi manual."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* TABEL */}
      <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{ 
            pageSize: 20,
            showTotal: total => `Total ${total} data`
          }}
          rowClassName={record => {
            if (record.validation_status === 'VALID') return 'row-valid';
            if (record.validation_status === 'INVALID') return 'row-invalid';
            if (!record.validation_status && record.images?.length > 0) return 'row-pending';
            return '';
          }}
        />
      </Card>

      {/* MODAL LIHAT GAMBAR */}
      <Modal
        title={`Gambar Container: ${selectedRecord?.container_no || ''}`}
        open={imageModalVisible}
        onCancel={() => setImageModalVisible(false)}
        footer={null}
        width={900}
      >
        {selectedRecord && (
          <>
            <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Text type="secondary">Hasil OCR:</Text>
                  <div><Text strong>{selectedRecord.container_no}</Text></div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Dari Gambar:</Text>
                  <div>
                    <Text strong style={{ color: selectedRecord.correct_container_no ? '#52c41a' : '#999' }}>
                      {selectedRecord.correct_container_no || 'Belum dibaca'}
                    </Text>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Status:</Text>
                  <div>
                    {selectedRecord.validation_status === 'VALID' && <Tag color="success">✓ VALID</Tag>}
                    {selectedRecord.validation_status === 'INVALID' && <Tag color="error">✗ INVALID</Tag>}
                    {!selectedRecord.validation_status && <Tag color="default">⏳ BELUM</Tag>}
                  </div>
                </Col>
              </Row>
            </div>
            <Image.PreviewGroup>
              <Row gutter={[8, 8]}>
                {selectedRecord.images.map((img, idx) => (
                  <Col key={idx} span={8}>
                    <Image
                      src={`${API_BASE}/images/${img}`}
                      style={{ height: 180, objectFit: 'contain' }}
                    />
                  </Col>
                ))}
              </Row>
            </Image.PreviewGroup>
          </>
        )}
      </Modal>

      {/* MODAL VALIDASI MANUAL */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#fa8c16' }} />
            <span>Perbaiki Nomor Container Manual</span>
          </Space>
        }
        open={validationModalVisible}
        onCancel={() => setValidationModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setValidationModalVisible(false)}>
            Batal
          </Button>,
          <Button 
            key="submit" 
            type="primary" 
            onClick={handleManualValidation}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            Simpan Perbaikan
          </Button>
        ]}
        width={900}
      >
        {validationRecord && (
          <div>
            {ocrResult && (
              <Alert
                message="Hasil OCR dari Gambar"
                description={
                  <div>
                    <Text strong style={{ fontSize: 18 }}>{ocrResult}</Text>
                    {ocrResult !== validationRecord.container_no && (
                      <div style={{ marginTop: 8, color: '#ff4d4f' }}>
                        ⚠️ Berbeda dengan hasil OCR sistem ({validationRecord.container_no})
                      </div>
                    )}
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Row gutter={16}>
              <Col span={12}>
                <Card size="small" title="Hasil OCR (Database)">
                  <Text strong style={{ fontSize: 20, color: '#ff4d4f' }}>
                    {validationRecord.container_no || '-'}
                  </Text>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="Input Manual (BENAR)">
                  <Input
                    size="large"
                    value={manualContainerNo}
                    onChange={(e) => setManualContainerNo(e.target.value.toUpperCase())}
                    placeholder="Masukkan nomor dari gambar"
                    style={{ fontSize: 20, fontFamily: 'monospace' }}
                  />
                </Card>
              </Col>
            </Row>

            <Divider>Gambar Container</Divider>

            <Image.PreviewGroup>
              <Row gutter={[8, 8]}>
                {validationRecord.images.map((img, idx) => (
                  <Col key={idx} span={8}>
                    <Image
                      src={`${API_BASE}/images/${img}`}
                      style={{ height: 150, objectFit: 'contain' }}
                    />
                  </Col>
                ))}
              </Row>
            </Image.PreviewGroup>
          </div>
        )}
      </Modal>

      {/* STYLE ROW */}
      <style>{`
        .row-valid td { background: #f6ffed !important; }
        .row-invalid td { background: #fff1f0 !important; border-left: 4px solid #ff4d4f !important; }
        .row-pending td { background: #e6f7ff !important; }
        .row-valid:hover td { background: #d9f7be !important; }
        .row-invalid:hover td { background: #ffccc7 !important; }
        .row-pending:hover td { background: #bae7ff !important; }
      `}</style>
    </div>
  );
};

export default ContainerValidation;