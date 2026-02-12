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
  CalendarOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import axios from 'axios';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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
// Main Component
// ============================================================
const ContainerValidation = () => {
  const [loading,             setLoading]             = useState(false);
  const [rawData,             setRawData]             = useState([]);
  const [filteredData,        setFilteredData]        = useState([]);
  const [dateRange,           setDateRange]           = useState(null);
  const [selectedStatus,      setSelectedStatus]      = useState('all');
  const [searchText,          setSearchText]          = useState('');
  const [imageModalVisible,   setImageModalVisible]   = useState(false);
  const [selectedRecord,      setSelectedRecord]      = useState(null);
  const [messageApi,          contextHolder]          = message.useMessage();

  const [stats, setStats] = useState({
    total: 0, valid: 0, invalid: 0,
    emptyFailed: 0, invalidFormat: 0, validPct: 0
  });

  // ----------------------------------------------------------
  // Fetch data dari API
  // ----------------------------------------------------------
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

  // ----------------------------------------------------------
  // Hitung statistik
  // ----------------------------------------------------------
  const computeStats = (data) => {
    const total        = data.length;
    const valid        = data.filter(d => d.isValid).length;
    const invalid      = total - valid;
    const emptyFailed  = data.filter(d => d.validationReason === 'empty_or_failed').length;
    const invalidFmt   = data.filter(d => d.validationReason === 'invalid_format').length;
    const validPct     = total > 0 ? parseFloat(((valid / total) * 100).toFixed(1)) : 0;
    setStats({ total, valid, invalid, emptyFailed, invalidFormat: invalidFmt, validPct });
  };

  // ----------------------------------------------------------
  // Filter data
  // ----------------------------------------------------------
  useEffect(() => {
    let d = [...rawData];
    if (selectedStatus === 'valid')   d = d.filter(x => x.isValid);
    if (selectedStatus === 'invalid') d = d.filter(x => !x.isValid);
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase();
      d = d.filter(x =>
        (x.container_no || '').toLowerCase().includes(s) ||
        (x.id_scan || '').toLowerCase().includes(s)
      );
    }
    setFilteredData(d);
  }, [rawData, selectedStatus, searchText]);

  // Load data saat mount atau dateRange berubah
  useEffect(() => { fetchData(); }, [fetchData]);

  // ----------------------------------------------------------
  // Export Excel
  // ----------------------------------------------------------
  const downloadExcel = () => {
    const invalid = filteredData.filter(d => !d.isValid);
    if (!invalid.length) { messageApi.warning('Tidak ada data invalid untuk didownload'); return; }

    const rows = invalid.map((item, i) => ({
      'No':           i + 1,
      'ID Scan':      item.id_scan || '-',
      'Container No': item.container_no || '(kosong)',
      'Alasan':       reasonLabel(item.validationReason),
      'Waktu Scan':   dayjs(item.scan_time).format('DD/MM/YYYY HH:mm:ss'),
      'No. Truck':    item.truck_no || '-',
      'Jml Gambar':   item.images.length,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 22 }, { wch: 20 },
      { wch: 22 }, { wch: 15 }, { wch: 12 },
    ];

    // Style header
    const headerRange = XLSX.utils.decode_range(ws['!ref']);
    for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'FF4D4F' } } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invalid Containers');
    XLSX.writeFile(wb, `Invalid_Containers_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    messageApi.success('File Excel berhasil didownload');
  };

  // ----------------------------------------------------------
  // Export PDF
  // ----------------------------------------------------------
  const downloadPDF = () => {
    const invalid = filteredData.filter(d => !d.isValid);
    if (!invalid.length) { messageApi.warning('Tidak ada data invalid untuk didownload'); return; }

    const doc = new jsPDF({ orientation: 'landscape' });

    // Header
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
      head: [['No', 'ID Scan', 'Container No', 'Alasan', 'Waktu Scan', 'No. Truck', 'Jml Gambar']],
      body: invalid.map((item, i) => [
        i + 1,
        item.id_scan || '-',
        item.container_no || '(kosong)',
        reasonLabel(item.validationReason),
        dayjs(item.scan_time).format('DD/MM/YYYY HH:mm:ss'),
        item.truck_no || '-',
        item.images.length,
      ]),
      styles:          { fontSize: 8, cellPadding: 2 },
      headStyles:      { fillColor: [220, 53, 69], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 245, 245] },
      columnStyles:    { 0: { halign: 'center', cellWidth: 10 }, 6: { halign: 'center' } },
    });

    doc.save(`Invalid_Containers_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`);
    messageApi.success('File PDF berhasil didownload');
  };

  // ----------------------------------------------------------
  // Table columns
  // ----------------------------------------------------------
  const columns = [
    {
      title: 'No',
      key: 'no',
      width: 55,
      align: 'center',
      render: (_, __, i) => i + 1,
    },
    {
      title: 'Status',
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
            style={{ color: record.isValid ? '#52c41a' : '#ff4d4f', fontSize: 13 }}
          >
            {text || <Text type="secondary" italic>(kosong)</Text>}
          </Text>
          {!record.isValid && (
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {reasonLabel(record.validationReason)}
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
      width: 95,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          disabled={!record.images.length}
          onClick={() => { setSelectedRecord(record); setImageModalVisible(true); }}
        >
          Lihat
        </Button>
      ),
    },
  ];

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
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
            <Title level={3} style={{ color: '#fff', margin: 0 }}>Container Validation</Title>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
              Validasi nomor container berdasarkan hasil OCR dari gambar scan
            </Text>
          </div>
        </div>
      </div>

      {/* ── Statistik ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          {
            title: 'Total Scan',
            value: stats.total,
            icon: <SearchOutlined />,
            color: '#1890ff',
            bg: '#e6f7ff',
          },
          {
            title: 'Valid',
            value: stats.valid,
            icon: <CheckCircleOutlined />,
            color: '#52c41a',
            bg: '#f6ffed',
            suffix: `(${stats.validPct}%)`,
          },
          {
            title: 'Invalid',
            value: stats.invalid,
            icon: <CloseCircleOutlined />,
            color: '#ff4d4f',
            bg: '#fff1f0',
            suffix: `(${stats.total ? (100 - stats.validPct).toFixed(1) : 0}%)`,
          },
          {
            title: 'Kosong / Failed',
            value: stats.emptyFailed,
            icon: <ExclamationCircleOutlined />,
            color: '#fa8c16',
            bg: '#fff7e6',
          },
          {
            title: 'Format Salah',
            value: stats.invalidFormat,
            icon: <WarningOutlined />,
            color: '#722ed1',
            bg: '#f9f0ff',
          },
        ].map((s, i) => (
          <Col key={i} xs={24} sm={12} md={8} lg={6} xl={4}>
            <Card
              size="small"
              style={{ borderRadius: 10, background: s.bg, border: `1px solid ${s.color}30` }}
              bodyStyle={{ padding: '16px 20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  background: `${s.color}20`, borderRadius: 8, padding: 8, color: s.color, fontSize: 20,
                }}>
                  {s.icon}
                </div>
                <Statistic
                  title={<Text style={{ fontSize: 12 }}>{s.title}</Text>}
                  value={s.value}
                  valueStyle={{ color: s.color, fontSize: 22, fontWeight: 700 }}
                  suffix={s.suffix && <Text style={{ fontSize: 12, color: s.color }}>{s.suffix}</Text>}
                />
              </div>
            </Card>
          </Col>
        ))}

        {/* Accuracy Gauge */}
        <Col xs={24} sm={12} md={8} lg={6} xl={4}>
          <Card
            size="small"
            style={{ borderRadius: 10, textAlign: 'center', border: '1px solid #d9d9d9' }}
            bodyStyle={{ padding: '12px 20px' }}
          >
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              Accuracy Rate
            </Text>
            <Progress
              type="circle"
              percent={stats.validPct}
              width={70}
              strokeColor={stats.validPct >= 90 ? '#52c41a' : stats.validPct >= 70 ? '#faad14' : '#ff4d4f'}
              format={p => (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{p}%</span>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Filter & Actions ── */}
      <Card
        style={{ marginBottom: 16, borderRadius: 10 }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={10}>
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
              options={[
                { label: '🔵 Semua', value: 'all' },
                { label: '✅ Valid', value: 'valid' },
                { label: '❌ Invalid', value: 'invalid' },
              ]}
            />
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
          scroll={{ x: 1100 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: total => `Total ${total} data`,
          }}
          rowClassName={record => record.isValid ? 'row-valid' : 'row-invalid'}
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
                  <Text type="secondary">Container No: </Text>
                  <Text strong style={{ color: selectedRecord.isValid ? '#52c41a' : '#ff4d4f' }}>
                    {selectedRecord.container_no || '(kosong)'}
                  </Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Alasan: </Text>
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
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          📷 Gambar {idx + 1} — {img.split('/').pop() || img}
                        </Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Image.PreviewGroup>
            )}
          </>
        )}
      </Modal>

      {/* ── Global row styles ── */}
      <style>{`
        .row-valid td  { background: #f6ffed !important; }
        .row-invalid td { background: #fff1f0 !important; }
        .row-valid:hover td  { background: #d9f7be !important; }
        .row-invalid:hover td { background: #ffccc7 !important; }
      `}</style>
    </div>
  );
};

export default ContainerValidation;