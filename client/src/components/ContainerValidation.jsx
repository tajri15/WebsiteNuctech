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
  Progress,
  Select,
  Input,
  Divider,
  Badge
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  WarningOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  ScanOutlined,
  EditOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
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
// Validasi format container
// ============================================================
const validateContainerFormat = (containerNo) => {
  if (
    !containerNo ||
    containerNo.trim() === '' ||
    containerNo.toUpperCase().includes('SCAN FAILED') ||
    containerNo.toUpperCase().includes('FAILED')
  ) {
    return { isValid: false, reason: 'empty_or_failed' };
  }

  const singlePattern = /^[A-Z]{4}\d{7}$/;
  const doublePattern  = /^[A-Z]{4}\d{7}\/[A-Z]{4}\d{7}$/;
  const trimmed = containerNo.trim().toUpperCase();

  if (singlePattern.test(trimmed) || doublePattern.test(trimmed)) {
    return { isValid: true, reason: 'valid' };
  }
  return { isValid: false, reason: 'invalid_format' };
};

// ============================================================
// Reason label
// ============================================================
const reasonLabel = (reason) => {
  switch (reason) {
    case 'empty_or_failed': return 'Kosong / Scan Failed';
    case 'invalid_format':  return 'Format Tidak Valid';
    case 'valid':           return 'Valid';
    default:                return reason;
  }
};

// ============================================================
// Levenshtein Distance untuk hitung kemiripan string
// ============================================================
const levenshteinDistance = (a, b) => {
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
};

const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 100;
  const distance = levenshteinDistance(longer, shorter);
  return Math.round(((longer.length - distance) / longer.length) * 100 * 10) / 10;
};

// ============================================================
// Main Component
// ============================================================
const ContainerValidation = () => {
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [messageApi, contextHolder] = message.useMessage();
  
  // State untuk validasi manual
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [validationRecord, setValidationRecord] = useState(null);
  const [manualContainerNo, setManualContainerNo] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [validatingImage, setValidatingImage] = useState(false);

  const [stats, setStats] = useState({
    total: 0, valid: 0, invalid: 0,
    emptyFailed: 0, invalidFormat: 0, validPct: 0,
    matchCount: 0, mismatchCount: 0, manualFixCount: 0
  });

  // ============================================================
  // FUNGSI OCR - BACA TEKS DARI GAMBAR
  // ============================================================
  const extractContainerFromImage = async (imageUrl) => {
    try {
      console.log('🔍 Running OCR on:', imageUrl);
      
      const result = await Tesseract.recognize(
        imageUrl,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`📖 OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );
      
      const text = result.data.text;
      console.log('📝 OCR Result Text:', text);
      
      // Pattern untuk container number: 4 huruf + 7 angka
      // Bisa dengan spasi atau tanpa spasi
      const containerPattern = /\b([A-Z]{4})\s*(\d{7})\b/;
      const match = text.match(containerPattern);
      
      if (match) {
        const containerNumber = match[1] + match[2];
        console.log('✅ Container number detected:', containerNumber);
        return containerNumber;
      }
      
      // Coba pattern alternatif: 4 huruf + spasi + 7 angka
      const altPattern = /\b([A-Z]{4})\s+(\d{7})\b/;
      const altMatch = text.match(altPattern);
      
      if (altMatch) {
        const containerNumber = altMatch[1] + altMatch[2];
        console.log('✅ Container number detected (alt):', containerNumber);
        return containerNumber;
      }
      
      console.log('❌ No container number found in image');
      return null;
      
    } catch (error) {
      console.error('❌ OCR Error:', error);
      return null;
    }
  };

  // ============================================================
  // FUNGSI VALIDASI OTOMATIS - BANDINGKAN OCR DB VS GAMBAR
  // ============================================================
  const validateContainerWithImage = async (record) => {
    if (!record.images || record.images.length === 0) {
      return { 
        match: false, 
        reason: 'Tidak ada gambar',
        similarity: 0,
        containerFromImage: null,
        ocrResult: record.container_no
      };
    }

    // Ambil gambar pertama (biasanya yang paling jelas)
    const firstImage = record.images[0];
    const imageUrl = `${API_BASE}/images/${firstImage}`;
    
    setValidatingImage(true);
    
    try {
      // Baca teks dari gambar
      const containerFromImage = await extractContainerFromImage(imageUrl);
      
      if (!containerFromImage) {
        return { 
          match: false, 
          reason: 'Tidak dapat membaca nomor container dari gambar',
          similarity: 0,
          containerFromImage: null,
          ocrResult: record.container_no
        };
      }

      // Bandingkan dengan OCR result dari database
      const ocrResult = record.container_no || '';
      const isMatch = ocrResult.toUpperCase() === containerFromImage.toUpperCase();
      const similarity = calculateSimilarity(ocrResult, containerFromImage);

      const result = {
        match: isMatch,
        similarity,
        ocrResult,
        containerFromImage,
        reason: isMatch ? 'Sesuai' : `Tidak cocok (${similarity}% mirip)`,
        imageText: containerFromImage
      };

      // Kirim hasil ke backend
      try {
        await axios.post(`${API_BASE}/api/update-validation-result`, {
          scanId: record.id,
          ocrResult: record.container_no,
          imageText: containerFromImage,
          isMatch,
          similarity
        });
        console.log('✅ Validation result saved to database');
      } catch (err) {
        console.error('❌ Failed to save validation result:', err);
      }

      return result;
      
    } catch (error) {
      console.error('❌ Validation error:', error);
      return { 
        match: false, 
        reason: 'Error saat validasi',
        similarity: 0,
        containerFromImage: null,
        ocrResult: record.container_no
      };
    } finally {
      setValidatingImage(false);
    }
  };

  // ============================================================
  // Fetch data dari API
  // ============================================================
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD HH:mm:ss');
      if (dateRange?.[1]) params.endDate   = dateRange[1].format('YYYY-MM-DD HH:mm:ss');

      const res = await axios.get(`${API_BASE}/api/container-validation`, { params });

      const enriched = res.data.data.map((item) => {
        const validation = validateContainerFormat(item.container_no);
        const images = [
          item.image1_path, item.image2_path, item.image3_path,
          item.image4_path, item.image5_path, item.image6_path,
          item.image7_path, item.image8_path,
        ].filter(Boolean);

        return {
          ...item,
          isValid:          validation.isValid,
          validationReason: validation.reason,
          confidence:       validation.isValid ? 95 : 0,
          images,
        };
      });

      setRawData(enriched);
      computeStats(enriched);
      messageApi.success(`${enriched.length} data berhasil dimuat`);
    } catch (err) {
      console.error(err);
      messageApi.error('Gagal memuat data. Pastikan backend berjalan.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, messageApi]);

  // ============================================================
  // Hitung statistik
  // ============================================================
  const computeStats = (data) => {
    const total        = data.length;
    const valid        = data.filter(d => d.isValid).length;
    const invalid      = total - valid;
    const emptyFailed  = data.filter(d => d.validationReason === 'empty_or_failed').length;
    const invalidFmt   = data.filter(d => d.validationReason === 'invalid_format').length;
    const validPct     = total > 0 ? parseFloat(((valid / total) * 100).toFixed(1)) : 0;
    
    // Statistik validasi gambar
    const matchCount = data.filter(d => d.imageValidationStatus === 'MATCH').length;
    const mismatchCount = data.filter(d => d.imageValidationStatus === 'MISMATCH').length;
    const manualFixCount = data.filter(d => d.manual_validated === true).length;
    
    setStats({ 
      total, valid, invalid, 
      emptyFailed, invalidFormat: invalidFmt, validPct,
      matchCount, mismatchCount, manualFixCount
    });
  };

  // ============================================================
  // Filter data
  // ============================================================
  useEffect(() => {
    let d = [...rawData];
    if (selectedStatus === 'valid')   d = d.filter(x => x.isValid);
    if (selectedStatus === 'invalid') d = d.filter(x => !x.isValid);
    if (selectedStatus === 'match') d = d.filter(x => x.imageValidationStatus === 'MATCH');
    if (selectedStatus === 'mismatch') d = d.filter(x => x.imageValidationStatus === 'MISMATCH');
    if (selectedStatus === 'manual') d = d.filter(x => x.manual_validated === true);
    if (selectedStatus === 'unchecked') d = d.filter(x => !x.imageValidationStatus && !x.manual_validated);
    
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      d = d.filter(x =>
        (x.container_no || '').toLowerCase().includes(s) ||
        (x.id_scan || '').toLowerCase().includes(s) ||
        (x.imageTextDetected || '').toLowerCase().includes(s)
      );
    }
    setFilteredData(d);
  }, [rawData, selectedStatus, searchText]);

  // Load data saat mount atau dateRange berubah
  useEffect(() => { fetchData(); }, [fetchData]);

  // ============================================================
  // Export Excel (Invalid only)
  // ============================================================
  const downloadExcel = () => {
    const invalid = filteredData.filter(d => !d.isValid);
    if (!invalid.length) { messageApi.warning('Tidak ada data invalid untuk didownload'); return; }

    const rows = invalid.map((item, i) => ({
      'No':           i + 1,
      'ID Scan':      item.id_scan || '-',
      'Container No (OCR)': item.container_no || '(kosong)',
      'Container No (Gambar)': item.imageTextDetected || '-',
      'Status Validasi': item.imageValidationStatus || 'UNCHECKED',
      'Alasan':       reasonLabel(item.validationReason),
      'Waktu Scan':   dayjs(item.scan_time).format('DD/MM/YYYY HH:mm:ss'),
      'No. Truck':    item.truck_no || '-',
      'Jml Gambar':   item.images.length,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
      { wch: 15 }, { wch: 20 }, { wch: 22 }, { wch: 15 }, { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invalid Containers');
    XLSX.writeFile(wb, `Invalid_Containers_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    messageApi.success('File Excel berhasil didownload');
  };

  // ============================================================
  // Export PDF (Invalid only)
  // ============================================================
  const downloadPDF = () => {
    const invalid = filteredData.filter(d => !d.isValid);
    if (!invalid.length) { messageApi.warning('Tidak ada data invalid untuk didownload'); return; }

    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.setTextColor(220, 53, 69);
    doc.text('Laporan Container Invalid', 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Dicetak: ${dayjs().format('DD/MM/YYYY HH:mm:ss')}`, 14, 25);
    if (dateRange) {
      doc.text(
        `Periode: ${dateRange[0].format('DD/MM/YYYY HH:mm')} — ${dateRange[1].format('DD/MM/YYYY HH:mm')}`,
        14, 30
      );
    }
    doc.text(`Total Invalid: ${invalid.length} container`, 14, 35);

    autoTable(doc, {
      startY: 40,
      head: [['No', 'ID Scan', 'Container No (OCR)', 'Container No (Gambar)', 'Validasi', 'Alasan', 'Waktu Scan']],
      body: invalid.map((item, i) => [
        i + 1,
        item.id_scan || '-',
        item.container_no || '(kosong)',
        item.imageTextDetected || '-',
        item.imageValidationStatus || 'UNCHECKED',
        reasonLabel(item.validationReason),
        dayjs(item.scan_time).format('DD/MM/YYYY HH:mm:ss'),
      ]),
      styles:          { fontSize: 8, cellPadding: 2 },
      headStyles:      { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 245, 245] },
    });

    doc.save(`Invalid_Containers_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`);
    messageApi.success('File PDF berhasil didownload');
  };

  // ============================================================
  // Open Validation Modal
  // ============================================================
  const openValidationModal = async (record) => {
    setValidationRecord(record);
    setManualContainerNo(record.container_no || '');
    setValidationModalVisible(true);
    setValidationResult(null);
    
    // Auto-validate when opening modal
    const result = await validateContainerWithImage(record);
    setValidationResult(result);
  };

  // ============================================================
  // Handle Manual Validation
  // ============================================================
  const handleManualValidation = async () => {
    if (!manualContainerNo.trim()) {
      messageApi.warning('Nomor container tidak boleh kosong');
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/api/manual-container-validation`, {
        scanId: validationRecord.id,
        correctContainerNo: manualContainerNo
      });

      if (response.data.success) {
        messageApi.success('Nomor container berhasil diperbaiki');
        setValidationModalVisible(false);
        fetchData(); // Refresh data
      }
    } catch (err) {
      messageApi.error('Gagal memperbaiki nomor container');
      console.error(err);
    }
  };

  // ============================================================
  // Validate Single Record
  // ============================================================
  const handleValidateRecord = async (record) => {
    const result = await validateContainerWithImage(record);
    if (result.match) {
      messageApi.success(`✅ Container cocok: ${result.containerFromImage}`);
    } else {
      messageApi.warning(`❌ Tidak cocok: OCR="${result.ocrResult}", Gambar="${result.containerFromImage}" (${result.similarity}% mirip)`);
    }
    fetchData(); // Refresh to show new validation status
  };

  // ============================================================
  // Table columns
  // ============================================================
  const columns = [
    {
      title: 'No',
      key: 'no',
      width: 55,
      align: 'center',
      render: (_, __, i) => i + 1,
    },
    {
      title: 'Status Format',
      key: 'status',
      width: 110,
      align: 'center',
      filters: [
        { text: '✅ Valid',   value: true  },
        { text: '❌ Invalid', value: false },
      ],
      onFilter: (val, record) => record.isValid === val,
      render: (_, record) => (
        <Tooltip title={reasonLabel(record.validationReason)}>
          {record.isValid
            ? <Tag icon={<CheckCircleOutlined />} color="success">VALID</Tag>
            : <Tag icon={<CloseCircleOutlined />} color="error">INVALID</Tag>
          }
        </Tooltip>
      ),
    },
    {
      title: 'Validasi Gambar',
      key: 'imageValidation',
      width: 140,
      align: 'center',
      filters: [
        { text: '✅ Cocok', value: 'MATCH' },
        { text: '❌ Tidak Cocok', value: 'MISMATCH' },
        { text: '✏️ Manual Fix', value: 'MANUAL_FIX' },
        { text: '⏳ Belum Cek', value: 'UNCHECKED' },
      ],
      onFilter: (val, record) => {
        if (val === 'MANUAL_FIX') return record.manual_validated === true;
        if (val === 'UNCHECKED') return !record.imageValidationStatus && !record.manual_validated;
        return record.imageValidationStatus === val;
      },
      render: (_, record) => {
        // Priority: Manual Fix > MATCH/MISMATCH > UNCHECKED
        if (record.manual_validated) {
          return (
            <Tooltip title={`Diperbaiki manual: ${record.original_ocr_result || ''} → ${record.container_no}`}>
              <Tag icon={<EditOutlined />} color="warning">
                MANUAL FIX
              </Tag>
            </Tooltip>
          );
        }
        
        if (record.imageValidationStatus === 'MATCH') {
          return (
            <Tooltip title={`Cocok dengan gambar (${record.validation_confidence || 100}%)`}>
              <Tag icon={<CheckCircleOutlined />} color="success">
                COCOK
              </Tag>
            </Tooltip>
          );
        }
        
        if (record.imageValidationStatus === 'MISMATCH') {
          return (
            <Tooltip title={`Tidak cocok: OCR="${record.container_no}", Gambar="${record.imageTextDetected || '?'}" (${record.validation_confidence || 0}% mirip)`}>
              <Tag icon={<CloseCircleOutlined />} color="error">
                TIDAK COCOK
              </Tag>
            </Tooltip>
          );
        }
        
        return (
          <Tooltip title="Belum divalidasi dengan gambar">
            <Tag icon={<QuestionCircleOutlined />} color="default">
              BELUM CEK
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: 'ID Scan',
      dataIndex: 'id_scan',
      key: 'id_scan',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Container No',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 210,
      render: (text, record) => (
        <div>
          <Text
            strong
            style={{ 
              color: record.manual_validated ? '#fa8c16' : (record.isValid ? '#52c41a' : '#ff4d4f'),
              fontSize: 13,
              textDecoration: record.manual_validated ? 'line-through' : 'none'
            }}
          >
            {record.manual_validated ? record.original_ocr_result || text : text}
          </Text>
          {record.manual_validated && (
            <div>
              <Text style={{ color: '#52c41a', fontSize: 12 }}>
                → {record.container_no}
              </Text>
            </div>
          )}
          {!record.isValid && !record.manual_validated && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {reasonLabel(record.validationReason)}
              </Text>
            </div>
          )}
          {record.imageTextDetected && record.imageValidationStatus === 'MISMATCH' && (
            <div>
              <Text type="secondary" style={{ fontSize: 11, color: '#ff4d4f' }}>
                Gambar: {record.imageTextDetected}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Waktu Scan',
      dataIndex: 'scan_time',
      key: 'scan_time',
      width: 175,
      render: t => dayjs(t).format('DD/MM/YYYY HH:mm:ss'),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 130,
      align: 'center',
      sorter: (a, b) => a.confidence - b.confidence,
      render: (pct) => (
        <Progress
          percent={pct}
          size="small"
          status={pct >= 90 ? 'success' : pct >= 70 ? 'normal' : 'exception'}
          format={p => `${p}%`}
          strokeWidth={6}
        />
      ),
    },
    {
      title: 'Gambar',
      key: 'imageCount',
      width: 90,
      align: 'center',
      render: (_, record) => (
        <Badge count={record.images.length} color="#1890ff" showZero>
          <PictureOutlined style={{ fontSize: 18, color: record.images.length ? '#1890ff' : '#ccc' }} />
        </Badge>
      ),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 180,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<ScanOutlined />}
            onClick={() => handleValidateRecord(record)}
            loading={validatingImage}
            disabled={!record.images.length}
          >
            Cek
          </Button>
          <Button
            type="default"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => { setSelectedRecord(record); setImageModalVisible(true); }}
            disabled={!record.images.length}
          >
            Lihat
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openValidationModal(record)}
          >
            Perbaiki
          </Button>
        </Space>
      ),
    },
  ];

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {contextHolder}

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        borderRadius: 12, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: 'rgba(255,77,79,0.2)', border: '1px solid rgba(255,77,79,0.5)',
            borderRadius: 10, padding: 12,
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 28, color: '#ff4d4f' }} />
          </div>
          <div>
            <Title level={3} style={{ color: '#fff', margin: 0 }}>
              Container Validation dengan AUTO DETECT
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
              Validasi otomatis OCR vs Gambar menggunakan Tesseract.js
            </Text>
          </div>
        </div>
      </div>

      {/* ── Statistik Lengkap ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card size="small" style={{ borderRadius: 10, background: '#e6f7ff', border: '1px solid #1890ff30' }}>
            <Statistic
              title={<Text style={{ fontSize: 12 }}>Total Scan</Text>}
              value={stats.total}
              valueStyle={{ color: '#1890ff', fontSize: 22, fontWeight: 700 }}
              prefix={<SearchOutlined />}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card size="small" style={{ borderRadius: 10, background: '#f6ffed', border: '1px solid #52c41a30' }}>
            <Statistic
              title={<Text style={{ fontSize: 12 }}>Format Valid</Text>}
              value={stats.valid}
              valueStyle={{ color: '#52c41a', fontSize: 22, fontWeight: 700 }}
              prefix={<CheckCircleOutlined />}
              suffix={`(${stats.validPct}%)`}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card size="small" style={{ borderRadius: 10, background: '#fff1f0', border: '1px solid #ff4d4f30' }}>
            <Statistic
              title={<Text style={{ fontSize: 12 }}>Format Invalid</Text>}
              value={stats.invalid}
              valueStyle={{ color: '#ff4d4f', fontSize: 22, fontWeight: 700 }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card size="small" style={{ borderRadius: 10, background: '#f6ffed', border: '1px solid #52c41a30' }}>
            <Statistic
              title={<Text style={{ fontSize: 12 }}>✅ Cocok Gambar</Text>}
              value={stats.matchCount}
              valueStyle={{ color: '#52c41a', fontSize: 22, fontWeight: 700 }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card size="small" style={{ borderRadius: 10, background: '#fff1f0', border: '1px solid #ff4d4f30' }}>
            <Statistic
              title={<Text style={{ fontSize: 12 }}>❌ Tidak Cocok</Text>}
              value={stats.mismatchCount}
              valueStyle={{ color: '#ff4d4f', fontSize: 22, fontWeight: 700 }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card size="small" style={{ borderRadius: 10, background: '#fff7e6', border: '1px solid #fa8c1630' }}>
            <Statistic
              title={<Text style={{ fontSize: 12 }}>✏️ Manual Fix</Text>}
              value={stats.manualFixCount}
              valueStyle={{ color: '#fa8c16', fontSize: 22, fontWeight: 700 }}
              prefix={<EditOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Filter & Actions ── */}
      <Card style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: '16px 20px' }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarOutlined style={{ color: '#1890ff' }} />
              <Text strong style={{ whiteSpace: 'nowrap' }}>Periode:</Text>
              <RangePicker
                showTime
                format="DD/MM/YYYY HH:mm"
                style={{ flex: 1 }}
                onChange={setDateRange}
                placeholder={['Tanggal Mulai', 'Tanggal Selesai']}
              />
            </div>
          </Col>
          <Col xs={12} md={5}>
            <Select
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={setSelectedStatus}
            >
              <Option value="all">🔵 Semua Data</Option>
              <Option value="valid">✅ Format Valid</Option>
              <Option value="invalid">❌ Format Invalid</Option>
              <Option value="match">✅ Cocok Gambar</Option>
              <Option value="mismatch">❌ Tidak Cocok</Option>
              <Option value="manual">✏️ Manual Fix</Option>
              <Option value="unchecked">⏳ Belum Validasi</Option>
            </Select>
          </Col>
          <Col xs={12} md={6}>
            <Input
              placeholder="Cari container / ID scan..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} md={3}>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
              block
            >
              Refresh
            </Button>
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button
                icon={<FileExcelOutlined />}
                onClick={downloadExcel}
                style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
              >
                Excel (Invalid)
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={downloadPDF}
                danger
              >
                PDF (Invalid)
              </Button>
            </Space>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Menampilkan <Text strong>{filteredData.length}</Text> dari{' '}
              <Text strong>{rawData.length}</Text> data
              {filteredData.filter(d => !d.isValid).length > 0 && (
                <Text type="danger">
                  {' '}(❌ {filteredData.filter(d => !d.isValid).length} invalid)
                </Text>
              )}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* ── Tabel ── */}
      <Card style={{ borderRadius: 10 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          size="middle"
          scroll={{ x: 1400 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: total => `Total ${total} data`,
          }}
          rowClassName={record => {
            if (record.manual_validated) return 'row-manual';
            if (record.imageValidationStatus === 'MATCH') return 'row-match';
            if (record.imageValidationStatus === 'MISMATCH') return 'row-mismatch';
            return record.isValid ? 'row-valid' : 'row-invalid';
          }}
        />
      </Card>

      {/* ── Modal Gambar ── */}
      <Modal
        title={
          <Space>
            <PictureOutlined style={{ color: '#1890ff' }} />
            <span>
              Gambar Container:{' '}
              <Text strong style={{ color: selectedRecord?.isValid ? '#52c41a' : '#ff4d4f' }}>
                {selectedRecord?.container_no || '(kosong)'}
              </Text>
            </span>
            {selectedRecord && (
              selectedRecord.isValid
                ? <Tag color="success">✅ VALID</Tag>
                : <Tag color="error">❌ INVALID</Tag>
            )}
          </Space>
        }
        open={imageModalVisible}
        onCancel={() => { setImageModalVisible(false); setSelectedRecord(null); }}
        footer={null}
        width={920}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {selectedRecord && (
          <>
            <div style={{
              background: selectedRecord.isValid ? '#f6ffed' : '#fff1f0',
              border: `1px solid ${selectedRecord.isValid ? '#b7eb8f' : '#ffa39e'}`,
              borderRadius: 8, padding: '10px 16px', marginBottom: 16,
            }}>
              <Row gutter={24}>
                <Col span={12}>
                  <Text type="secondary">Container No (OCR): </Text>
                  <Text strong style={{ color: selectedRecord.isValid ? '#52c41a' : '#ff4d4f' }}>
                    {selectedRecord.container_no || '(kosong)'}
                  </Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Status Format: </Text>
                  <Text>{reasonLabel(selectedRecord.validationReason)}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Waktu Scan: </Text>
                  <Text>{dayjs(selectedRecord.scan_time).format('DD/MM/YYYY HH:mm:ss')}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Jumlah Gambar: </Text>
                  <Text strong>{selectedRecord.images.length}</Text>
                </Col>
              </Row>
            </div>

            {selectedRecord.images.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                <PictureOutlined style={{ fontSize: 48 }} />
                <div style={{ marginTop: 12 }}>Tidak ada gambar tersedia</div>
              </div>
            ) : (
              <Image.PreviewGroup>
                <Row gutter={[12, 12]}>
                  {selectedRecord.images.map((img, idx) => (
                    <Col key={idx} xs={24} sm={12} md={8}>
                      <Card
                        size="small"
                        style={{ borderRadius: 8 }}
                        cover={
                          <Image
                            src={`${API_BASE}/images/${img}`}
                            alt={`Gambar ${idx + 1}`}
                            style={{ height: 180, objectFit: 'cover' }}
                            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE0IiBmaWxsPSIjYWFhIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+"
                          />
                        }
                      >
                        <Button 
                          type="link" 
                          size="small"
                          icon={<ScanOutlined />}
                          onClick={async () => {
                            const result = await extractContainerFromImage(`${API_BASE}/images/${img}`);
                            if (result) {
                              Modal.info({
                                title: 'Hasil OCR Gambar',
                                content: (
                                  <div>
                                    <p>Nomor container terdeteksi:</p>
                                    <Text strong style={{ fontSize: 20, color: '#1890ff' }}>{result}</Text>
                                  </div>
                                ),
                              });
                            } else {
                              message.warning('Tidak dapat membaca nomor container');
                            }
                          }}
                        >
                          OCR Gambar
                        </Button>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Image.PreviewGroup>
            )}
          </>
        )}
      </Modal>

      {/* ── Modal Validasi Manual ── */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#fa8c16' }} />
            <span>Validasi Manual Container</span>
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
            icon={<CheckCircleOutlined />}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
          >
            Simpan Perbaikan
          </Button>
        ]}
        width={1000}
      >
        {validationRecord && (
          <div>
            {validationResult && !validationResult.match && (
              <Alert
                message="Ketidaksesuaian Terdeteksi!"
                description={
                  <div>
                    <p><strong>Hasil OCR (Database):</strong> {validationResult.ocrResult || '(kosong)'}</p>
                    <p><strong>Nomor dari Gambar:</strong> {validationResult.containerFromImage || 'Tidak terbaca'}</p>
                    <p><strong>Tingkat Kemiripan:</strong> {validationResult.similarity}%</p>
                    <p style={{ color: '#ff4d4f', marginTop: 8 }}>
                      Nomor container tidak sesuai dengan gambar. Silakan perbaiki secara manual.
                    </p>
                  </div>
                }
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
            
            {validationResult && validationResult.match && (
              <Alert
                message="✅ Container Sudah Sesuai"
                description={`Nomor container ${validationResult.containerFromImage} sudah cocok dengan gambar.`}
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Row gutter={16}>
              <Col span={12}>
                <Card 
                  size="small" 
                  title="Hasil OCR (Database)" 
                  style={{ background: '#fff1f0', borderColor: '#ff4d4f' }}
                >
                  <Text strong style={{ color: '#ff4d4f', fontSize: 24, fontFamily: 'monospace' }}>
                    {validationRecord.container_no || '(kosong)'}
                  </Text>
                  {validationRecord.original_ocr_result && (
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary">Original OCR: </Text>
                      <Text delete>{validationRecord.original_ocr_result}</Text>
                    </div>
                  )}
                </Card>
              </Col>
              
              <Col span={12}>
                <Card 
                  size="small" 
                  title="Perbaikan Manual" 
                  style={{ background: '#f6ffed', borderColor: '#52c41a' }}
                >
                  <Input
                    size="large"
                    value={manualContainerNo}
                    onChange={(e) => setManualContainerNo(e.target.value.toUpperCase())}
                    placeholder="Masukkan nomor container yang benar"
                    style={{ fontSize: 20, fontFamily: 'monospace' }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">Format: 4 huruf + 7 angka (contoh: EMCU8485224)</Text>
                  </div>
                </Card>
              </Col>
            </Row>

            <Divider>
              <Space>
                <ScanOutlined />
                Hasil OCR dari Gambar
              </Space>
            </Divider>

            <Row gutter={[8, 8]}>
              {validationRecord.images.slice(0, 3).map((img, idx) => (
                <Col key={idx} span={8}>
                  <Card
                    size="small"
                    cover={
                      <img
                        src={`${API_BASE}/images/${img}`}
                        style={{ height: 150, objectFit: 'cover' }}
                      />
                    }
                  >
                    <Button 
                      type="link" 
                      size="small"
                      block
                      onClick={async () => {
                        const result = await extractContainerFromImage(`${API_BASE}/images/${img}`);
                        if (result) {
                          setManualContainerNo(result);
                          message.success(`Nomor container dari gambar: ${result}`);
                        }
                      }}
                    >
                      Gunakan Nomor Ini
                    </Button>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Modal>

      {/* ── Global row styles ── */}
      <style>{`
        .row-valid td  { background: #f6ffed !important; }
        .row-invalid td { background: #fff1f0 !important; }
        .row-match td { background: #f6ffed !important; }
        .row-mismatch td { background: #fff1f0 !important; border-left: 4px solid #ff4d4f !important; }
        .row-manual td { background: #fff7e6 !important; border-left: 4px solid #fa8c16 !important; }
        .row-valid:hover td  { background: #d9f7be !important; }
        .row-invalid:hover td { background: #ffccc7 !important; }
        .row-match:hover td { background: #d9f7be !important; }
        .row-mismatch:hover td { background: #ffccc7 !important; }
        .row-manual:hover td { background: #ffe7ba !important; }
      `}</style>
    </div>
  );
};

export default ContainerValidation;