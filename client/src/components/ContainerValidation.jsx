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
  Alert
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
  ScanOutlined
} from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import axios from 'axios';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const API_BASE = 'http://localhost:5000';

// ============================================================
// VALIDASI FORMAT CONTAINER (4 HURUF + 7 ANGKA)
// ============================================================
const isValidFormat = (containerNo) => {
  if (!containerNo) return false;
  
  // Pattern: 4 huruf + 7 angka (contoh: EMCU8485224)
  const pattern = /^[A-Z]{4}\d{7}$/;
  const trimmed = containerNo.trim().toUpperCase();
  
  return pattern.test(trimmed);
};

// ============================================================
// Main Component
// ============================================================
const ContainerValidation = () => {
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, valid, invalid, unchecked
  const [searchText, setSearchText] = useState('');
  const [validationModalVisible, setValidationModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [messageApi, contextHolder] = message.useMessage();

  const [stats, setStats] = useState({
    total: 0,
    valid: 0,      // SESUAI (setelah dicek manual)
    invalid: 0,     // TIDAK SESUAI (termasuk format salah + N/A + Failed)
    unchecked: 0    // BELUM (hanya yang format benar)
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

      // Enrich data
      const enriched = res.data.data.map(item => {
        const images = [
          item.image1_path, item.image2_path, item.image3_path,
          item.image4_path, item.image5_path, item.image6_path,
          item.image7_path, item.image8_path
        ].filter(Boolean);

        // CEK FORMAT
        const formatValid = isValidFormat(item.container_no);
        
        // Tentukan status manual
        let manualStatus = item.manual_status || 'UNCHECKED';
        
        // ============================================================
        // LOGIKA UTAMA:
        // 1. Jika format TIDAK valid (bukan 4 huruf 7 angka) -> LANGSUNG MERAH
        // 2. Jika format valid -> BISA dicek manual (BIRU)
        // ============================================================
        if (!formatValid) {
          manualStatus = 'INVALID';  // Langsung merah tanpa perlu validasi
        }

        return {
          ...item,
          images,
          formatValid,
          manualStatus,
          isAutoInvalid: !formatValid // Otomatis merah karena format salah
        };
      });

      setRawData(enriched);
      
      // Hitung statistik
      const total = enriched.length;
      const valid = enriched.filter(d => d.manualStatus === 'VALID').length;
      const invalid = enriched.filter(d => d.manualStatus === 'INVALID').length;
      const unchecked = enriched.filter(d => d.manualStatus === 'UNCHECKED').length;
      
      setStats({ total, valid, invalid, unchecked });
      
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
    
    if (selectedStatus === 'valid') d = d.filter(x => x.manualStatus === 'VALID');
    if (selectedStatus === 'invalid') d = d.filter(x => x.manualStatus === 'INVALID');
    if (selectedStatus === 'unchecked') d = d.filter(x => x.manualStatus === 'UNCHECKED');
    
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      d = d.filter(x =>
        (x.container_no || '').toLowerCase().includes(s) ||
        (x.id_scan || '').toLowerCase().includes(s)
      );
    }
    
    setFilteredData(d);
  }, [rawData, selectedStatus, searchText]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ============================================================
  // Buka modal validasi (HANYA UNTUK FORMAT VALID)
  // ============================================================
  const openValidationModal = (record) => {
    // Cegah buka modal untuk yang formatnya salah
    if (!record.formatValid) {
      messageApi.info('Data dengan format tidak valid otomatis TIDAK SESUAI');
      return;
    }
    setSelectedRecord(record);
    setValidationModalVisible(true);
  };

  // ============================================================
  // Handle validasi (Sesuai / Tidak Sesuai)
  // ============================================================
  const handleValidation = async (status) => {
    try {
      // Simpan ke database
      await axios.post(`${API_BASE}/api/manual-validation-status`, {
        scanId: selectedRecord.id,
        status: status // 'VALID' atau 'INVALID'
      });

      messageApi.success(`Data ditandai sebagai ${status === 'VALID' ? 'SESUAI' : 'TIDAK SESUAI'}`);
      setValidationModalVisible(false);
      fetchData(); // Refresh data
    } catch (err) {
      messageApi.error('Gagal menyimpan');
      console.error(err);
    }
  };

  // ============================================================
  // Download PDF
  // ============================================================
  const downloadPDF = () => {
    if (!filteredData.length) {
      messageApi.warning('Tidak ada data');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });

    // Header
    doc.setFontSize(16);
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

    // Statistik
    doc.setFontSize(11);
    doc.text('RINGKASAN', 14, 38);
    doc.setFontSize(9);
    doc.text(`Total Data: ${filteredData.length}`, 14, 45);
    doc.text(`✓ Sesuai: ${filteredData.filter(d => d.manualStatus === 'VALID').length}`, 14, 52);
    doc.text(`✗ Tidak Sesuai: ${filteredData.filter(d => d.manualStatus === 'INVALID').length}`, 14, 59);
    doc.text(`⏳ Belum Validasi: ${filteredData.filter(d => d.manualStatus === 'UNCHECKED').length}`, 14, 66);

    // Tabel
    autoTable(doc, {
      startY: 75,
      head: [['No', 'ID Scan', 'Nomor Container', 'Status Validasi', 'Waktu Scan']],
      body: filteredData.map((item, i) => [
        i + 1,
        item.id_scan || '-',
        item.container_no || '-',
        item.manualStatus === 'VALID' ? '✓ SESUAI' : 
        item.manualStatus === 'INVALID' ? '✗ TIDAK SESUAI' : '⏳ BELUM',
        dayjs(item.scan_time).format('DD/MM/YYYY HH:mm')
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 21, 41], textColor: 255 },
      columnStyles: {
        3: { 
          cellWidth: 30,
          halign: 'center',
          cellCallback: (cell, data) => {
            if (cell.raw === '✓ SESUAI') cell.styles.fillColor = [230, 255, 230];
            if (cell.raw === '✗ TIDAK SESUAI') cell.styles.fillColor = [255, 230, 230];
          }
        }
      }
    });

    doc.save(`Validasi_Container_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`);
    messageApi.success('PDF berhasil didownload');
  };

  // ============================================================
  // Table Columns
  // ============================================================
  const columns = [
    {
      title: 'No',
      key: 'no',
      width: 50,
      render: (_, __, i) => i + 1
    },
    {
      title: 'Status Validasi',
      key: 'manualStatus',
      width: 120,
      render: (_, record) => {
        if (record.manualStatus === 'VALID') {
          return <Tag icon={<CheckCircleOutlined />} color="success">✓ SESUAI</Tag>;
        }
        if (record.manualStatus === 'INVALID') {
          // Tooltip berbeda untuk yang format salah vs manual invalid
          if (record.isAutoInvalid) {
            return (
              <Tooltip title="Format tidak valid (bukan 4 huruf + 7 angka)">
                <Tag icon={<CloseCircleOutlined />} color="error">✗ FORMAT SALAH</Tag>
              </Tooltip>
            );
          }
          return <Tag icon={<CloseCircleOutlined />} color="error">✗ TIDAK SESUAI</Tag>;
        }
        return (
          <Tooltip title="Format benar, perlu dicek manual">
            <Tag color="default">⏳ CEK GAMBAR</Tag>
          </Tooltip>
        );
      }
    },
    {
      title: 'ID Scan',
      dataIndex: 'id_scan',
      width: 200,
      ellipsis: true
    },
    {
      title: 'Nomor Container',
      dataIndex: 'container_no',
      width: 180,
      render: (text, record) => {
        // Cek apakah format valid
        const formatValid = isValidFormat(text);
        
        return (
          <div>
            <Text style={{ 
              color: record.manualStatus === 'VALID' ? '#52c41a' : 
                     record.manualStatus === 'INVALID' ? '#ff4d4f' : 'inherit',
              fontWeight: 'bold'
            }}>
              {text || '-'}
            </Text>
            {!formatValid && (
              <div>
                <Text type="danger" style={{ fontSize: 10 }}>
                  ⚠️ Bukan format container
                </Text>
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Waktu Scan',
      dataIndex: 'scan_time',
      width: 150,
      render: t => dayjs(t).format('DD/MM/YYYY HH:mm:ss')
    },
    {
      title: 'Gambar',
      key: 'images',
      width: 70,
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
      width: 100,
      fixed: 'right',
      render: (_, record) => {
        // Tombol validasi hanya untuk yang format valid
        const canValidate = record.formatValid && record.manualStatus !== 'VALID' && record.manualStatus !== 'INVALID';
        
        return (
          <Button
            type="primary"
            size="small"
            icon={<ScanOutlined />}
            onClick={() => openValidationModal(record)}
            disabled={!record.images?.length || !canValidate}
            style={!canValidate ? { background: '#d9d9d9', borderColor: '#d9d9d9' } : {}}
          >
            {record.formatValid ? 'Validasi' : 'Format Salah'}
          </Button>
        );
      }
    }
  ];

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {contextHolder}

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #001529 0%, #002140 100%)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24
      }}>
        <Title level={3} style={{ color: 'white', margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 12 }} />
          Validasi Container
        </Title>
        <Text style={{ color: 'rgba(255,255,255,0.7)' }}>
          • Format SALAH (bukan 4 huruf + 7 angka) → Otomatis MERAH
          • Format BENAR → Bisa dicek manual (SESUAI / TIDAK SESUAI)
        </Text>
      </div>

      {/* Statistik */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Total Scan" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: '#f6ffed' }}>
            <Statistic 
              title="✓ Sesuai" 
              value={stats.valid} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: '#fff1f0' }}>
            <Statistic 
              title="✗ Tidak Sesuai" 
              value={stats.invalid} 
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: '#e6f7ff' }}>
            <Statistic 
              title="⏳ Perlu Cek" 
              value={stats.unchecked} 
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filter */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <RangePicker
              showTime
              format="DD/MM/YYYY HH:mm"
              style={{ width: '100%' }}
              onChange={setDateRange}
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              value={selectedStatus}
              onChange={setSelectedStatus}
            >
              <Option value="all">📋 Semua Data</Option>
              <Option value="valid">✓ Sesuai</Option>
              <Option value="invalid">✗ Tidak Sesuai</Option>
              <Option value="unchecked">⏳ Perlu Cek</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Input
              placeholder="Cari container / ID scan..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchData}
              loading={loading}
              block
            >
              Refresh
            </Button>
          </Col>
          <Col span={4}>
            <Button
              icon={<FilePdfOutlined />}
              onClick={downloadPDF}
              block
            >
              PDF
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Info Alert */}
      <Alert
        message="LOGIKA VALIDASI"
        description={
          <div>
            <p><Tag color="error">✗ FORMAT SALAH</Tag> → Otomatis MERAH (N/A, Failed, atau bukan 4 huruf + 7 angka)</p>
            <p><Tag color="default">⏳ CEK GAMBAR</Tag> → Format BENAR (4 huruf + 7 angka), perlu dicecokkan dengan gambar</p>
            <p><Tag color="success">✓ SESUAI</Tag> → Setelah dicek, nomor cocok dengan gambar</p>
            <p><Tag color="error">✗ TIDAK SESUAI</Tag> → Setelah dicek, nomor TIDAK cocok dengan gambar</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Tabel */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{ pageSize: 20 }}
          rowClassName={record => {
            if (record.manualStatus === 'VALID') return 'row-valid';
            if (record.manualStatus === 'INVALID') return 'row-invalid';
            return '';
          }}
        />
      </Card>

      {/* Modal Validasi (HANYA UNTUK FORMAT VALID) */}
      <Modal
        title={
          <Space>
            <PictureOutlined style={{ color: '#1890ff' }} />
            <span>Validasi Container: {selectedRecord?.container_no || ''}</span>
          </Space>
        }
        open={validationModalVisible}
        onCancel={() => setValidationModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedRecord && (
          <>
            <Alert
              message="Periksa gambar container"
              description="Apakah nomor container pada gambar SESUAI dengan nomor di database?"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={24}>
                <Card size="small" title="Nomor Container (Database)">
                  <Text strong style={{ fontSize: 24, color: '#1890ff' }}>
                    {selectedRecord.container_no || '-'}
                  </Text>
                  {selectedRecord.formatValid && (
                    <Tag color="green" style={{ marginLeft: 8 }}>Format Valid</Tag>
                  )}
                </Card>
              </Col>
            </Row>

            <Divider>Gambar Container</Divider>

            <Image.PreviewGroup>
              <Row gutter={[8, 8]}>
                {selectedRecord.images.map((img, idx) => (
                  <Col key={idx} span={12}>
                    <Image
                      src={`${API_BASE}/images/${img}`}
                      style={{ width: '100%', height: 200, objectFit: 'contain' }}
                    />
                  </Col>
                ))}
              </Row>
            </Image.PreviewGroup>

            <Divider />

            <Row gutter={16} justify="center">
              <Col span={10}>
                <Button
                  size="large"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleValidation('VALID')}
                  style={{ 
                    width: '100%', 
                    height: 50,
                    background: '#52c41a',
                    borderColor: '#52c41a'
                  }}
                >
                  ✓ SESUAI
                </Button>
              </Col>
              <Col span={10}>
                <Button
                  size="large"
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleValidation('INVALID')}
                  style={{ width: '100%', height: 50 }}
                >
                  ✗ TIDAK SESUAI
                </Button>
              </Col>
            </Row>
          </>
        )}
      </Modal>

      <style>{`
        .row-valid td { background: #f6ffed !important; }
        .row-invalid td { background: #fff1f0 !important; }
        .row-valid:hover td { background: #d9f7be !important; }
        .row-invalid:hover td { background: #ffccc7 !important; }
      `}</style>
    </div>
  );
};

export default ContainerValidation;