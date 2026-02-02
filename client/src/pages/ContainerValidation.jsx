import React, { useState, useEffect } from 'react';
import { 
  Table, Card, Row, Col, Typography, Tag, Button, 
  DatePicker, Select, Input, Progress, Modal, Image,
  Alert, Statistic, message, Badge, Tooltip, Space,
  Descriptions, Divider, Spin, Switch, Popconfirm
} from 'antd';
import { 
  CheckCircleOutlined, CloseCircleOutlined, 
  EyeOutlined, FileExcelOutlined, ReloadOutlined,
  SearchOutlined, FilterOutlined, WarningOutlined,
  BarChartOutlined, DownloadOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import moment from 'moment';
import io from 'socket.io-client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;
const socket = io('http://localhost:5000');

const ContainerValidation = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [filters, setFilters] = useState({
    startDate: null,
    endDate: null,
    validationStatus: 'all',
    searchText: '',
  });
  const [stats, setStats] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [revalidating, setRevalidating] = useState(false);

  // Fetch data
  const fetchData = async (params = {}) => {
    setLoading(true);
    try {
      const requestParams = {
        page: params.current || pagination.current,
        pageSize: params.pageSize || pagination.pageSize,
        startDate: filters.startDate,
        endDate: filters.endDate,
      };

      if (filters.searchText) {
        requestParams.search = filters.searchText;
      }

      const response = await axios.get('http://localhost:5000/api/container/invalid', {
        params: requestParams,
      });
      
      setData(response.data.data);
      setPagination({
        current: response.data.page,
        pageSize: response.data.pageSize,
        total: response.data.total,
      });

      console.log('✅ Validation data loaded:', response.data.data.length, 'records');
      
    } catch (error) {
      console.error("❌ Failed to load validation data:", error);
      message.error('Failed to load validation data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      
      const response = await axios.get('http://localhost:5000/api/container/validation-stats', {
        params
      });
      
      setStats(response.data.stats);
    } catch (error) {
      console.error("❌ Failed to load validation stats:", error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchStats();
  }, [filters, pagination.current]);

  // WebSocket listener for validation updates
  useEffect(() => {
    const handleContainerValidated = (data) => {
      console.log('✅ Container validation update:', data);
      message.info(`Container ${data.containerNo} validation: ${data.isValid ? 'Valid' : 'Invalid'}`);
      
      // Refresh data if current scan is in view
      if (data.isValid === false) {
        fetchData();
        fetchStats();
      }
    };

    const handleBatchComplete = (data) => {
      console.log('✅ Batch validation complete:', data);
      message.success(`Batch validation complete: ${data.processed} scans processed`);
      setBatchProcessing(false);
      setBatchProgress(0);
      
      // Refresh data
      fetchData();
      fetchStats();
    };

    const handleBatchProgress = (data) => {
      setBatchProgress(data.progress);
    };

    socket.on('container_validated', handleContainerValidated);
    socket.on('batch_validation_complete', handleBatchComplete);
    socket.on('batch_validation_progress', handleBatchProgress);

    return () => {
      socket.off('container_validated', handleContainerValidated);
      socket.off('batch_validation_complete', handleBatchComplete);
      socket.off('batch_validation_progress', handleBatchProgress);
    };
  }, []);

  // Handle revalidation single scan
  const handleRevalidate = async (record) => {
    try {
      setRevalidating(true);
      message.loading(`Revalidating container ${record.container_no}...`, 0);
      
      const response = await axios.post(`http://localhost:5000/api/container/validate-scan/${record.id}`, {
        forceRevalidate: true
      });
      
      message.destroy();
      
      if (response.data.success) {
        message.success('Container revalidated successfully');
        fetchData();
        fetchStats();
        
        // Show validation result
        if (response.data.validationSummary) {
          const summary = response.data.validationSummary;
          Modal.info({
            title: 'Validation Result',
            content: (
              <div>
                <p><strong>Status:</strong> <Tag color={summary.isValid ? 'green' : 'red'}>{summary.validationStatus}</Tag></p>
                <p><strong>Images Processed:</strong> {summary.successfulImages}/{summary.totalImages}</p>
                <p><strong>Matches:</strong> {summary.matchCount}</p>
                <p><strong>Confidence:</strong> {summary.confidence}%</p>
                <p><strong>Average Similarity:</strong> {summary.avgSimilarity}%</p>
              </div>
            ),
            width: 500,
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Revalidation failed:', error);
      message.destroy();
      message.error(`Revalidation failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setRevalidating(false);
    }
  };

  // Handle batch validation
  const handleBatchValidate = async () => {
    try {
      setBatchProcessing(true);
      setBatchProgress(0);
      
      message.loading('Starting batch validation...', 0);
      
      const response = await axios.post('http://localhost:5000/api/container/batch-validate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: 100,
        revalidate: true
      });
      
      message.destroy();
      
      if (response.data.success) {
        message.success(`Batch validation started: ${response.data.totalScans} scans`);
      }
      
    } catch (error) {
      console.error('❌ Batch validation failed:', error);
      message.destroy();
      message.error(`Batch validation failed: ${error.response?.data?.message || error.message}`);
      setBatchProcessing(false);
    }
  };

  // Handle export
  const handleExport = async (format = 'csv') => {
    try {
      setExporting(true);
      message.loading(`Exporting data as ${format.toUpperCase()}...`, 0);
      
      const params = new URLSearchParams({
        startDate: filters.startDate || '',
        endDate: filters.endDate || '',
        format: format
      });
      
      const exportUrl = `http://localhost:5000/api/container/export-invalid?${params.toString()}`;
      
      const link = document.createElement('a');
      link.href = exportUrl;
      link.target = '_blank';
      link.download = `invalid_containers_${moment().format('YYYYMMDD_HHmmss')}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      message.destroy();
      message.success(`Export started! File will be downloaded shortly.`);
      
    } catch (error) {
      console.error('❌ Export failed:', error);
      message.destroy();
      message.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // Handle date range change
  const handleDateRangeChange = (dates) => {
    if (dates && dates.length === 2) {
      setFilters(prev => ({
        ...prev,
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        startDate: null,
        endDate: null
      }));
    }
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // Show detail modal
  const showDetailModal = (record) => {
    setSelectedRecord(record);
    setDetailModalVisible(true);
  };

  // Render validation status tag
  const renderValidationStatus = (status, isValid) => {
    const statusConfig = {
      'ALL_MATCH': { color: 'green', text: 'All Match', icon: <CheckCircleOutlined /> },
      'PARTIAL_MATCH': { color: 'orange', text: 'Partial Match', icon: <WarningOutlined /> },
      'MISMATCH': { color: 'red', text: 'Mismatch', icon: <CloseCircleOutlined /> },
      'OCR_FAILED': { color: 'volcano', text: 'OCR Failed', icon: <CloseCircleOutlined /> },
      'NO_IMAGES': { color: 'default', text: 'No Images', icon: <InfoCircleOutlined /> },
      'NOT_VALIDATED': { color: 'default', text: 'Not Validated', icon: <InfoCircleOutlined /> },
    };
    
    const config = statusConfig[status] || { color: 'default', text: status, icon: <InfoCircleOutlined /> };
    
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // Table columns
  const columns = [
    {
      title: 'NO.',
      key: 'no',
      width: 60,
      render: (_, record, index) => {
        const current = pagination.current || 1;
        const pageSize = pagination.pageSize || 10;
        return (current - 1) * pageSize + index + 1;
      },
    },
    {
      title: 'ID SCAN',
      dataIndex: 'id_scan',
      key: 'id_scan',
      width: 150,
      render: (text) => (
        <Text code style={{ fontSize: '12px' }}>
          {text || 'N/A'}
        </Text>
      ),
    },
    {
      title: 'CONTAINER NO',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 180,
      render: (text, record) => {
        const isValid = record.is_valid_container;
        return (
          <div>
            <Text 
              strong 
              style={{ 
                color: isValid ? '#52c41a' : '#ff4d4f',
                fontSize: '14px',
                fontFamily: 'monospace'
              }}
            >
              {text || 'N/A'}
            </Text>
            {record.validation_status && (
              <div style={{ marginTop: 4 }}>
                {renderValidationStatus(record.validation_status, isValid)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'SCAN TIME',
      dataIndex: 'scan_time',
      key: 'scan_time',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? moment(text).format('DD/MM/YYYY HH:mm:ss') : '-'}
        </Text>
      ),
      sorter: (a, b) => new Date(a.scan_time) - new Date(b.scan_time),
    },
    {
      title: 'VALIDATION TIME',
      dataIndex: 'validation_time',
      key: 'validation_time',
      width: 180,
      render: (text) => (
        <Text style={{ fontSize: '12px' }}>
          {text ? moment(text).format('DD/MM/YYYY HH:mm:ss') : 'Not validated'}
        </Text>
      ),
    },
    {
      title: 'STATUS',
      dataIndex: 'validation_status',
      key: 'validation_status',
      width: 150,
      render: (status, record) => {
        const isValid = record.is_valid_container;
        return renderValidationStatus(status, isValid);
      },
      filters: [
        { text: 'All Match', value: 'ALL_MATCH' },
        { text: 'Partial Match', value: 'PARTIAL_MATCH' },
        { text: 'Mismatch', value: 'MISMATCH' },
        { text: 'OCR Failed', value: 'OCR_FAILED' },
        { text: 'No Images', value: 'NO_IMAGES' },
        { text: 'Not Validated', value: 'NOT_VALIDATED' },
      ],
      onFilter: (value, record) => record.validation_status === value,
    },
    {
      title: 'IMAGES',
      key: 'images',
      width: 100,
      render: (_, record) => {
        let imageCount = 0;
        for (let i = 1; i <= 6; i++) {
          if (record[`image${i}_path`]) imageCount++;
        }
        
        let validationResult = {};
        try {
          validationResult = record.validation_result ? JSON.parse(record.validation_result) : {};
        } catch (e) {}
        
        const processedImages = validationResult.validationSummary?.successfulImages || 0;
        
        return (
          <div>
            <Badge 
              count={imageCount} 
              showZero 
              style={{ 
                backgroundColor: processedImages === imageCount ? '#52c41a' : 
                               processedImages > 0 ? '#faad14' : '#d9d9d9'
              }}
            />
            {validationResult.validationSummary && (
              <div style={{ fontSize: '10px', marginTop: 4 }}>
                <Text type="secondary">
                  {processedImages}/{imageCount} processed
                </Text>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View details">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => showDetailModal(record)}
            >
              Details
            </Button>
          </Tooltip>
          
          <Popconfirm
            title="Revalidate this container?"
            description="This will process all images again using OCR."
            onConfirm={() => handleRevalidate(record)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="default"
              size="small"
              icon={<ReloadOutlined />}
              loading={revalidating}
            >
              Revalidate
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Detail Modal Component
  const renderDetailModal = () => {
    if (!selectedRecord) return null;
    
    let validationResult = {};
    try {
      validationResult = selectedRecord.validation_result ? JSON.parse(selectedRecord.validation_result) : {};
    } catch (e) {
      validationResult = {};
    }
    
    const images = [];
    for (let i = 1; i <= 6; i++) {
      const path = selectedRecord[`image${i}_path`];
      if (path) {
        images.push({
          number: i,
          path: path,
          fullPath: `http://localhost:5000/images${path}`
        });
      }
    }
    
    return (
      <Modal
        title={`Container Validation Details: ${selectedRecord.container_no}`}
        visible={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={1200}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>
        ]}
      >
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card title="Scan Information" size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="ID Scan">
                  <Text code>{selectedRecord.id_scan}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Container No">
                  <Text strong style={{ fontSize: '16px' }}>
                    {selectedRecord.container_no}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Truck No">
                  {selectedRecord.truck_no || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Scan Time">
                  {moment(selectedRecord.scan_time).format('DD/MM/YYYY HH:mm:ss')}
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={selectedRecord.status === 'OK' ? 'green' : 'red'}>
                    {selectedRecord.status}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>
            
            <Card title="Validation Summary" size="small" style={{ marginTop: 16 }}>
              {validationResult.validationSummary ? (
                <div>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Validation Status">
                      {renderValidationStatus(
                        validationResult.validationSummary.validationStatus,
                        validationResult.validationSummary.isValid
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Is Valid">
                      <Tag color={validationResult.validationSummary.isValid ? 'green' : 'red'}>
                        {validationResult.validationSummary.isValid ? 'YES' : 'NO'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Total Images">
                      {validationResult.validationSummary.totalImages}
                    </Descriptions.Item>
                    <Descriptions.Item label="Successfully Processed">
                      {validationResult.validationSummary.successfulImages}
                    </Descriptions.Item>
                    <Descriptions.Item label="Matching Images">
                      {validationResult.validationSummary.matchCount}
                    </Descriptions.Item>
                    <Descriptions.Item label="Confidence">
                      <Progress 
                        percent={parseFloat(validationResult.validationSummary.confidence)} 
                        size="small"
                        strokeColor={{
                          '0%': '#ff4d4f',
                          '100%': '#52c41a',
                        }}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Average Similarity">
                      <Progress 
                        percent={validationResult.validationSummary.avgSimilarity} 
                        size="small"
                      />
                    </Descriptions.Item>
                  </Descriptions>
                  
                  {validationResult.validationSummary.reason && (
                    <Alert
                      message="Validation Issue"
                      description={validationResult.validationSummary.reason}
                      type="warning"
                      showIcon
                      style={{ marginTop: 12 }}
                    />
                  )}
                </div>
              ) : (
                <Alert
                  message="Not Validated"
                  description="This container has not been validated yet."
                  type="info"
                  showIcon
                />
              )}
            </Card>
          </Col>
          
          <Col span={12}>
            <Card title="Images & OCR Results" size="small">
              {images.length > 0 ? (
                <div>
                  <Row gutter={[8, 8]}>
                    {images.map(img => {
                      const imageResult = validationResult.imageResults?.find(
                        r => r.imageNumber === img.number
                      );
                      
                      return (
                        <Col span={12} key={img.number}>
                          <Card 
                            size="small" 
                            style={{ 
                              border: imageResult?.match ? 
                                '2px solid #52c41a' : 
                                '1px solid #d9d9d9'
                            }}
                          >
                            <div style={{ textAlign: 'center' }}>
                              <Image
                                width={120}
                                height={90}
                                src={img.fullPath}
                                style={{ 
                                  objectFit: 'cover',
                                  borderRadius: 4,
                                }}
                                placeholder={
                                  <div style={{ 
                                    width: 120, 
                                    height: 90, 
                                    background: '#f5f5f5',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    <Text type="secondary">Loading...</Text>
                                  </div>
                                }
                              />
                              <div style={{ marginTop: 8 }}>
                                <Text strong>Image {img.number}</Text>
                                {imageResult && (
                                  <div style={{ marginTop: 4 }}>
                                    <Tag 
                                      color={imageResult.match ? 'green' : 'red'}
                                      size="small"
                                    >
                                      {imageResult.match ? 'MATCH' : 'NO MATCH'}
                                    </Tag>
                                    {imageResult.similarity && (
                                      <div style={{ fontSize: '10px' }}>
                                        Similarity: {imageResult.similarity}%
                                      </div>
                                    )}
                                    {imageResult.ocrResult?.primaryContainer && (
                                      <div style={{ fontSize: '10px', marginTop: 2 }}>
                                        OCR: {imageResult.ocrResult.primaryContainer}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                  
                  {validationResult.imageResults && (
                    <div style={{ marginTop: 16 }}>
                      <Title level={5} style={{ marginBottom: 8 }}>OCR Details:</Title>
                      {validationResult.imageResults
                        .filter(r => r.processed && r.ocrResult)
                        .map(r => (
                          <Alert
                            key={r.imageNumber}
                            message={`Image ${r.imageNumber}: ${r.ocrResult.containers.join(', ') || 'No container found'}`}
                            type={r.match ? 'success' : 'error'}
                            showIcon
                            style={{ marginBottom: 8 }}
                            size="small"
                          />
                        ))
                      }
                    </div>
                  )}
                </div>
              ) : (
                <Alert
                  message="No Images"
                  description="No images available for this scan."
                  type="warning"
                  showIcon
                />
              )}
            </Card>
          </Col>
        </Row>
      </Modal>
    );
  };

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, color: '#1890ff', display: 'flex', alignItems: 'center' }}>
          <BarChartOutlined style={{ marginRight: 12 }} />
          Container Validation
        </Title>
        <Text type="secondary">
          Validate container numbers against OCR results from images
        </Text>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Scans"
                value={stats.total}
                prefix={<BarChartOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Valid Containers"
                value={stats.valid}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {stats.validationRate}% validation rate
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Invalid Containers"
                value={stats.invalid}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {stats.accuracyRate}% accuracy rate
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      {/* Filter Section */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Text strong>Filter by Date:</Text>
          </Col>
          <Col>
            <RangePicker
              onChange={handleDateRangeChange}
              style={{ width: 300 }}
            />
          </Col>
          <Col>
            <Input
              placeholder="Search container or ID scan..."
              prefix={<SearchOutlined />}
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              style={{ width: 250 }}
            />
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<FilterOutlined />}
              onClick={() => {
                fetchData();
                fetchStats();
              }}
            >
              Apply Filters
            </Button>
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              <Button
                type="default"
                icon={<ReloadOutlined />}
                onClick={handleBatchValidate}
                loading={batchProcessing}
                disabled={batchProcessing}
              >
                {batchProcessing ? `Processing... ${batchProgress}%` : 'Batch Validate'}
              </Button>
              
              <Button
                type="default"
                icon={<FileExcelOutlined />}
                onClick={() => handleExport('csv')}
                loading={exporting}
              >
                Export CSV
              </Button>
              
              <Button
                type="default"
                icon={<DownloadOutlined />}
                onClick={() => handleExport('excel')}
                loading={exporting}
              >
                Export Excel
              </Button>
            </Space>
          </Col>
        </Row>
        
        {/* Batch Progress */}
        {batchProcessing && (
          <div style={{ marginTop: 16 }}>
            <Alert
              message="Batch Validation in Progress"
              description={`Processing scans... ${batchProgress}% complete`}
              type="info"
              showIcon
            />
            <Progress 
              percent={batchProgress} 
              status="active"
              style={{ marginTop: 8 }}
            />
          </div>
        )}
      </Card>

      {/* Main Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `Showing ${range[0]}-${range[1]} of ${total} invalid containers`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={(newPagination) => {
            setPagination(newPagination);
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* Detail Modal */}
      {renderDetailModal()}

      {/* Information Alert */}
      <Alert
        message="Validation Information"
        description={
          <div>
            <p><strong>Green (Valid):</strong> Container number matches OCR results from images</p>
            <p><strong>Red (Invalid):</strong> Container number does not match OCR results or OCR failed</p>
            <p><strong>Batch Validation:</strong> Process multiple scans at once. This may take several minutes.</p>
            <p><strong>Revalidate:</strong> Process images again to get updated OCR results.</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginTop: 24, borderRadius: 8 }}
      />
    </div>
  );
};

export default ContainerValidation;